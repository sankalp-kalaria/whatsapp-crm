import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';
import {
  extractForwardSettingsFromProfile,
  normalizeForwardInterval,
  type ForwardIntervalMinutes,
} from '@/lib/profile/forward-settings';
import { sendSmartLeadConversationForward } from '@/lib/whatsapp/notification-template';
import type {
  FlowNodeRow,
  FlowRunRow,
  ForwardConversationNodeConfig,
} from './types';

type AdminClient = SupabaseClient;

/**
 * Normalizes a raw `flow_nodes` row from the DB so that if the DB constraint
 * required storing `forward_conversation` as `http_fetch` with
 * `config.__node_type = 'forward_conversation'`, the application sees
 * `node_type: 'forward_conversation'` everywhere.
 */
export function normalizeFlowNodeRow<
  T extends { node_type: string; config: Record<string, unknown> }
>(row: T): T {
  if (
    row.node_type === 'http_fetch' &&
    row.config &&
    row.config.__node_type === 'forward_conversation'
  ) {
    const restConfig = { ...row.config };
    delete restConfig.__node_type;
    return {
      ...row,
      node_type: 'forward_conversation',
      config: restConfig,
    };
  }
  return row;
}

/**
 * Finds the first `forward_conversation` node in a flow's node map.
 */
export function findForwardConversationNode(
  nodes: Map<string, FlowNodeRow> | FlowNodeRow[]
): FlowNodeRow | null {
  const list = Array.isArray(nodes) ? nodes : Array.from(nodes.values());
  for (const raw of list) {
    const n = normalizeFlowNodeRow(raw);
    if (n.node_type === 'forward_conversation') {
      return n;
    }
  }
  return null;
}

/**
 * Resolves the target recipient phone number and interval (in minutes)
 * for a `forward_conversation` node by checking the node config first
 * and falling back to the account owner/admin's Profile settings.
 */
export async function resolveForwardTargetAndInterval(
  db: AdminClient,
  accountId: string,
  userId: string,
  nodeConfig?: Partial<ForwardConversationNodeConfig>
): Promise<{
  recipientPhone: string | null;
  intervalMinutes: ForwardIntervalMinutes | 0;
}> {
  const { data: profiles } = await db
    .from('profiles')
    .select('*')
    .eq('account_id', accountId);

  let profilePhone = '';
  let profileInterval: ForwardIntervalMinutes = 60;

  if (Array.isArray(profiles) && profiles.length > 0) {
    const sorted = [...profiles].sort((a, b) => {
      if (a.user_id === userId) return -1;
      if (b.user_id === userId) return 1;
      if (a.account_role === 'owner') return -1;
      if (b.account_role === 'owner') return 1;
      return 0;
    });

    for (const p of sorted) {
      const extracted = extractForwardSettingsFromProfile(p);
      if (!profilePhone && extracted.phone) {
        profilePhone = extracted.phone;
        profileInterval = extracted.forwardIntervalMinutes;
        break;
      }
    }
    if (!profilePhone && sorted[0]) {
      const extracted = extractForwardSettingsFromProfile(sorted[0]);
      profileInterval = extracted.forwardIntervalMinutes;
    }
  }

  const rawOverridePhone =
    typeof nodeConfig?.recipient_phone === 'string'
      ? nodeConfig.recipient_phone.trim()
      : '';
  const chosenPhone = rawOverridePhone || profilePhone;

  let sanitized = sanitizePhoneForMeta(chosenPhone);
  if (sanitized.length === 10 && /^[6-9]\d{9}$/.test(sanitized)) {
    sanitized = `91${sanitized}`;
  }

  const mode = nodeConfig?.interval_mode ?? 'profile_default';
  let intervalMinutes: ForwardIntervalMinutes | 0 = profileInterval;
  if (mode === 'immediate') {
    intervalMinutes = 0;
  } else if (mode === '30' || mode === '60' || mode === '120') {
    intervalMinutes = normalizeForwardInterval(Number(mode));
  }

  return {
    recipientPhone: sanitized || null,
    intervalMinutes,
  };
}

