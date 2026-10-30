import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { resolveForwardTargetAndInterval } from '@/lib/flows/forward-conversation';
import { sendSmartLeadConversationForward } from '@/lib/whatsapp/notification-template';

export interface LeadMessageItem {
  id: string;
  sender_type: string;
  content_type: string;
  content_text: string | null;
  interactive_reply_id?: string | null;
  created_at: string;
}

export interface FilteredLeadItem {
  id: string; // conversation_id
  conversationId: string;
  contactId: string;
  name: string;
  phone: string;
  email?: string | null;
  unreadCount: number;
  conversationStatus: string;
  lastMessageText: string;
  lastMessageAt: string;
  createdAt: string;
  // Extracted + Broker-tagged Real Estate Intelligence
  configuration: string; // '1 BHK' | '2 BHK' | '3 BHK' | '4+ BHK' | 'Commercial' | ''
  budgetRange: string; // e.g. '65 L Below', '65L to 75 L', '90 L Below', '90L to 1.05 cr', '1.10 CR Below', '1.1 CR to 1.3 cr', 'Bigger Carpet 2BHK', etc.
  carpetPreference: string; // 'Bigger Carpet' | 'Standard' | ''
  inquiryType: string; // 'Buy' | 'Rent' | 'Sell' | 'Site Visit'
  leadStage: string; // 'New Inquiry' | 'Hot Lead' | 'Warm Lead' | 'Cold Lead' | 'Site Visit Scheduled' | 'Site Visit Completed' | 'Negotiation' | 'Converted' | 'Not Interested'
  preferredLocation: string;
  possessionTimeline: string; // 'Ready to Move' | 'Under Construction' | 'Immediate' | ''
  followUpDate: string;
  brokerNotes: string;
  siteVisit?: {
    id?: string;
    visitDate?: string;
    visitTime?: string;
    status?: string;
    availabilityText?: string;
  } | null;
  isConvertedClient: boolean;
  clientId?: string | null;
  workflowAnswers: Record<string, string>;
  customerMessagesCount: number;
  totalMessagesCount: number;
  messages: LeadMessageItem[];
}

function detectConfigurationFromText(text: string): string {
  const t = text.toUpperCase();
  if (/\b1\s*BHK\b|\b1BHK\b|BTN_1BHK|B1_/.test(t)) return '1 BHK';
  if (/\b2\s*BHK\b|\b2BHK\b|BTN_2BHK|B2_/.test(t)) return '2 BHK';
  if (/\b3\s*BHK\b|\b3BHK\b|BTN_3BHK|B3_/.test(t)) return '3 BHK';
  if (/\b4\s*BHK\b|\b4BHK\b|\b5\s*BHK\b|PENTHOUSE|VILLA|DUPLEX/.test(t))
    return '4+ BHK';
  if (/\bSHOP\b|\bOFFICE\b|\bCOMMERCIAL\b|\bSHOWROOM\b/.test(t))
    return 'Commercial';
  return '';
}

function detectBudgetFromText(text: string): string {
  const clean = text.trim();
  const knownBudgets = [
    '65 L Below',
    '65L to 75 L',
    'Bigger Carpet 1BHK',
    '90 L Below',
    '90L to 1.05 cr',
    'Bigger Carpet 2BHK',
    '1.10 CR Below',
    '1.1 CR to 1.3 cr',
    'Bigger Carpet 3BHK',
  ];
  for (const b of knownBudgets) {
    if (clean.toLowerCase().includes(b.toLowerCase())) {
      return b;
    }
  }
  const replyIdMap: Record<string, string> = {
    b1_below_65: '65 L Below',
    b1_65_75: '65L to 75 L',
    b1_premium: 'Bigger Carpet 1BHK',
    b2_below_90: '90 L Below',
    b2_90_105: '90L to 1.05 cr',
    b2_premium: 'Bigger Carpet 2BHK',
    b3_below_110: '1.10 CR Below',
    b3_110_130: '1.1 CR to 1.3 cr',
    b3_premium: 'Bigger Carpet 3BHK',
  };
  for (const [id, label] of Object.entries(replyIdMap)) {
    if (clean.toLowerCase().includes(id)) return label;
  }

  // Regex for custom budget mentions like "70L", "85 lakh", "1.2 cr", "50k rent"
  const match = clean.match(
    /\b(\d+(?:\.\d+)?\s*(?:L|LAC|LAKH|LAKHS|CR|CRORE|CRORES|K)\b(?:\s*(?:to|-)\s*\d+(?:\.\d+)?\s*(?:L|LAC|LAKH|CR|CRORE|K))?)/i
  );
  if (match) {
    return match[1].trim();
  }
  return '';
}

