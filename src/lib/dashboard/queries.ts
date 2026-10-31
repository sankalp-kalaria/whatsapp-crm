import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysAgoStart,
  DOW_SHORT_MON_FIRST,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
} from './date-utils'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  LeadSentCount,
  MetricsBundle,
  PeriodSentStats,
  PipelineDonutData,
  PipelineStageSlice,
  ResponseTimeBucket,
  ResponseTimeSummary,
  SentMessagesSummary,
} from './types'
import { getT } from '@/lib/i18n/translate'

/** Broadcast statuses with a translated label in the activity feed. */
const BROADCAST_STATUS_KEYS = new Set(['draft', 'scheduled', 'sending', 'sent', 'failed'])

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// ------------------------------------------------------------
// All client-side aggregation. RLS scopes every query to the
// signed-in user automatically, so we never pass user_id explicitly
// here.
// ------------------------------------------------------------

type DB = SupabaseClient

interface OutgoingMessageRow {
  id: string
  conversation_id: string
  sender_type: string
  created_at: string
  conversations?:
    | {
        contact_id?: string | null
        contacts?:
          | { name: string | null; phone: string }[]
          | { name: string | null; phone: string }
          | null
      }[]
    | {
        contact_id?: string | null
        contacts?:
          | { name: string | null; phone: string }[]
          | { name: string | null; phone: string }
          | null
      }
    | null
}

function buildPeriodStats(
  key: string,
  label: string,
  rows: OutgoingMessageRow[],
): PeriodSentStats {
  let totalSent = 0
  let botSent = 0
  let agentSent = 0
  const byLead = new Map<string, LeadSentCount>()

  for (const r of rows) {
    totalSent += 1
    const isBot = r.sender_type === 'bot'
    if (isBot) botSent += 1
    else agentSent += 1

    const convId = r.conversation_id || 'unknown'
    let entry = byLead.get(convId)
    if (!entry) {
      const convObj = Array.isArray(r.conversations)
        ? r.conversations[0]
        : r.conversations
      const contactObj = Array.isArray(convObj?.contacts)
        ? convObj?.contacts[0]
        : convObj?.contacts
      const leadName = contactObj?.name || contactObj?.phone || 'Lead'
      const leadPhone = contactObj?.phone || ''
      entry = {
        conversationId: convId,
        leadName,
        leadPhone,
        totalSent: 0,
        botSent: 0,
        agentSent: 0,
      }
      byLead.set(convId, entry)
    }

    entry.totalSent += 1
    if (isBot) entry.botSent += 1
    else entry.agentSent += 1
  }

  const leadsBreakdown = Array.from(byLead.values()).sort(
    (a, b) => b.totalSent - a.totalSent,
  )

  return {
    key,
    label,
    totalSent,
    botSent,
    agentSent,
    leadsCount: leadsBreakdown.length,
    leadsBreakdown,
  }
}

export async function loadSentMessagesSummary(
  db: DB,
): Promise<SentMessagesSummary> {
  const { data } = await db
    .from('messages')
    .select(
      'id, conversation_id, sender_type, created_at, conversations(contact_id, contacts(name, phone))',
    )
    .neq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(5000)

  const rows = ((data ?? []) as unknown as OutgoingMessageRow[]).filter(
    (r) => r.sender_type === 'bot' || r.sender_type === 'agent',
  )

  const todayStart = startOfLocalDay()
  const todayRows = rows.filter((r) => new Date(r.created_at) >= todayStart)

  // Generate last 12 months keys (YYYY-MM) in descending order
  const now = new Date()
  const monthKeysSet = new Set<string>()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthKeysSet.add(ym)
  }

  const rowsByMonth = new Map<string, OutgoingMessageRow[]>()
  for (const r of rows) {
    const d = new Date(r.created_at)
    if (Number.isNaN(d.getTime())) continue
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthKeysSet.add(ym)
    const list = rowsByMonth.get(ym) ?? []
    list.push(r)
    rowsByMonth.set(ym, list)
  }

  const sortedMonthKeys = Array.from(monthKeysSet).sort((a, b) =>
    a > b ? -1 : a < b ? 1 : 0,
  )

  const months: PeriodSentStats[] = sortedMonthKeys.map((ym) => {
    const [yStr, mStr] = ym.split('-')
    const monthIndex = Math.max(0, Math.min(11, parseInt(mStr, 10) - 1))
    const label = `${MONTH_NAMES[monthIndex]} ${yStr}`
    return buildPeriodStats(ym, label, rowsByMonth.get(ym) ?? [])
  })

  return {
    allTime: buildPeriodStats('all', 'All Time (Total Sent)', rows),
    today: buildPeriodStats('today', 'Today', todayRows),
    months,
  }
}

