import type { SupabaseClient } from '@supabase/supabase-js';
import type { Investor, Client, Notification } from '@/types';

export interface ExpiryItem {
  id: string;
  type: 'investor' | 'client';
  name: string;
  phone: string;
  flatDetails?: string | null;
  endDate: string;
  daysRemaining: number;
  isExpired: boolean;
  isDueToday?: boolean;
  daysStatusLabel: string;
  linkedParty?: string;
  suggestedWhatsAppMessage: string;
  notificationTitle: string;
  notificationBody: string;
}

export interface ExpirySummary {
  expiringSoonCount: number;
  expiredCount: number;
  items: ExpiryItem[];
  allItems: ExpiryItem[];
}

/**
 * Calculates the exact calendar day difference between `endDateStr` (YYYY-MM-DD)
 * and the current date (`referenceDate`, defaulting to right now).
 *
 * - Negative `daysRemaining`: date is in the past (expired / overdue)
 * - Zero `daysRemaining`: due today
 * - Positive `daysRemaining`: due in X days
 */
export function calculateDaysFromToday(
  endDateStr: string,
  referenceDate: Date = new Date()
): {
  daysRemaining: number;
  isExpired: boolean;
  isDueToday: boolean;
  daysStatusLabel: string;
  shortBadgeLabel: string;
} {
  const cleanDate = endDateStr.trim().slice(0, 10);
  const parts = cleanDate.split('-').map(Number);

  let targetUtc: number;
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    targetUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  } else {
    const parsed = new Date(endDateStr);
    targetUtc = Date.UTC(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate()
    );
  }

  const todayUtc = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  const daysRemaining = Math.round(
    (targetUtc - todayUtc) / (1000 * 60 * 60 * 24)
  );
  const isExpired = daysRemaining < 0;
  const isDueToday = daysRemaining === 0;
  const absDays = Math.abs(daysRemaining);

  let daysStatusLabel: string;
  let shortBadgeLabel: string;

  if (isExpired) {
    daysStatusLabel = `Past by ${absDays} day${absDays === 1 ? '' : 's'} (${absDays}d ago)`;
    shortBadgeLabel = `${absDays}d past`;
  } else if (isDueToday) {
    daysStatusLabel = 'Due Today (0 days left)';
    shortBadgeLabel = 'Due today';
  } else {
    daysStatusLabel = `Due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (${daysRemaining}d left)`;
    shortBadgeLabel = `${daysRemaining}d left`;
  }

  return {
    daysRemaining,
    isExpired,
    isDueToday,
    daysStatusLabel,
    shortBadgeLabel,
  };
}

/**
 * Builds on-the-spot expiry & notification details for an Investor using the current date.
 */
export function buildInvestorExpiryItem(
  inv: Investor,
  referenceDate: Date = new Date()
): ExpiryItem | null {
  const targetDateStr = inv.agreement_end_date || inv.rent_end_date;
  if (!targetDateStr) return null;

  const {
    daysRemaining,
    isExpired,
    isDueToday,
    daysStatusLabel,
    shortBadgeLabel,
  } = calculateDaysFromToday(targetDateStr, referenceDate);

  const absDays = Math.abs(daysRemaining);
  const flatName = inv.purchase_flat_details || 'Flat/Property';

  const suggestedWhatsAppMessage = isExpired
    ? `Hello ${inv.name}, your rental agreement for ${flatName} ended ${absDays} day${absDays === 1 ? '' : 's'} ago on ${targetDateStr}. We are actively searching for a new tenant for your flat. Please let us know if you have any questions.`
    : isDueToday
      ? `Hello ${inv.name}, gentle reminder that your rental agreement for ${flatName} expires today (${targetDateStr}). We are ready to assist with agreement renewal or finding a suitable new tenant.`
      : `Hello ${inv.name}, gentle reminder that your rental agreement for ${flatName} is due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} on ${targetDateStr}. We are preparing to assist with agreement renewal or finding a suitable new tenant.`;

  const notificationTitle = isExpired
    ? `Investor Agreement Expired (${shortBadgeLabel}): ${inv.name} (${flatName})`
    : isDueToday
      ? `Investor Agreement Due Today: ${inv.name} (${flatName})`
      : `Investor Agreement Due (${shortBadgeLabel}): ${inv.name} (${flatName})`;

  const notificationBody = isExpired
    ? `Rental agreement for ${flatName} ended ${absDays} day${absDays === 1 ? '' : 's'} ago on ${targetDateStr}. Contact investor ${inv.name} (${inv.phone}) to arrange new rental.`
    : isDueToday
      ? `Rental agreement for ${flatName} expires today (${targetDateStr}). Contact investor ${inv.name} (${inv.phone}) immediately.`
      : `Rental agreement for ${flatName} is due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} on ${targetDateStr}. Contact investor ${inv.name} (${inv.phone}).`;

  return {
    id: inv.id,
    type: 'investor',
    name: inv.name,
    phone: inv.phone,
    flatDetails: inv.purchase_flat_details,
    endDate: targetDateStr,
    daysRemaining,
    isExpired,
    isDueToday,
    daysStatusLabel,
    suggestedWhatsAppMessage,
    notificationTitle,
    notificationBody,
  };
}

