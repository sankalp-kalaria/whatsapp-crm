'use client';

import { useState } from 'react';
import { AlertTriangle, Clock, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExpiryItem } from '@/lib/investors/check-expiries';

interface ExpiryBannerProps {
  items: ExpiryItem[];
  onNotifyWhatsApp: (phone: string, message: string) => void;
}

export function ExpiryBanner({ items, onNotifyWhatsApp }: ExpiryBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!items || items.length === 0) return null;

  const expired = items.filter((i) => i.isExpired);
  const expiringSoon = items.filter((i) => !i.isExpired);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Agreement Expiry Alerts
              <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-400">
                {items.length} {items.length === 1 ? 'Action Required' : 'Actions Required'}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {expired.length > 0 && (
                <span className="text-red-400 font-medium">
                  {expired.length} agreement{expired.length > 1 ? 's' : ''} expired!{' '}
                </span>
              )}
              {expiringSoon.length > 0 && (
                <span>
                  {expiringSoon.length} agreement{expiringSoon.length > 1 ? 's' : ''} ending within 30 days.
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/20"
          >
            {expanded ? 'Hide Details' : 'View Details'}
            {expanded ? (
              <ChevronUp className="size-4 ml-1" />
            ) : (
              <ChevronDown className="size-4 ml-1" />
            )}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-2 border-t border-amber-500/20 pt-3">
          {items.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/60 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {item.name}
                  </span>
                  <span className="text-xs text-muted-foreground">({item.phone})</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      item.isExpired
                        ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                        : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {item.isExpired
                      ? `Expired (${Math.abs(item.daysRemaining)}d ago)`
                      : `${item.daysRemaining} days left`}
                  </span>
                </div>
                {item.flatDetails && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    Flat: <span className="text-foreground/90">{item.flatDetails}</span> • Ends on{' '}
                    {item.endDate}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onNotifyWhatsApp(item.phone, item.suggestedWhatsAppMessage)
                  }
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 text-xs"
                >
                  <MessageSquare className="size-3.5 mr-1" />
                  Notify on WhatsApp
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