// --- 1. Metric cards ---------------------------------------------------

export async function loadMetrics(db: DB): Promise<MetricsBundle> {
  const todayStart = startOfLocalDay().toISOString()
  const yesterdayStart = daysAgoStart(1).toISOString()

  const [
    openConvCur,
    newConvToday,
    newConvYesterday,
    newContactsToday,
    newContactsYesterday,
    openDeals,
    messagesToday,
    messagesYesterday,
    sentSummary,
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', todayStart),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('contacts').select('id', { count: 'exact', head: true }).gte('created_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('deals').select('value, status').eq('status', 'open'),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .neq('sender_type', 'customer')
      .gte('created_at', todayStart),
    db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .neq('sender_type', 'customer')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    loadSentMessagesSummary(db),
  ])

  const openDealsRows = (openDeals.data ?? []) as { value: number | null }[]
  const openDealsValue = openDealsRows.reduce((sum, d) => sum + (d.value ?? 0), 0)

  return {
    activeConversations: {
      current: openConvCur.count ?? 0,
      previous: (newConvToday.count ?? 0) - (newConvYesterday.count ?? 0),
    },
    newContactsToday: {
      current: newContactsToday.count ?? 0,
      previous: newContactsYesterday.count ?? 0,
    },
    openDealsValue,
    openDealsCount: openDealsRows.length,
    messagesSentToday: {
      current: messagesToday.count ?? 0,
      previous: messagesYesterday.count ?? 0,
    },
    sentSummary,
  }
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  rangeDays: number,
): Promise<ConversationsSeriesPoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('created_at, sender_type')
    .gte('created_at', start)
    .order('created_at', { ascending: true })
  if (error) throw error

  const keys = lastNDayKeys(rangeDays)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    else bucket.outgoing += 1 // agent + bot both count as outgoing
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}

// --- 3. Pipeline donut -------------------------------------------------

export async function loadPipelineDonut(db: DB): Promise<PipelineDonutData> {
  const [stagesRes, dealsRes] = await Promise.all([
    db.from('pipeline_stages').select('id, name, color, pipeline_id, position').order('position'),
    db.from('deals').select('stage_id, value, status').eq('status', 'open'),
  ])

  const stages =
    (stagesRes.data ?? []) as { id: string; name: string; color: string }[]
  const deals = (dealsRes.data ?? []) as { stage_id: string; value: number | null }[]

  const byStage = new Map<string, { count: number; total: number }>()
  for (const d of deals) {
    const row = byStage.get(d.stage_id) ?? { count: 0, total: 0 }
    row.count += 1
    row.total += d.value ?? 0
    byStage.set(d.stage_id, row)
  }

  const slices: PipelineStageSlice[] = stages
    .map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color || '#64748b',
      dealCount: byStage.get(s.id)?.count ?? 0,
      totalValue: byStage.get(s.id)?.total ?? 0,
    }))
    .filter((s) => s.totalValue > 0 || s.dealCount > 0)

  return {
    stages: slices,
    totalValue: slices.reduce((sum, s) => sum + s.totalValue, 0),
  }
}

// --- 4. Response time by day of week ----------------------------------

