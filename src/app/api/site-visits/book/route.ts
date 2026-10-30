import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendWhatsAppTextMessage } from '@/lib/whatsapp/meta-api';

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      conversation_id,
      visit_date,
      visit_time,
      client_name,
      client_phone,
      notes,
      configuration,
      budget_range,
    } = body;

    if (!conversation_id || !visit_date || !visit_time) {
      return NextResponse.json(
        { error: 'Missing required booking fields (conversation_id, visit_date, visit_time)' },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // 1. Fetch conversation and linked contact
    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('id, account_id, contact_id, contacts(id, name, phone)')
      .eq('id', conversation_id)
      .maybeSingle();

    if (convErr || !conv) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contactData = conv.contacts as any;
    const resolvedName = client_name || contactData?.name || 'Client';
    const resolvedPhone = client_phone || contactData?.phone || '';

    // 2. Insert into site_visits
    const { data: visit, error: visitErr } = await db
      .from('site_visits')
      .insert({
        account_id: conv.account_id,
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        visit_date,
        visit_time,
        client_name: resolvedName,
        client_phone: resolvedPhone,
        configuration: configuration || null,
        budget_range: budget_range || null,
        notes: notes || null,
        status: 'scheduled',
      })
      .select('*')
      .single();

    if (visitErr) {
      console.error('[site-visits] error creating visit:', visitErr);
      return NextResponse.json({ error: visitErr.message }, { status: 500 });
    }

    // 3. Insert customer message into conversation thread
    const customerMsgText = `📅 Site Visit Scheduled for ${visit_date} at ${visit_time}${
      configuration ? ` (${configuration})` : ''
    }${budget_range ? ` [Budget: ${budget_range}]` : ''}${notes ? ` - Note: ${notes}` : ''}`;

    await db.from('messages').insert({
      conversation_id: conv.id,
      sender_type: 'customer',
      content_type: 'text',
      content_text: customerMsgText,
      status: 'delivered',
    });

    // 4. Send WhatsApp confirmation message if connected
    const { data: config } = await db
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', conv.account_id)
      .eq('status', 'connected')
      .maybeSingle();

    if (config && resolvedPhone) {
      try {
        const token = decrypt(config.access_token);
        const confirmText = `🎉 *Site Visit Confirmed!*\n\n📅 *Date:* ${visit_date}\n⏰ *Time:* ${visit_time}\n🏢 *Configuration:* ${
          configuration || 'Property Inquiry'
        }\n💰 *Budget:* ${
          budget_range || 'Standard'
        }\n\nOur property specialist will be available to assist you during your visit. See you soon!`;

        const metaRes = await sendWhatsAppTextMessage(
          config.phone_number_id,
          token,
          resolvedPhone,
          confirmText
        );

        // Record automated reply message in DB
        await db.from('messages').insert({
          conversation_id: conv.id,
          sender_type: 'user',
          content_type: 'text',
          content_text: confirmText,
          message_id: metaRes.messages?.[0]?.id || null,
          status: 'delivered',
        });
      } catch (waErr) {
        console.warn('[site-visits] failed to send WhatsApp confirmation:', waErr);
      }
    }

    // 5. Update active flow run for this contact to completed
    const { data: activeRun } = await db
      .from('flow_runs')
      .select('id, vars')
      .eq('contact_id', conv.contact_id)
      .eq('status', 'active')
      .maybeSingle();

    if (activeRun) {
      await db
        .from('flow_runs')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          end_reason: 'site_visit_booked_via_calendar',
          vars: {
            ...activeRun.vars,
            site_visit_date: visit_date,
            site_visit_time: visit_time,
            site_visit_status: 'confirmed',
          },
        })
        .eq('id', activeRun.id);
    }

    return NextResponse.json({
      success: true,
      visit,
    });
  } catch (err) {
    console.error('[site-visits] unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown server error' },
      { status: 500 }
    );
  }
}