/**
 * Formats a human-readable label for a variable key in `flow_runs.vars`.
 */
function formatVarLabel(key: string): string {
  const labels: Record<string, string> = {
    configuration: 'Configuration',
    budget_range: 'Budget Range',
    site_visit_availability: 'Site Visit Availability',
    site_visit_date: 'Scheduled Visit Date',
    site_visit_time: 'Scheduled Visit Time',
    site_visit_status: 'Visit Status',
  };
  if (labels[key]) return labels[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const INTERNAL_VAR_KEYS = new Set([
  'calendar_link',
  'forward_node_key',
  'forward_interval_minutes',
  'forward_scheduled_at',
  'forward_status',
  'forward_sent_at',
  'forward_recipient_phone',
  'forward_last_msg_at',
]);

/**
 * Computes the strict timeline watermark (in epoch ms) up to which this
 * client's conversation has ALREADY been forwarded to the admin, so past
 * messages are never sent again.
 */
async function getClientLastForwardedWatermarkMs(
  db: AdminClient,
  accountId: string,
  contactId: string | null,
  conversationId: string | null
): Promise<number> {
  let query = db
    .from('flow_runs')
    .select('id, vars, started_at')
    .eq('account_id', accountId)
    .order('started_at', { ascending: false })
    .limit(50);

  if (contactId) {
    query = query.eq('contact_id', contactId);
  } else if (conversationId) {
    query = query.eq('conversation_id', conversationId);
  } else {
    return 0;
  }

  const { data: clientRuns } = await query;
  let maxSentMs = 0;

  for (const r of (clientRuns ?? []) as Array<{
    id: string;
    vars?: Record<string, unknown>;
  }>) {
    const v = r.vars || {};
    if (v.forward_status === 'sent') {
      const lastMsgIso =
        typeof v.forward_last_msg_at === 'string'
          ? v.forward_last_msg_at
          : typeof v.forward_sent_at === 'string'
            ? v.forward_sent_at
            : null;
      if (lastMsgIso) {
        const ms = new Date(lastMsgIso).getTime();
        if (Number.isFinite(ms) && ms > maxSentMs) {
          maxSentMs = ms;
        }
      }
    }
  }

  return maxSentMs;
}

/**
 * Builds and sends ONE consolidated message for a client containing:
 * - Client details (Name & Phone)
 * - All captured workflow answers (including Property Inquiry & Site Visit)
 * - ONLY the new/unsent conversation messages from the client's chat timeline
 *   (strictly excluding any previous conversation already sent in the past).
 *
 * Uses `sendSmartLeadConversationForward` so that if the admin's WhatsApp
 * number is outside the 24-hour customer service window, it automatically
 * sends via an APPROVED WhatsApp Template (preventing Meta error 131047).
 */
export async function executeConversationForwardForRun(
  db: AdminClient,
  run: FlowRunRow,
  nodeConfig?: Partial<ForwardConversationNodeConfig>,
  relatedClientRuns?: FlowRunRow[]
): Promise<{
  sent: boolean;
  skippedAlreadySent?: boolean;
  recipientPhone?: string;
  messageId?: string;
  sentAs?: 'text' | 'template';
  templateName?: string;
  reason?: string;
}> {
  try {
    const { recipientPhone, intervalMinutes } =
      await resolveForwardTargetAndInterval(
        db,
        run.account_id,
        run.user_id,
        nodeConfig
      );

    if (!recipientPhone) {
      return {
        sent: false,
        reason: 'no_profile_phone_configured',
      };
    }

    const allRunsForClient =
      relatedClientRuns && relatedClientRuns.length > 0
        ? relatedClientRuns
        : [run];

    // 1. Determine strict timeline cutoff so we NEVER re-send already forwarded messages
    const watermarkMs = await getClientLastForwardedWatermarkMs(
      db,
      run.account_id,
      run.contact_id,
      run.conversation_id
    );

    // Earliest unforwarded run start time (with 2-minute buffer for the trigger message)
    const unforwardedStartMs = Math.min(
      ...allRunsForClient.map((r) => new Date(r.started_at).getTime())
    ) - 2 * 60 * 1000;

    // The strict cutoff is whichever is MORE RECENT: the last sent watermark or the unforwarded run start
    const timelineCutoffMs =
      watermarkMs > 0 ? watermarkMs : unforwardedStartMs;

    // 2. Load Flow name, Contact details, Site Visit details, and Conversation messages
    const [flowRes, contactRes, visitRes, messagesRes] = await Promise.all([
      db.from('flows').select('name').eq('id', run.flow_id).maybeSingle(),
      run.contact_id
        ? db
            .from('contacts')
            .select('name, phone, email, company')
            .eq('id', run.contact_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      run.contact_id
        ? db
            .from('site_visits')
            .select('*')
            .eq('account_id', run.account_id)
            .eq('contact_id', run.contact_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      run.conversation_id
        ? db
            .from('messages')
            .select('sender_type, content_type, content_text, created_at')
            .eq('conversation_id', run.conversation_id)
            .gt(
              'created_at',
              new Date(timelineCutoffMs).toISOString()
            )
            .order('created_at', { ascending: true })
            .limit(100)
        : Promise.resolve({ data: [] }),
    ]);

    const rawUnsentMessages = (messagesRes.data ?? []) as Array<{
      sender_type: string;
      content_type: string;
      content_text: string | null;
      created_at: string;
    }>;

    // Strict check: only forward if there is at least 1 NEW client message in this timeline window!
    const unsentClientMessages = rawUnsentMessages.filter(
      (m) => m.sender_type === 'customer'
    );

    if (unsentClientMessages.length === 0) {
      // Mark runs as already covered so we don't keep polling old runs with no new client messages
      const nowIso = new Date().toISOString();
      for (const r of allRunsForClient) {
        const rv = r.vars || {};
        if (rv.forward_status !== 'sent') {
          await db
            .from('flow_runs')
            .update({
              vars: {
                ...rv,
                forward_status: 'sent',
                forward_sent_at: rv.forward_sent_at || nowIso,
              },
            })
            .eq('id', r.id);
        }
      }
      return {
        sent: false,
        skippedAlreadySent: true,
        reason: 'no_new_client_messages_since_last_forward',
      };
    }

    const flowName =
      (flowRes.data as { name?: string } | null)?.name ||
      'Property Inquiry & Site Visit';
    const contact = contactRes.data as {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      company?: string | null;
    } | null;
    const visit = visitRes.data as {
      visit_date?: string;
      visit_time?: string;
      configuration?: string | null;
      budget_range?: string | null;
      status?: string;
      notes?: string | null;
      client_name?: string | null;
      client_phone?: string | null;
      created_at?: string;
    } | null;

    const clientName =
      contact?.name || visit?.client_name || 'WhatsApp Client';
    const clientPhone =
      contact?.phone || visit?.client_phone || 'Not available';

    // 3. Merge captured workflow variables across all unforwarded runs for this client (oldest to newest)
    const mergedVars: Record<string, unknown> = {};
    const chronologicalRuns = [...allRunsForClient].sort(
      (a, b) =>
        new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
    );
    for (const r of chronologicalRuns) {
      for (const [k, v] of Object.entries(r.vars || {})) {
        if (INTERNAL_VAR_KEYS.has(k)) continue;
        if (v !== undefined && v !== null && v !== '') {
          mergedVars[k] = v;
        }
      }
    }

    const answerLines: string[] = [];
    const answerOneLineParts: string[] = [];

    for (const [k, v] of Object.entries(mergedVars)) {
      const label = formatVarLabel(k);
      answerLines.push(`• *${label}:* ${String(v)}`);
      answerOneLineParts.push(`${label}: ${String(v)}`);
    }

    if (visit) {
      if (!mergedVars.configuration && visit.configuration) {
        answerLines.push(`• *Configuration:* ${visit.configuration}`);
        answerOneLineParts.push(`Configuration: ${visit.configuration}`);
      }
      if (!mergedVars.budget_range && visit.budget_range) {
        answerLines.push(`• *Budget Range:* ${visit.budget_range}`);
        answerOneLineParts.push(`Budget Range: ${visit.budget_range}`);
      }
      if (visit.visit_date && visit.visit_time) {
        const slotStr = `${visit.visit_date} at ${visit.visit_time} (${visit.status || 'scheduled'})`;
        answerLines.push(`• *Site Visit Slot:* ${slotStr}`);
        answerOneLineParts.push(`Site Visit: ${slotStr}`);
      }
      if (visit.notes) {
        answerLines.push(`• *Notes:* ${visit.notes}`);
        answerOneLineParts.push(`Notes: ${visit.notes}`);
      }
    }

    // 4. Build New Conversation Timeline (ONLY unsent messages!)
    const transcriptLines: string[] = [];
    const transcriptOneLineParts: string[] = [];
    const clientOnlyAnswers: string[] = [];
    const clientOnlyOneLine: string[] = [];

    for (const m of rawUnsentMessages) {
      const text = (m.content_text || `[${m.content_type}]`).trim();
      if (!text) continue;
      const timeStr = new Date(m.created_at).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      const isClient = m.sender_type === 'customer';
      const speaker = isClient ? '👤 Client' : '🤖 Bot';
      const shortSpeaker = isClient ? 'Client' : 'Bot';
      transcriptLines.push(`[${timeStr}] *${speaker}:* ${text}`);
      transcriptOneLineParts.push(`[${timeStr}] ${shortSpeaker}: ${text}`);
      if (isClient) {
        clientOnlyAnswers.push(`• "${text}"`);
        clientOnlyOneLine.push(text);
      }
    }

    if (answerLines.length === 0 && clientOnlyAnswers.length > 0) {
      answerLines.push(...clientOnlyAnswers);
      answerOneLineParts.push(...clientOnlyOneLine);
    }

    const customNote =
      typeof nodeConfig?.custom_note === 'string' &&
      nodeConfig.custom_note.trim()
        ? `\n📌 *Note:* ${nodeConfig.custom_note.trim()}\n`
        : '';

    const intervalLabel =
      intervalMinutes === 0
        ? 'Immediate'
        : intervalMinutes === 30
          ? '30 Minutes'
          : intervalMinutes === 120
            ? '2 Hours'
            : '1 Hour';

    const summaryHeader = [
      `📋 *Workflow Conversation Summary*`,
      `🔹 *Workflow:* ${flowName}`,
      `⏱️ *Interval:* ${intervalLabel}`,
      customNote,
      `👤 *Client Details:*`,
      `• *Name:* ${clientName}`,
      `• *Number:* ${clientPhone}`,
      contact?.email ? `• *Email:* ${contact.email}` : null,
      ``,
      `📊 *Client Answers & Details:*`,
      answerLines.length > 0
        ? answerLines.join('\n')
        : '• Client started conversation',
      ``,
      `💬 *New Conversation Timeline (${rawUnsentMessages.length} messages):*`,
      transcriptLines.join('\n'),
    ]
      .filter((line) => line !== null)
      .join('\n');

    const finalMessage =
      summaryHeader.length > 4000
        ? `${summaryHeader.slice(0, 3990)}\n…(truncated)`
        : summaryHeader;

    const answersOneLine =
      answerOneLineParts.length > 0
        ? answerOneLineParts.join(' | ')
        : 'Client inquiry received';
    const conversationOneLine = transcriptOneLineParts.join(' | ');

    // 5. Send via Smart Lead Conversation Forward (auto-uses APPROVED Template outside 24h window!)
    const sendRes = await sendSmartLeadConversationForward(
      db,
      run.account_id,
      run.user_id,
      {
        recipientPhone,
        clientName,
        clientPhone,
        flowName,
        answersOneLine,
        conversationOneLine,
        fullTextSummary: finalMessage,
      }
    );

    // 6. Stamp the exact watermark (`forward_last_msg_at`) on ALL runs for this client
    // so these messages are never sent again in future intervals!
    const nowIso = new Date().toISOString();
    const latestMsgTimestamp =
      rawUnsentMessages[rawUnsentMessages.length - 1]?.created_at || nowIso;

    for (const r of allRunsForClient) {
      const updatedVars = {
        ...(r.vars || {}),
        forward_status: 'sent',
        forward_sent_at: nowIso,
        forward_last_msg_at: latestMsgTimestamp,
        forward_recipient_phone: sendRes.deliveredPhone,
      };
      await db
        .from('flow_runs')
        .update({ vars: updatedVars })
        .eq('id', r.id);
      r.vars = updatedVars;
    }

    // 7. Record audit event in flow_run_events
    await db.from('flow_run_events').insert({
      flow_run_id: run.id,
      event_type: 'message_sent',
      node_key:
        (run.vars?.forward_node_key as string | undefined) ||
        'forward_conversation',
      payload: {
        node_type: 'forward_conversation',
        forwarded_to: sendRes.deliveredPhone,
        whatsapp_message_id: sendRes.whatsappMessageId,
        sent_as: sendRes.sentAs,
        template_name: sendRes.templateName ?? null,
        interval_minutes: intervalMinutes,
        last_forwarded_msg_at: latestMsgTimestamp,
      },
    });

    return {
      sent: true,
      recipientPhone: sendRes.deliveredPhone,
      messageId: sendRes.whatsappMessageId,
      sentAs: sendRes.sentAs,
      templateName: sendRes.templateName,
    };
  } catch (err) {
    console.error('[flows] executeConversationForwardForRun error:', err);
    return {
      sent: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Processes all eligible clients whose conversation forward interval
 * (`30 minutes`, `1 hour`, or `2 hours` from the client's first unsent message)
 * has arrived.
 *
 * - Consolidates everything into ONE message per client (`contact_id` / `conversation_id`).
 * - Strictly checks each client's chat timeline against their `forward_last_msg_at`
 *   watermark so already-sent past conversations are NEVER re-sent.
 * - Sends each eligible client's summary ONE BY ONE to the admin's configured
 *   WhatsApp Contact Number.
 */
export async function processDueConversationForwards(
  db: AdminClient,
  options?: {
    accountId?: string;
    forceRecent?: boolean;
  }
): Promise<{ processed: number; forwarded: number }> {
  try {
    let query = db
      .from('flow_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(100);

    if (options?.accountId) {
      query = query.eq('account_id', options.accountId);
    }

    const { data: runs, error } = await query;
    if (error || !runs?.length) {
      return { processed: 0, forwarded: 0 };
    }

    // Group runs by unique client (`contact_id` or `conversation_id`)
    // so each eligible client produces at most ONE consolidated message!
    const runsByClient = new Map<string, FlowRunRow[]>();
    for (const rawRun of runs as FlowRunRow[]) {
      const clientKey =
        rawRun.contact_id || rawRun.conversation_id || rawRun.id;
      const list = runsByClient.get(clientKey) ?? [];
      list.push(rawRun);
      runsByClient.set(clientKey, list);
    }

    const nowMs = Date.now();
    let processed = 0;
    let forwarded = 0;

    // Cache flow_nodes lookup per flow_id
    const flowNodeCache = new Map<string, FlowNodeRow | null>();
    const getForwardNode = async (flowId: string) => {
      if (flowNodeCache.has(flowId)) {
        return flowNodeCache.get(flowId) ?? null;
      }
      const { data: flowNodes } = await db
        .from('flow_nodes')
        .select('*')
        .eq('flow_id', flowId);
      const found = findForwardConversationNode(
        (flowNodes ?? []) as FlowNodeRow[]
      );
      flowNodeCache.set(flowId, found);
      return found;
    };

    // Process each client ONE BY ONE
    for (const [, clientRuns] of runsByClient.entries()) {
      // Latest run for this client is first (since ordered by started_at DESC)
      const latestRun = clientRuns[0];
      const forwardNode = await getForwardNode(latestRun.flow_id);
      if (!forwardNode) continue;

      const nodeConfig =
        (forwardNode.config as Partial<ForwardConversationNodeConfig>) ?? {};
      const { intervalMinutes } = await resolveForwardTargetAndInterval(
        db,
        latestRun.account_id,
        latestRun.user_id,
        nodeConfig
      );
      const effectiveIntervalMin = intervalMinutes || 60;

      // 1. Check the client's strict timeline watermark (`forward_last_msg_at`)
      const watermarkMs = await getClientLastForwardedWatermarkMs(
        db,
        latestRun.account_id,
        latestRun.contact_id,
        latestRun.conversation_id
      );

      // Find all runs for this client that have not yet been marked 'sent',
      // OR check if the client sent new messages in the conversation after watermarkMs
      const unsentRuns = clientRuns.filter(
        (r) => (r.vars?.forward_status as string | undefined) !== 'sent'
      );

      const earliestUnsentRunMs =
        unsentRuns.length > 0
          ? Math.min(
              ...unsentRuns.map((r) => new Date(r.started_at).getTime())
            ) -
            2 * 60 * 1000
          : 0;

      const cutoffMs =
        watermarkMs > 0
          ? watermarkMs
          : earliestUnsentRunMs > 0
            ? earliestUnsentRunMs
            : new Date(latestRun.started_at).getTime() - 2 * 60 * 1000;

      if (!latestRun.conversation_id) continue;

      // Fetch any NEW client messages strictly after cutoffMs
      const { data: newClientMsgs } = await db
        .from('messages')
        .select('id, created_at')
        .eq('conversation_id', latestRun.conversation_id)
        .eq('sender_type', 'customer')
        .gt('created_at', new Date(cutoffMs).toISOString())
        .order('created_at', { ascending: true })
        .limit(1);

      if (!newClientMsgs || newClientMsgs.length === 0) {
        // No new client messages since last forward -> do NOT re-send past conversation!
        continue;
      }

      // 2. Check if the client's chat timeline has reached the configured interval
      // from the first unsent client message in this window!
      const firstNewMsgMs = new Date(newClientMsgs[0].created_at).getTime();
      const dueAtMs = firstNewMsgMs + effectiveIntervalMin * 60 * 1000;

      const isClientDue = Boolean(options?.forceRecent) || nowMs >= dueAtMs;

      if (!isClientDue) {
        // Ensure pending schedule is stamped on the latest run
        const vars = latestRun.vars || {};
        if (vars.forward_status !== 'pending') {
          await db
            .from('flow_runs')
            .update({
              vars: {
                ...vars,
                forward_node_key: forwardNode.node_key,
                forward_interval_minutes: effectiveIntervalMin,
                forward_scheduled_at: new Date(dueAtMs).toISOString(),
                forward_status: 'pending',
              },
            })
            .eq('id', latestRun.id);
        }
        continue;
      }

      // 3. This client is eligible! Send their consolidated conversation summary one by one
      processed++;
      const runsToConsolidate =
        unsentRuns.length > 0 ? unsentRuns : [latestRun];

      const res = await executeConversationForwardForRun(
        db,
        latestRun,
        nodeConfig,
        runsToConsolidate
      );

      if (res.sent) {
        forwarded++;
      }
    }

    return { processed, forwarded };
  } catch (err) {
    console.error('[flows] processDueConversationForwards error:', err);
    return { processed: 0, forwarded: 0 };
  }
}