/**
 * Builds on-the-spot expiry & notification details for a Client using the current date.
 */
export function buildClientExpiryItem(
  cl: Client & { investor?: Investor | null },
  referenceDate: Date = new Date()
): ExpiryItem | null {
  if (!cl.agreement_end_date) return null;

  const targetDateStr = cl.agreement_end_date;
  const {
    daysRemaining,
    isExpired,
    isDueToday,
    daysStatusLabel,
    shortBadgeLabel,
  } = calculateDaysFromToday(targetDateStr, referenceDate);

  const absDays = Math.abs(daysRemaining);
  const investorName = cl.investor?.name || 'Owner';
  const flatName = cl.investor?.purchase_flat_details || 'Rented Unit';

  const suggestedWhatsAppMessage = isExpired
    ? `Hello ${cl.name}, your tenancy agreement for ${flatName} ended ${absDays} day${absDays === 1 ? '' : 's'} ago on ${targetDateStr}. Please contact us regarding agreement renewal or move-out formalities.`
    : isDueToday
      ? `Hello ${cl.name}, reminder that your tenancy agreement for ${flatName} expires today (${targetDateStr}). Please reach out regarding agreement renewal or move-out formalities.`
      : `Hello ${cl.name}, reminder that your tenancy agreement for ${flatName} is due to expire in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} on ${targetDateStr}. Please reach out if you would like to renew your agreement.`;

  const notificationTitle = isExpired
    ? `Client Agreement Expired (${shortBadgeLabel}): ${cl.name}`
    : isDueToday
      ? `Client Agreement Due Today: ${cl.name}`
      : `Client Agreement Due (${shortBadgeLabel}): ${cl.name}`;

  const notificationBody = isExpired
    ? `Tenancy agreement for client ${cl.name} (${flatName}) ended ${absDays} day${absDays === 1 ? '' : 's'} ago on ${targetDateStr}. Contact them at ${cl.phone}.`
    : isDueToday
      ? `Tenancy agreement for client ${cl.name} (${flatName}) expires today (${targetDateStr}). Contact them at ${cl.phone}.`
      : `Tenancy agreement for client ${cl.name} (${flatName}) is due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} on ${targetDateStr}. Contact them at ${cl.phone}.`;

  return {
    id: cl.id,
    type: 'client',
    name: cl.name,
    phone: cl.phone,
    flatDetails: flatName,
    endDate: targetDateStr,
    daysRemaining,
    isExpired,
    isDueToday,
    daysStatusLabel,
    linkedParty: investorName,
    suggestedWhatsAppMessage,
    notificationTitle,
    notificationBody,
  };
}

export interface EnrichedNotification extends Notification {
  liveTitle: string;
  liveBody?: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientType?: 'investor' | 'client';
  recipientEntityId?: string;
  endDate?: string;
  daysRemaining?: number;
  isExpired?: boolean;
  isDueToday?: boolean;
  daysStatusLabel?: string;
  suggestedWhatsAppMessage?: string;
  flatDetails?: string | null;
}

/**
 * Recalculates any notification row ON THE SPOT using the current date (`referenceDate`)
 * and live Investor / Client records so the Notifications tab never shows stale/previous days.
 */