export async function loadResponseTime(db: DB): Promise<ResponseTimeSummary> {
  const fourteenDaysAgo = daysAgoStart(13).toISOString()
  const { data, error } = await db
    .from('messages')
    .select('conversation_id, sender_type, created_at')
    .gte('created_at', fourteenDaysAgo)
    .order('conversation_id', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error

  const rows = (data ?? []) as {
    conversation_id: string
    sender_type: string
    created_at: string
  }[]

  interface Sample {
    customerAt: Date
    responseAt: Date
  }
  const samples: Sample[] = []

  let currentConv = ''
  let pendingCustomer: Date | null = null
  for (const row of rows) {
    if (row.conversation_id !== currentConv) {
      currentConv = row.conversation_id
      pendingCustomer = null
    }
    const ts = new Date(row.created_at)
    if (row.sender_type === 'customer') {
      if (!pendingCustomer) pendingCustomer = ts
    } else if (pendingCustomer) {
      samples.push({ customerAt: pendingCustomer, responseAt: ts })
      pendingCustomer = null
    }
  }

  const now = new Date()
  const thisWeekStart = daysAgoStart(mondayIndex(now))
  const lastWeekStart = daysAgoStart(mondayIndex(now) + 7)

  const byDow = new Map<number, number[]>()
  for (let i = 0; i < 7; i++) byDow.set(i, [])
  const thisWeekMins: number[] = []
  const lastWeekMins: number[] = []

  for (const s of samples) {
    const diffMin = (s.responseAt.getTime() - s.customerAt.getTime()) / 60_000
    if (diffMin < 0) continue
    const dow = mondayIndex(s.customerAt)
    byDow.get(dow)!.push(diffMin)
    if (s.customerAt >= thisWeekStart) {
      thisWeekMins.push(diffMin)
    } else if (s.customerAt >= lastWeekStart && s.customerAt < thisWeekStart) {
      lastWeekMins.push(diffMin)
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length

  const buckets: ResponseTimeBucket[] = Array.from({ length: 7 }, (_, dow) => {
    const samples = byDow.get(dow) ?? []
    return {
      dow,
      avgMinutes: avg(samples),
      samples: samples.length,
    }
  })

  void DOW_SHORT_MON_FIRST

  return {
    buckets,
    thisWeekAvg: avg(thisWeekMins),
    lastWeekAvg: avg(lastWeekMins),
  }
}

// --- 5. Activity feed --------------------------------------------------

export async function loadActivity(db: DB, limit = 20): Promise<ActivityItem[]> {
  const [msgs, contacts, deals, broadcasts, autoLogs] = await Promise.all([
    db
      .from('messages')
      .select('id, content_text, sender_type, created_at, conversation_id, conversations(contact_id, contacts(name, phone))')
      .eq('sender_type', 'customer')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('contacts')
      .select('id, name, phone, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
    db
      .from('deals')
      .select('id, title, updated_at, stage:pipeline_stages(name)')
      .order('updated_at', { ascending: false })
      .limit(10),
    db
      .from('broadcasts')
      .select('id, name, status, total_recipients, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('automation_logs')
      .select('id, trigger_event, status, created_at, automation:automations(name), contact:contacts(name, phone)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: ActivityItem[] = []
  const t = getT('Dashboard.activityFeed.items')

  for (const m of (msgs.data ?? []) as unknown as Array<{
    id: string
    content_text: string | null
    created_at: string
    conversation_id: string
    conversations:
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }[]
      | { contact_id: string | null; contacts: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null }
      | null
  }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations
    const contact = Array.isArray(conv?.contacts) ? conv?.contacts[0] : conv?.contacts
    const who = contact?.name || contact?.phone || t('unknown')
    items.push({
      id: `msg-${m.id}`,
      kind: 'message',
      text: t('newMessage', { who }),
      at: m.created_at,
      href: `/inbox?c=${m.conversation_id}`,
    })
  }

  for (const c of (contacts.data ?? []) as Array<{ id: string; name: string | null; phone: string; created_at: string }>) {
    items.push({
      id: `contact-${c.id}`,
      kind: 'contact',
      text: t('newContact', { name: c.name || c.phone }),
      at: c.created_at,
      href: '/contacts',
    })
  }

  for (const d of (deals.data ?? []) as unknown as Array<{
    id: string
    title: string
    updated_at: string
    stage: { name: string }[] | { name: string } | null
  }>) {
    const stage = Array.isArray(d.stage) ? d.stage[0] : d.stage
    items.push({
      id: `deal-${d.id}`,
      kind: 'deal',
      text: stage?.name
        ? t('dealInStage', { title: d.title, stage: stage.name })
        : t('dealUpdated', { title: d.title }),
      at: d.updated_at,
      href: '/pipelines',
    })
  }

  for (const b of (broadcasts.data ?? []) as Array<{
    id: string
    name: string
    status: string
    total_recipients: number
    created_at: string
  }>) {
    const count = String(b.total_recipients)
    const status = BROADCAST_STATUS_KEYS.has(b.status)
      ? t(`broadcastStatusNames.${b.status}`)
      : b.status
    items.push({
      id: `broadcast-${b.id}`,
      kind: 'broadcast',
      text:
        b.status === 'sent'
          ? t('broadcastSent', { name: b.name, count })
          : t('broadcastStatus', { name: b.name, status, count }),
      at: b.created_at,
      href: '/broadcasts',
    })
  }

  for (const l of (autoLogs.data ?? []) as unknown as Array<{
    id: string
    trigger_event: string
    status: string
    created_at: string
    automation: { name: string }[] | { name: string } | null
    contact: { name: string | null; phone: string }[] | { name: string | null; phone: string } | null
  }>) {
    const automation = Array.isArray(l.automation) ? l.automation[0] : l.automation
    const contact = Array.isArray(l.contact) ? l.contact[0] : l.contact
    const who = contact?.name || contact?.phone || t('aContact')
    const autoName = automation?.name || t('automationFallback')
    items.push({
      id: `auto-${l.id}`,
      kind: 'automation',
      text: t(l.status === 'failed' ? 'automationFailed' : 'automationTriggered', { name: autoName, who }),
      at: l.created_at,
    })
  }

  return items
    .sort((a, b) => (a.at > b.at ? -1 : a.at < b.at ? 1 : 0))
    .slice(0, limit)
}
