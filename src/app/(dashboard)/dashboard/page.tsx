"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { formatCurrency } from '@/lib/currency'
import {
  MessageSquare,
  UserPlus,
  DollarSign,
  Send,
} from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadPipelineDonut,
  loadResponseTime,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PeriodSentStats,
  PipelineDonutData,
  ResponseTimeSummary,
} from '@/lib/dashboard/types'

import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { PipelineDonut } from '@/components/dashboard/pipeline-donut'
import { ResponseTimeChart } from '@/components/dashboard/response-time-chart'
import { ActivityFeed } from '@/components/dashboard/activity-feed'

import { useTranslations } from 'next-intl'

type RangeDays = 7 | 30 | 90

export default function DashboardPage() {
  const t = useTranslations('Dashboard.page')
  const { defaultCurrency } = useAuth()
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [selectedSentPeriod, setSelectedSentPeriod] = useState<string>('all')

  const [range, setRange] = useState<RangeDays>(30)
  const [series, setSeries] = useState<Record<RangeDays, ConversationsSeriesPoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null)
  const [pipelineLoading, setPipelineLoading] = useState(true)

  const [responseTime, setResponseTime] = useState<ResponseTimeSummary | null>(null)
  const [responseTimeLoading, setResponseTimeLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()

    void loadMetrics(db)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false))

    void loadPipelineDonut(db)
      .then((p) => setPipeline(p))
      .catch((err) => console.error('[dashboard] pipeline failed:', err))
      .finally(() => setPipelineLoading(false))

    void loadResponseTime(db)
      .then((r) => setResponseTime(r))
      .catch((err) => console.error('[dashboard] response time failed:', err))
      .finally(() => setResponseTimeLoading(false))

    void loadActivity(db, 50)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r)
      if (series[r] !== null) return
      setSeriesLoading(true)
      const db = createClient()
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false))
    },
    [series],
  )

  const activeSentStats: PeriodSentStats | null = useMemo(() => {
    if (!metrics?.sentSummary) return null
    if (selectedSentPeriod === 'all') return metrics.sentSummary.allTime
    if (selectedSentPeriod === 'today') return metrics.sentSummary.today
    return (
      metrics.sentSummary.months.find((m) => m.key === selectedSentPeriod) ??
      metrics.sentSummary.allTime
    )
  }, [metrics, selectedSentPeriod])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title={t('activeConversations')}
              value={metrics.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
              href="/inbox?status=open"
              delta={{
                sign: metrics.activeConversations.previous,
                label: deltaLabel(
                  metrics.activeConversations.previous,
                  t('newTodayVsYesterday'),
                  t('noChange', { suffix: t('newTodayVsYesterday') }),
                ),
              }}
            />
            <MetricCard
              title={t('newContactsToday')}
              value={metrics.newContactsToday.current.toLocaleString()}
              icon={UserPlus}
              href="/contacts?filter=today"
              delta={{
                sign:
                  metrics.newContactsToday.current - metrics.newContactsToday.previous,
                label: deltaLabel(
                  metrics.newContactsToday.current - metrics.newContactsToday.previous,
                  t('vsYesterday'),
                  t('noChange', { suffix: t('vsYesterday') }),
                ),
              }}
            />
            <MetricCard
              title={t('openDealsValue')}
              value={formatCurrency(metrics.openDealsValue, defaultCurrency)}
              icon={DollarSign}
              href="/pipelines"
              subtitle={t('openDeals', { count: metrics.openDealsCount })}
            />
            <MetricCard
              title={
                selectedSentPeriod === 'today'
                  ? t('messagesSentToday')
                  : 'Messages Sent'
              }
              value={
                activeSentStats
                  ? activeSentStats.totalSent.toLocaleString()
                  : metrics.messagesSentToday.current.toLocaleString()
              }
              icon={Send}
              headerRight={
                metrics.sentSummary ? (
                  <select
                    aria-label="Filter sent messages by month"
                    value={selectedSentPeriod}
                    onChange={(e) => setSelectedSentPeriod(e.target.value)}
                    className="h-7 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="all">
                      All Time ({metrics.sentSummary.allTime.totalSent})
                    </option>
                    <option value="today">
                      Today ({metrics.sentSummary.today.totalSent})
                    </option>
                    {metrics.sentSummary.months.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label} ({m.totalSent})
                      </option>
                    ))}
                  </select>
                ) : null
              }
              delta={
                selectedSentPeriod === 'today'
                  ? {
                      sign:
                        metrics.messagesSentToday.current -
                        metrics.messagesSentToday.previous,
                      label: deltaLabel(
                        metrics.messagesSentToday.current -
                          metrics.messagesSentToday.previous,
                        t('vsYesterday'),
                        t('noChange', { suffix: t('vsYesterday') }),
                      ),
                    }
                  : undefined
              }
              subtitle={
                selectedSentPeriod !== 'today' && activeSentStats
                  ? `${activeSentStats.leadsCount} lead${activeSentStats.leadsCount === 1 ? '' : 's'} replied (${activeSentStats.botSent} auto • ${activeSentStats.agentSent} manual)`
                  : undefined
              }
              footerExtra={
                selectedSentPeriod === 'today' && activeSentStats ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {activeSentStats.leadsCount} lead
                    {activeSentStats.leadsCount === 1 ? '' : 's'} replied (
                    {activeSentStats.botSent} auto • {activeSentStats.agentSent}{' '}
                    manual)
                  </p>
                ) : null
              }
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <QuickActions />

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-full lg:col-span-3">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="h-full lg:col-span-2">
          <PipelineDonut
            data={pipeline}
            loading={pipelineLoading}
            currency={defaultCurrency}
          />
        </div>
      </div>

      {/* Response time */}
      <ResponseTimeChart data={responseTime} loading={responseTimeLoading} />

      {/* Activity feed */}
      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}

// ------------------------------------------------------------

function deltaLabel(delta: number, suffix: string, noChangeLabel: string): string {
  if (delta === 0) return noChangeLabel
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString()} ${suffix}`
}