function detectInquiryTypeFromText(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(rent|rental|lease|tenant|pg|monthly rent)\b/.test(lower))
    return 'Rent';
  if (/\b(sell|sale my|list my|owner|resale)\b/.test(lower)) return 'Sell';
  if (/\b(site visit|visit|schedule|availability|book slot)\b/.test(lower))
    return 'Site Visit';
  if (/\b(buy|purchase|1\s*bhk|2\s*bhk|3\s*bhk|budget|cr|lakh)\b/.test(lower))
    return 'Buy';
  return '';
}

/**
 * GET /api/filter-leads
 * Returns all Inbox leads with automatically extracted + broker-annotated
 * Configuration (1 BHK, 2 BHK, 3 BHK), Budget Range, Carpet Preference,
 * Inquiry Type, Site Visit details, Lead Stage, and full Inbox Messages.
 */
export async function GET() {
  try {
    const { accountId } = await requireRole('agent');
    const db = supabaseAdmin();

    const [
      convRes,
      runsRes,
      visitsRes,
      customFieldsRes,
      clientsRes,
    ] = await Promise.all([
      db
        .from('conversations')
        .select('*, contact:contacts(*)')
        .eq('account_id', accountId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(250),
      db
        .from('flow_runs')
        .select('*')
        .eq('account_id', accountId)
        .order('started_at', { ascending: false })
        .limit(300),
      db
        .from('site_visits')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(200),
      db
        .from('custom_fields')
        .select('id, field_name')
        .eq('account_id', accountId),
      db
        .from('clients')
        .select('id, name, phone, status')
        .eq('account_id', accountId),
    ]);

    const conversations = convRes.data ?? [];
    const convIds = conversations.map((c: { id: string }) => c.id);
    const contactIds = conversations
      .map((c: { contact_id?: string }) => c.contact_id)
      .filter(Boolean) as string[];

    const [messagesRes, customValuesRes] = await Promise.all([
      convIds.length > 0
        ? db
            .from('messages')
            .select(
              'id, conversation_id, sender_type, content_type, content_text, interactive_reply_id, created_at'
            )
            .in('conversation_id', convIds)
            .order('created_at', { ascending: true })
            .limit(3000)
        : Promise.resolve({ data: [] }),
      contactIds.length > 0
        ? db
            .from('contact_custom_values')
            .select('contact_id, custom_field_id, value')
            .in('contact_id', contactIds)
        : Promise.resolve({ data: [] }),
    ]);

    // Index messages by conversation_id
    const messagesByConv = new Map<string, LeadMessageItem[]>();
    for (const m of (messagesRes.data ?? []) as Array<
      LeadMessageItem & { conversation_id: string }
    >) {
      const list = messagesByConv.get(m.conversation_id) ?? [];
      list.push(m);
      messagesByConv.set(m.conversation_id, list);
    }

    // Index flow_runs by contact_id / conversation_id
    const runsByContact = new Map<
      string,
      Array<{ vars?: Record<string, unknown>; status?: string }>
    >();
    for (const r of (runsRes.data ?? []) as Array<{
      contact_id?: string;
      conversation_id?: string;
      vars?: Record<string, unknown>;
      status?: string;
    }>) {
      const key = r.contact_id || r.conversation_id;
      if (!key) continue;
      const list = runsByContact.get(key) ?? [];
      list.push(r);
      runsByContact.set(key, list);
    }

    // Index site_visits by contact_id / conversation_id
    const visitByContact = new Map<
      string,
      {
        id: string;
        visit_date: string;
        visit_time: string;
        configuration?: string | null;
        budget_range?: string | null;
        status: string;
        notes?: string | null;
      }
    >();
    for (const v of (visitsRes.data ?? []) as Array<{
      id: string;
      contact_id?: string;
      conversation_id?: string;
      visit_date: string;
      visit_time: string;
      configuration?: string | null;
      budget_range?: string | null;
      status: string;
      notes?: string | null;
    }>) {
      const key = v.contact_id || v.conversation_id;
      if (key && !visitByContact.has(key)) {
        visitByContact.set(key, v);
      }
    }

    // Index custom field values by contact_id -> field_name -> value
    const fieldNameById = new Map<string, string>();
    for (const cf of (customFieldsRes.data ?? []) as Array<{
      id: string;
      field_name: string;
    }>) {
      fieldNameById.set(cf.id, cf.field_name);
    }

    const customByContact = new Map<string, Record<string, string>>();
    for (const cv of (customValuesRes.data ?? []) as Array<{
      contact_id: string;
      custom_field_id: string;
      value?: string | null;
    }>) {
      const fName = fieldNameById.get(cv.custom_field_id);
      if (!fName || !cv.value) continue;
      const map = customByContact.get(cv.contact_id) ?? {};
      map[fName] = cv.value;
      customByContact.set(cv.contact_id, map);
    }

    // Index existing clients by normalized last 10 digits of phone
    const clientByPhone = new Map<string, string>();
    for (const cl of (clientsRes.data ?? []) as Array<{
      id: string;
      phone: string;
    }>) {
      const clean = (cl.phone || '').replace(/\D/g, '').slice(-10);
      if (clean.length >= 8) {
        clientByPhone.set(clean, cl.id);
      }
    }

    const INTERNAL_KEYS = new Set([
      'calendar_link',
      'forward_node_key',
      'forward_interval_minutes',
      'forward_scheduled_at',
      'forward_status',
      'forward_sent_at',
      'forward_recipient_phone',
      'forward_last_msg_at',
    ]);

    const items: FilteredLeadItem[] = [];

    for (const conv of conversations as Array<{
      id: string;
      contact_id: string;
      status: string;
      unread_count: number;
      last_message_text?: string | null;
      last_message_at?: string | null;
      created_at: string;
      contact?: {
        id: string;
        name?: string | null;
        phone?: string | null;
        email?: string | null;
      } | null;
    }>) {
      const contactId = conv.contact_id;
      const contact = conv.contact;
      const msgs = messagesByConv.get(conv.id) ?? [];
      const customerMsgs = msgs.filter((m) => m.sender_type === 'customer');
      const runs =
        runsByContact.get(contactId) ?? runsByContact.get(conv.id) ?? [];
      const visit =
        visitByContact.get(contactId) ?? visitByContact.get(conv.id) ?? null;
      const custom = customByContact.get(contactId) ?? {};

      // Merge workflow vars (oldest to newest so latest wins)
      const workflowAnswers: Record<string, string> = {};
      for (const r of [...runs].reverse()) {
        for (const [k, v] of Object.entries(r.vars || {})) {
          if (INTERNAL_KEYS.has(k)) continue;
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            workflowAnswers[k] = String(v).trim();
          }
        }
      }

      // Scan messages for configuration, budget, carpet preference, and inquiry type
      let msgConfig = '';
      let msgBudget = '';
      let msgInquiryType = '';
      let msgCarpet = '';

      for (const m of customerMsgs) {
        const combined = `${m.content_text || ''} ${m.interactive_reply_id || ''}`;
        const c = detectConfigurationFromText(combined);
        if (c) msgConfig = c;
        const b = detectBudgetFromText(combined);
        if (b) msgBudget = b;
        const it = detectInquiryTypeFromText(combined);
        if (it) msgInquiryType = it;
        if (/bigger carpet|large carpet|spacious|b[123]_premium/i.test(combined)) {
          msgCarpet = 'Bigger Carpet';
        }
      }

      const configuration =
        custom.lead_configuration ||
        visit?.configuration ||
        workflowAnswers.configuration ||
        msgConfig ||
        '';

      const budgetRange =
        custom.lead_budget_range ||
        visit?.budget_range ||
        workflowAnswers.budget_range ||
        msgBudget ||
        '';

      const carpetPreference =
        custom.lead_carpet_preference ||
        (budgetRange.toLowerCase().includes('bigger carpet')
          ? 'Bigger Carpet'
          : msgCarpet || '');

      const inquiryType =
        custom.lead_inquiry_type ||
        (visit || workflowAnswers.site_visit_availability
          ? 'Site Visit'
          : msgInquiryType || (configuration || budgetRange ? 'Buy' : 'Buy'));

      const phoneClean = (contact?.phone || '').replace(/\D/g, '').slice(-10);
      const matchedClientId =
        phoneClean.length >= 8 ? (clientByPhone.get(phoneClean) ?? null) : null;
      const isConvertedClient = Boolean(matchedClientId);

      let leadStage = custom.lead_stage || '';
      if (!leadStage) {
        if (isConvertedClient) {
          leadStage = 'Converted';
        } else if (visit?.status === 'completed') {
          leadStage = 'Site Visit Completed';
        } else if (visit || workflowAnswers.site_visit_availability) {
          leadStage = 'Site Visit Scheduled';
        } else if (configuration && budgetRange) {
          leadStage = 'Hot Lead';
        } else if (configuration || budgetRange) {
          leadStage = 'Warm Lead';
        } else {
          leadStage = 'New Inquiry';
        }
      }

      items.push({
        id: conv.id,
        conversationId: conv.id,
        contactId,
        name: contact?.name || contact?.phone || 'WhatsApp Lead',
        phone: contact?.phone || '',
        email: contact?.email ?? null,
        unreadCount: conv.unread_count || 0,
        conversationStatus: conv.status || 'open',
        lastMessageText:
          conv.last_message_text ||
          msgs[msgs.length - 1]?.content_text ||
          'No message text',
        lastMessageAt: conv.last_message_at || conv.created_at,
        createdAt: conv.created_at,
        configuration,
        budgetRange,
        carpetPreference,
        inquiryType,
        leadStage,
        preferredLocation: custom.lead_preferred_location || '',
        possessionTimeline: custom.lead_possession_timeline || '',
        followUpDate: custom.lead_follow_up_date || '',
        brokerNotes: custom.lead_broker_notes || visit?.notes || '',
        siteVisit:
          visit || workflowAnswers.site_visit_availability
            ? {
                id: visit?.id,
                visitDate:
                  visit?.visit_date || workflowAnswers.site_visit_date || '',
                visitTime:
                  visit?.visit_time || workflowAnswers.site_visit_time || '',
                status: visit?.status || 'scheduled',
                availabilityText:
                  workflowAnswers.site_visit_availability ||
                  (visit ? `${visit.visit_date} at ${visit.visit_time}` : ''),
              }
            : null,
        isConvertedClient,
        clientId: matchedClientId,
        workflowAnswers,
        customerMessagesCount: customerMsgs.length,
        totalMessagesCount: msgs.length,
        messages: msgs,
      });
    }

    return NextResponse.json({
      success: true,
      leads: items,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/filter-leads
 * Performs Real Estate Broker actions on filtered leads and persists changes to Supabase:
 * - `update_lead`: Updates configuration, budget_range, lead_stage, inquiry_type,
 *   carpet_preference, preferred_location, possession_timeline, follow_up_date, broker_notes
 * - `schedule_site_visit`: Books or updates a row in `site_visits`
 * - `convert_to_client`: Creates a row in `clients` for the lead
 * - `forward_to_broker`: Forwards the lead's details & conversation to the admin/broker's
 *   configured WhatsApp Contact Number
 */
export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('agent');
    const db = supabaseAdmin();
    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: string };

    // Helper to upsert custom field values on a contact
    const saveContactCustomFields = async (
      contactId: string,
      fieldsToSave: Record<string, string | undefined>
    ) => {
      const { data: existingFields } = await db
        .from('custom_fields')
        .select('id, field_name')
        .eq('account_id', accountId);

      const fieldMap = new Map<string, string>();
      for (const f of (existingFields ?? []) as Array<{
        id: string;
        field_name: string;
      }>) {
        fieldMap.set(f.field_name, f.id);
      }

      for (const [fieldName, rawVal] of Object.entries(fieldsToSave)) {
        if (rawVal === undefined) continue;
        let fieldId = fieldMap.get(fieldName);
        if (!fieldId) {
          const { data: created } = await db
            .from('custom_fields')
            .insert({
              account_id: accountId,
              user_id: userId,
              field_name: fieldName,
              field_type: 'text',
            })
            .select('id')
            .single();
          fieldId = created?.id;
          if (fieldId) fieldMap.set(fieldName, fieldId);
        }
        if (!fieldId) continue;

        const { data: existingVal } = await db
          .from('contact_custom_values')
          .select('id')
          .eq('contact_id', contactId)
          .eq('custom_field_id', fieldId)
          .maybeSingle();

        if (existingVal?.id) {
          await db
            .from('contact_custom_values')
            .update({ value: rawVal })
            .eq('id', existingVal.id);
        } else {
          await db.from('contact_custom_values').insert({
            contact_id: contactId,
            custom_field_id: fieldId,
            value: rawVal,
          });
        }
      }
    };

    if (action === 'update_lead') {
      const {
        contactId,
        configuration,
        budgetRange,
        leadStage,
        inquiryType,
        carpetPreference,
        preferredLocation,
        possessionTimeline,
        followUpDate,
        brokerNotes,
      } = body as {
        contactId: string;
        configuration?: string;
        budgetRange?: string;
        leadStage?: string;
        inquiryType?: string;
        carpetPreference?: string;
        preferredLocation?: string;
        possessionTimeline?: string;
        followUpDate?: string;
        brokerNotes?: string;
      };

      if (!contactId) {
        return NextResponse.json(
          { error: 'contactId is required' },
          { status: 400 }
        );
      }

      await saveContactCustomFields(contactId, {
        lead_configuration: configuration,
        lead_budget_range: budgetRange,
        lead_stage: leadStage,
        lead_inquiry_type: inquiryType,
        lead_carpet_preference: carpetPreference,
        lead_preferred_location: preferredLocation,
        lead_possession_timeline: possessionTimeline,
        lead_follow_up_date: followUpDate,
        lead_broker_notes: brokerNotes,
      });

      // Also sync configuration & budget_range onto latest site_visit if present
      if (configuration || budgetRange || brokerNotes !== undefined) {
        const { data: existingVisit } = await db
          .from('site_visits')
          .select('id')
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingVisit?.id) {
          const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (configuration) patch.configuration = configuration;
          if (budgetRange) patch.budget_range = budgetRange;
          if (brokerNotes !== undefined) patch.notes = brokerNotes;
          await db.from('site_visits').update(patch).eq('id', existingVisit.id);
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'schedule_site_visit') {
      const {
        contactId,
        conversationId,
        clientName,
        clientPhone,
        visitDate,
        visitTime,
        configuration,
        budgetRange,
        notes,
      } = body as {
        contactId: string;
        conversationId?: string;
        clientName?: string;
        clientPhone?: string;
        visitDate: string;
        visitTime: string;
        configuration?: string;
        budgetRange?: string;
        notes?: string;
      };

      if (!visitDate || !visitTime) {
        return NextResponse.json(
          { error: 'Visit date and time are required' },
          { status: 400 }
        );
      }

      const { data: existingVisit } = await db
        .from('site_visits')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingVisit?.id) {
        await db
          .from('site_visits')
          .update({
            visit_date: visitDate,
            visit_time: visitTime,
            configuration: configuration || null,
            budget_range: budgetRange || null,
            status: 'scheduled',
            notes: notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingVisit.id);
      } else {
        await db.from('site_visits').insert({
          account_id: accountId,
          contact_id: contactId,
          conversation_id: conversationId || null,
          visit_date: visitDate,
          visit_time: visitTime,
          configuration: configuration || null,
          budget_range: budgetRange || null,
          client_name: clientName || null,
          client_phone: clientPhone || null,
          status: 'scheduled',
          notes: notes || null,
        });
      }

      await saveContactCustomFields(contactId, {
        lead_stage: 'Site Visit Scheduled',
        ...(configuration ? { lead_configuration: configuration } : {}),
        ...(budgetRange ? { lead_budget_range: budgetRange } : {}),
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'convert_to_client') {
      const {
        contactId,
        name,
        phone,
        email,
        configuration,
        budgetRange,
        preferredLocation,
        brokerNotes,
      } = body as {
        contactId: string;
        name: string;
        phone: string;
        email?: string | null;
        configuration?: string;
        budgetRange?: string;
        preferredLocation?: string;
        brokerNotes?: string;
      };

      if (!name || !phone) {
        return NextResponse.json(
          { error: 'Lead name and phone are required to convert to client' },
          { status: 400 }
        );
      }

      const summaryNotes = [
        configuration ? `Configuration: ${configuration}` : null,
        budgetRange ? `Budget: ${budgetRange}` : null,
        preferredLocation ? `Location: ${preferredLocation}` : null,
        brokerNotes ? `Notes: ${brokerNotes}` : null,
      ]
        .filter(Boolean)
        .join(' • ');

      const { data: createdClient, error: clientErr } = await db
        .from('clients')
        .insert({
          account_id: accountId,
          created_by: userId,
          name,
          phone,
          email: email || null,
          status: 'in_process',
          agreement_details: configuration
            ? `${configuration}${budgetRange ? ` (${budgetRange})` : ''}`
            : null,
          notes: summaryNotes || 'Converted from Filter Leads tab',
        })
        .select('id')
        .single();

      if (clientErr) {
        return NextResponse.json({ error: clientErr.message }, { status: 500 });
      }

      if (contactId) {
        await saveContactCustomFields(contactId, {
          lead_stage: 'Converted',
        });
      }

      return NextResponse.json({
        success: true,
        clientId: createdClient?.id,
      });
    }

    if (action === 'forward_to_broker') {
      const { leads } = body as {
        leads: Array<{
          name: string;
          phone: string;
          configuration?: string;
          budgetRange?: string;
          leadStage?: string;
          inquiryType?: string;
          siteVisitText?: string;
          messagesPreview?: string;
        }>;
      };

      const { recipientPhone } = await resolveForwardTargetAndInterval(
        db,
        accountId,
        userId
      );

      if (!recipientPhone) {
        return NextResponse.json(
          {
            error:
              'Please configure your WhatsApp Contact Number in Settings → Your profile first.',
          },
          { status: 400 }
        );
      }

      let sentCount = 0;
      for (const lead of leads || []) {
        const answersLine = [
          lead.configuration ? `Config: ${lead.configuration}` : null,
          lead.budgetRange ? `Budget: ${lead.budgetRange}` : null,
          lead.inquiryType ? `Purpose: ${lead.inquiryType}` : null,
          lead.leadStage ? `Stage: ${lead.leadStage}` : null,
          lead.siteVisitText ? `Site Visit: ${lead.siteVisitText}` : null,
        ]
          .filter(Boolean)
          .join(' | ');

        const fullText = [
          `🏢 *Filtered Real Estate Lead Summary*`,
          `👤 *Name:* ${lead.name}`,
          `📞 *Phone:* ${lead.phone}`,
          `🏠 *Configuration:* ${lead.configuration || 'Not specified'}`,
          `💰 *Budget Range:* ${lead.budgetRange || 'Not specified'}`,
          `📌 *Stage:* ${lead.leadStage || 'New Inquiry'}`,
          lead.siteVisitText ? `📅 *Site Visit:* ${lead.siteVisitText}` : null,
          ``,
          `💬 *Messages:*`,
          lead.messagesPreview || 'No messages',
        ]
          .filter((l) => l !== null)
          .join('\n');

        await sendSmartLeadConversationForward(db, accountId, userId, {
          recipientPhone,
          clientName: lead.name,
          clientPhone: lead.phone,
          flowName: 'Real Estate Broker Lead Filter',
          answersOneLine: answersLine || 'Property Inquiry',
          conversationOneLine: lead.messagesPreview || 'Lead inquiry in inbox',
          fullTextSummary: fullText,
        });
        sentCount++;
      }

      return NextResponse.json({
        success: true,
        sentCount,
        recipientPhone,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

