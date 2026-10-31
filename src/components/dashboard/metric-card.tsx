import { ArrowDown, ArrowUp, ArrowUpRight, Minus } from 'lucide-react'
import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison (e.g. total pipeline value).
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
  /** Optional destination URL to jump to when the card is clicked. */
  href?: string
  /** Optional action/control rendered in the top-right header (e.g. month selector). */
  headerRight?: ReactNode
  /** Optional extra footer content below the delta/subtitle. */
  footerExtra?: ReactNode
}

export function MetricCard({
  title,
  value,
  icon: Icon,
  delta,
  subtitle,
  href,
  headerRight,
  footerExtra,
}: MetricCardProps) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
          {title}
          {href && (
            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 -translate-y-0.5 translate-x-0.5 transition-all group-hover:opacity-100 group-hover:translate-y-0 group-hover:translate-x-0 text-primary" />
          )}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {headerRight}
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors',
              href && 'group-hover:bg-primary/15 group-hover:text-primary',
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </div>
      <p className="mt-3 text-[28px] leading-none font-bold tabular-nums text-foreground">
        {value}
      </p>
      {delta ? (
        <DeltaRow sign={delta.sign} label={delta.label} />
      ) : subtitle ? (
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      ) : null}
      {footerExtra}
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="group block rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:bg-muted/20 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {inner}
      </Link>
    )
  }

  return <div className="rounded-xl border border-border bg-card p-5">{inner}</div>
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone =
    sign > 0
      ? 'text-primary'
      : sign < 0
      ? 'text-red-400'
      : 'text-muted-foreground'
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus
  return (
    <div className={cn('mt-2 flex items-center gap-1 text-sm', tone)}>
      <Arrow className="h-4 w-4" aria-hidden />
      <span className="tabular-nums">{label}</span>
    </div>
  )
}
