import type { SupabaseClient } from '@supabase/supabase-js';
import type { Investor, Client } from '@/types';

export interface ExpiryItem {
  id: string;
  type: 'investor' | 'client';
  name: string;
  phone: string;
  flatDetails?: string | null;
  endDate: string;
  daysRemaining: number;
  isExpired: boolean;
  linkedParty?: string;
  suggestedWhatsAppMessage: string;
}

export interface ExpirySummary {
  expiringSoonCount: number;
  expiredCount: number;
  items: ExpiryItem[];
}

export async function checkAndNotifyExpiries(
  supabase: SupabaseClient,
  accountId: string,
  userId: string
): Promise<ExpirySummary> {
  const today = new Date();
  const thirtyDaysAhead = new Date();
  thirtyDaysAhead.setDate(today.getDate() + 30);

  const todayStr = today.toISOString().split('T')[0];
  const thirtyDaysStr = thirtyDaysAhead.toISOString().split('T')[0];

  // 1. Fetch investors with agreement_end_date or rent_end_date <= 30 days
  const { data: investors } = await supabase
    .from('investors')
    .select('*')
    .eq('account_id', accountId)
    .not('agreement_end_date', 'is', null)
    .lte('agreement_end_date', thirtyDaysStr);

  // 2. Fetch clients with agreement_end_date <= 30 days
  const { data: clients } = await supabase
    .from('clients')
    .select('*, investor:investors(*)')
    .eq('account_id', accountId)
    .not('agreement_end_date', 'is', null)
    .lte('agreement_end_date', thirtyDaysStr);

  const items: ExpiryItem[] = [];

  // Process investors
  if (investors) {
    for (const inv of investors as Investor[]) {
      const targetDateStr = inv.agreement_end_date || inv.rent_end_date;
      if (!targetDateStr) continue;

      const targetDate = new Date(targetDateStr);
      const diffTime = targetDate.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const isExpired = daysRemaining < 0;

      const flatName = inv.purchase_flat_details || 'Flat/Property';
      const msg = isExpired
        ? `Hello ${inv.name}, your rental agreement for ${flatName} ended on ${targetDateStr}. We are actively searching for a new tenant for your flat. Please let us know if you have any questions.`
        : `Hello ${inv.name}, gentle reminder that your rental agreement for ${flatName} is expiring on ${targetDateStr} (${daysRemaining} days remaining). We are preparing to assist with agreement renewal or finding a suitable new tenant.`;

      items.push({
        id: inv.id,
        type: 'investor',
        name: inv.name,
        phone: inv.phone,
        flatDetails: inv.purchase_flat_details,
        endDate: targetDateStr,
        daysRemaining,
        isExpired,
        suggestedWhatsAppMessage: msg,
      });

      // Check if a system notification for this investor agreement expiry already exists
      const notifTitle = isExpired
        ? `Agreement Expired: ${inv.name} (${flatName})`
        : `Agreement Expiring Soon (${daysRemaining}d): ${inv.name}`;

      const { data: existingNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('account_id', accountId)
        .eq('entity_type', 'investor')
        .eq('entity_id', inv.id)
        .gte('created_at', new Date(today.getFullYear(), today.getMonth(), 1).toISOString())
        .limit(1);

      if (!existingNotif || existingNotif.length === 0) {
        await supabase.from('notifications').insert({
          account_id: accountId,
          user_id: userId,
          type: isExpired ? 'agreement_expired' : 'agreement_expiring',
          title: notifTitle,
          body: isExpired
            ? `Rental agreement for ${flatName} has ended. Contact investor ${inv.phone} to arrange new rental.`
            : `Rental agreement for ${flatName} ends in ${daysRemaining} days on ${targetDateStr}. Time to notify owner!`,
          entity_type: 'investor',
          entity_id: inv.id,
        });
      }
    }
  }

  // Process clients
  if (clients) {
    for (const cl of clients as (Client & { investor?: Investor | null })[]) {
      if (!cl.agreement_end_date) continue;

      const targetDate = new Date(cl.agreement_end_date);
      const diffTime = targetDate.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const isExpired = daysRemaining < 0;

      const investorName = cl.investor?.name || 'Owner';
      const msg = isExpired
        ? `Hello ${cl.name}, your tenancy agreement ended on ${cl.agreement_end_date}. Please contact us regarding agreement renewal or move-out formalities.`
        : `Hello ${cl.name}, reminder that your tenancy agreement is due to expire in ${daysRemaining} days on ${cl.agreement_end_date}. Please reach out if you would like to renew your agreement.`;

      items.push({
        id: cl.id,
        type: 'client',
        name: cl.name,
        phone: cl.phone,
        flatDetails: cl.investor?.purchase_flat_details || 'Rented Unit',
        endDate: cl.agreement_end_date,
        daysRemaining,
        isExpired,
        linkedParty: investorName,
        suggestedWhatsAppMessage: msg,
      });

      const notifTitle = isExpired
        ? `Client Agreement Expired: ${cl.name}`
        : `Client Agreement Expiring (${daysRemaining}d): ${cl.name}`;

      const { data: existingNotif } = await supabase
        .from('notifications')
        .select('id')
        .eq('account_id', accountId)
        .eq('entity_type', 'client')
        .eq('entity_id', cl.id)
        .gte('created_at', new Date(today.getFullYear(), today.getMonth(), 1).toISOString())
        .limit(1);

      if (!existingNotif || existingNotif.length === 0) {
        await supabase.from('notifications').insert({
          account_id: accountId,
          user_id: userId,
          type: isExpired ? 'agreement_expired' : 'agreement_expiring',
          title: notifTitle,
          body: isExpired
            ? `Tenancy agreement for client ${cl.name} has ended. Contact them at ${cl.phone}.`
            : `Tenancy agreement for ${cl.name} ends on ${cl.agreement_end_date} (${daysRemaining} days left).`,
          entity_type: 'client',
          entity_id: cl.id,
        });
      }
    }
  }

  // Sort: most urgent first (expired first, then nearest days remaining)
  items.sort((a, b) => a.daysRemaining - b.daysRemaining);

  const expiringSoonCount = items.filter((i) => !i.isExpired).length;
  const expiredCount = items.filter((i) => i.isExpired).length;

  return {
    expiringSoonCount,
    expiredCount,
    items,
  };
}
