import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { BookingCalendarClient } from './booking-calendar-client';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface PageProps {
  params: Promise<{ conversationId: string }>;
}

export default async function BookVisitPage({ params }: PageProps) {
  const { conversationId } = await params;

  if (!conversationId) {
    notFound();
  }

  const db = supabaseAdmin();

  // Load conversation & contact
  const { data: conv, error: convErr } = await db
    .from('conversations')
    .select('id, account_id, contact_id, contacts(id, name, phone), accounts(id, name)')
    .eq('id', conversationId)
    .maybeSingle();

  if (convErr || !conv) {
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contactData = conv.contacts as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountData = conv.accounts as any;

  // Load flow run variables if any
  const { data: run } = await db
    .from('flow_runs')
    .select('vars')
    .eq('conversation_id', conversationId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const flowVars = (run?.vars as Record<string, unknown>) || {};
  const configuration = (flowVars.configuration as string) || '1 BHK';
  const budgetRange = (flowVars.budget_range as string) || '';

  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-muted/20 to-background py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <BookingCalendarClient
          conversationId={conversationId}
          contactName={contactData?.name || ''}
          contactPhone={contactData?.phone || ''}
          configuration={configuration}
          budgetRange={budgetRange}
          businessName={accountData?.name || 'Property Specialist'}
        />
      </div>
    </main>
  );
}