export function recalculateNotificationOnTheSpot(
  n: Notification,
  investors: Investor[],
  clients: (Client & { investor?: Investor | null })[],
  referenceDate: Date = new Date()
): EnrichedNotification {
  // 1. Try matching Investor notification
  if (n.entity_type === 'investor' || n.title.toLowerCase().includes('investor') || n.body?.toLowerCase().includes('investor')) {
    let matchedInvestor = n.entity_id
      ? investors.find((inv) => inv.id === n.entity_id)
      : undefined;

    if (!matchedInvestor) {
      matchedInvestor = investors.find(
        (inv) =>
          (inv.name && n.title.toLowerCase().includes(inv.name.toLowerCase())) ||
          (inv.phone && n.body?.includes(inv.phone))
      );
    }

    if (matchedInvestor) {
      const built = buildInvestorExpiryItem(matchedInvestor, referenceDate);
      if (built) {
        return {
          ...n,
          type: built.isExpired ? 'agreement_expired' : 'agreement_expiring',
          liveTitle: built.notificationTitle,
          liveBody: built.notificationBody,
          recipientName: matchedInvestor.name,
          recipientPhone: matchedInvestor.phone,
          recipientType: 'investor',
          recipientEntityId: matchedInvestor.id,
          endDate: built.endDate,
          daysRemaining: built.daysRemaining,
          isExpired: built.isExpired,
          isDueToday: built.isDueToday,
          daysStatusLabel: built.daysStatusLabel,
          suggestedWhatsAppMessage: built.suggestedWhatsAppMessage,
          flatDetails: matchedInvestor.purchase_flat_details,
        };
      }
      const flatName = matchedInvestor.purchase_flat_details || 'Flat/Property';
      return {
        ...n,
        liveTitle: n.title,
        liveBody: n.body,
        recipientName: matchedInvestor.name,
        recipientPhone: matchedInvestor.phone,
        recipientType: 'investor',
        recipientEntityId: matchedInvestor.id,
        flatDetails: matchedInvestor.purchase_flat_details,
        suggestedWhatsAppMessage: `Hello ${matchedInvestor.name}, regarding your property (${flatName}): ${n.body || n.title}`,
      };
    }
  }

  // 2. Try matching Client notification
  if (n.entity_type === 'client' || n.title.toLowerCase().includes('client') || n.body?.toLowerCase().includes('tenancy')) {
    let matchedClient = n.entity_id
      ? clients.find((cl) => cl.id === n.entity_id)
      : undefined;

    if (!matchedClient) {
      matchedClient = clients.find(
        (cl) =>
          (cl.name && n.title.toLowerCase().includes(cl.name.toLowerCase())) ||
          (cl.phone && n.body?.includes(cl.phone))
      );
    }

    if (matchedClient) {
      const built = buildClientExpiryItem(matchedClient, referenceDate);
      if (built) {
        return {
          ...n,
          type: built.isExpired ? 'agreement_expired' : 'agreement_expiring',
          liveTitle: built.notificationTitle,
          liveBody: built.notificationBody,
          recipientName: matchedClient.name,
          recipientPhone: matchedClient.phone,
          recipientType: 'client',
          recipientEntityId: matchedClient.id,
          endDate: built.endDate,
          daysRemaining: built.daysRemaining,
          isExpired: built.isExpired,
          isDueToday: built.isDueToday,
          daysStatusLabel: built.daysStatusLabel,
          suggestedWhatsAppMessage: built.suggestedWhatsAppMessage,
          flatDetails: built.flatDetails,
        };
      }
      return {
        ...n,
        liveTitle: n.title,
        liveBody: n.body,
        recipientName: matchedClient.name,
        recipientPhone: matchedClient.phone,
        recipientType: 'client',
        recipientEntityId: matchedClient.id,
        suggestedWhatsAppMessage: `Hello ${matchedClient.name}, regarding your tenancy agreement: ${n.body || n.title}`,
      };
    }
  }

  // 3. Fallback: if the notification text contains a YYYY-MM-DD date, recalculate days on the spot!
  const dateMatch =
    n.body?.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
    n.title.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const phoneMatch = n.body?.match(/(?:\+?\d[\d\s-]{8,14}\d)/);
  const extractedPhone = phoneMatch
    ? phoneMatch[0].replace(/[^\d+]/g, '')
    : undefined;

  if (dateMatch) {
    const endDate = dateMatch[1];
    const calc = calculateDaysFromToday(endDate, referenceDate);
    const absDays = Math.abs(calc.daysRemaining);

    let updatedTitle = n.title.replace(
      /\(\d+d(?:\s*(?:left|past|ago))?\)/gi,
      `(${calc.shortBadgeLabel})`
    );
    if (calc.isExpired && updatedTitle.includes('Expiring Soon')) {
      updatedTitle = updatedTitle.replace('Expiring Soon', 'Expired');
    } else if (calc.isExpired && updatedTitle.includes('Expiring')) {
      updatedTitle = updatedTitle.replace('Expiring', 'Expired');
    }

    let updatedBody = n.body;
    if (updatedBody) {
      if (calc.isExpired) {
        updatedBody = updatedBody
          .replace(
            /ends in \d+ days on (\d{4}-\d{2}-\d{2})/i,
            `ended ${absDays} day${absDays === 1 ? '' : 's'} ago on $1`
          )
          .replace(
            /ends on (\d{4}-\d{2}-\d{2}) \(\d+ days left\)/i,
            `ended ${absDays} day${absDays === 1 ? '' : 's'} ago on $1`
          );
      } else if (calc.isDueToday) {
        updatedBody = updatedBody
          .replace(/ends in \d+ days on (\d{4}-\d{2}-\d{2})/i, 'expires today on $1')
          .replace(
            /ends on (\d{4}-\d{2}-\d{2}) \(\d+ days left\)/i,
            'expires today on $1'
          );
      } else {
        updatedBody = updatedBody
          .replace(
            /ends in \d+ days on (\d{4}-\d{2}-\d{2})/i,
            `ends in ${calc.daysRemaining} day${calc.daysRemaining === 1 ? '' : 's'} on $1`
          )
          .replace(
            /ends on (\d{4}-\d{2}-\d{2}) \(\d+ days left\)/i,
            `ends on $1 (${calc.daysRemaining} day${calc.daysRemaining === 1 ? '' : 's'} left)`
          );
      }
    }

    return {
      ...n,
      type: calc.isExpired ? 'agreement_expired' : 'agreement_expiring',
      liveTitle: updatedTitle,
      liveBody: updatedBody,
      recipientPhone: extractedPhone,
      recipientType:
        n.entity_type === 'investor' || n.entity_type === 'client'
          ? n.entity_type
          : undefined,
      recipientEntityId: n.entity_id,
      endDate,
      daysRemaining: calc.daysRemaining,
      isExpired: calc.isExpired,
      isDueToday: calc.isDueToday,
      daysStatusLabel: calc.daysStatusLabel,
      suggestedWhatsAppMessage: updatedBody || updatedTitle,
    };
  }

  return {
    ...n,
    liveTitle: n.title,
    liveBody: n.body,
    recipientPhone: extractedPhone,
    recipientType:
      n.entity_type === 'investor' || n.entity_type === 'client'
        ? n.entity_type
        : undefined,
    recipientEntityId: n.entity_id,
    suggestedWhatsAppMessage: n.body || n.title,
  };
}

export async function checkAndNotifyExpiries(
  supabase: SupabaseClient,
  accountId: string,
  userId: string
): Promise<ExpirySummary> {
  const now = new Date();

  // 1. Fetch all investors for this account
  const { data: investors } = await supabase
    .from('investors')
    .select('*')
    .eq('account_id', accountId);

  // 2. Fetch all clients for this account (with linked investor)
  const { data: clients } = await supabase
    .from('clients')
    .select('*, investor:investors(*)')
    .eq('account_id', accountId);

  const allItems: ExpiryItem[] = [];
  const urgentItems: ExpiryItem[] = [];

  // Process investors with on-the-spot date calculation
  if (investors) {
    for (const inv of investors as Investor[]) {
      const built = buildInvestorExpiryItem(inv, now);
      if (!built) continue;

      allItems.push(built);

      // Urgent items are those expiring within 30 days or already expired in the past
      if (built.daysRemaining <= 30) {
        urgentItems.push(built);

        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('account_id', accountId)
          .eq('entity_type', 'investor')
          .eq('entity_id', inv.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const notifType = built.isExpired
          ? 'agreement_expired'
          : 'agreement_expiring';

        if (!existingNotif || existingNotif.length === 0) {
          await supabase.from('notifications').insert({
            account_id: accountId,
            user_id: userId,
            type: notifType,
            title: built.notificationTitle,
            body: built.notificationBody,
            entity_type: 'investor',
            entity_id: inv.id,
          });
        } else {
          // Always update existing notification row with on-the-spot calculation
          await supabase
            .from('notifications')
            .update({
              type: notifType,
              title: built.notificationTitle,
              body: built.notificationBody,
            })
            .eq('id', existingNotif[0].id);
        }
      }
    }
  }

  // Process clients with on-the-spot date calculation
  if (clients) {
    for (const cl of clients as (Client & { investor?: Investor | null })[]) {
      const built = buildClientExpiryItem(cl, now);
      if (!built) continue;

      allItems.push(built);

      if (built.daysRemaining <= 30) {
        urgentItems.push(built);

        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('account_id', accountId)
          .eq('entity_type', 'client')
          .eq('entity_id', cl.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const notifType = built.isExpired
          ? 'agreement_expired'
          : 'agreement_expiring';

        if (!existingNotif || existingNotif.length === 0) {
          await supabase.from('notifications').insert({
            account_id: accountId,
            user_id: userId,
            type: notifType,
            title: built.notificationTitle,
            body: built.notificationBody,
            entity_type: 'client',
            entity_id: cl.id,
          });
        } else {
          // Always update existing notification row with on-the-spot calculation
          await supabase
            .from('notifications')
            .update({
              type: notifType,
              title: built.notificationTitle,
              body: built.notificationBody,
            })
            .eq('id', existingNotif[0].id);
        }
      }
    }
  }

  // Sort: most urgent first (expired/past first, then nearest days remaining)
  urgentItems.sort((a, b) => a.daysRemaining - b.daysRemaining);
  allItems.sort((a, b) => a.daysRemaining - b.daysRemaining);

  const expiringSoonCount = urgentItems.filter((i) => !i.isExpired).length;
  const expiredCount = urgentItems.filter((i) => i.isExpired).length;

  return {
    expiringSoonCount,
    expiredCount,
    items: urgentItems,
    allItems,
  };
}
