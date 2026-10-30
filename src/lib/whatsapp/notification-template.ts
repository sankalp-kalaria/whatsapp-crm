import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  sendTemplateMessage,
  sendTextMessage,
} from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  phoneVariants,
  sanitizePhoneForMeta,
} from '@/lib/whatsapp/phone-utils';
import { renderTemplateBody } from '@/lib/whatsapp/template-body';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize';
import type { MessageTemplate } from '@/types';

const META_API_VERSION = 'v21.0';
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export const DEFAULT_NOTIFICATION_TEMPLATES = [
  {
    name: 'workflow_lead_conversation_summary',
    language: 'en_US',
    category: 'UTILITY',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Client Conversation & Lead Summary',
      },
      {
        type: 'BODY',
        text: 'Client Conversation Summary for {{1}} (Phone: {{2}}) in workflow {{3}}. Client Answers: {{4}}. Complete Conversation: {{5}}. End of client summary.',
        example: {
          body_text: [
            [
              'Rohan Sharma',
              '+919876543210',
              'Property Inquiry & Site Visit',
              'Configuration: 2 BHK | Budget: 50L-75L | Site Visit: Scheduled',
              '[10:15 AM] Client: Hi | [10:15 AM] Bot: Welcome! Which configuration are you looking for? | [10:16 AM] Client: 2 BHK',
            ],
          ],
        },
      },
      {
        type: 'FOOTER',
        text: 'Automated CRM Lead Forwarding',
      },
    ],
  },
  {
    name: 'agreement_reminder_template',
    language: 'en_US',
    category: 'UTILITY',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Agreement & Rent Reminder',
      },
      {
        type: 'BODY',
        text: 'Hello {{1}}, this is a friendly reminder regarding your agreement for {{2}}. Current status: {{3}} (Agreement date: {{4}}). {{5}} Please reply to this message if you would like to proceed with renewal or need assistance.',
        example: {
          body_text: [
            [
              'Rajesh Kumar',
              'Flat A-101',
              'Due in 15 days',
              '2026-11-15',
              'Kindly contact us to complete your agreement renewal formalities on time.',
            ],
          ],
        },
      },
      {
        type: 'FOOTER',
        text: 'Property Management Reminder',
      },
    ],
  },
  {
    name: 'client_investor_notification',
    language: 'en_US',
    category: 'UTILITY',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Important Property Notification',
      },
      {
        type: 'BODY',
        text: 'Hello {{1}}, here is an important update regarding your property agreement: {{2}} Please reply to this message if you have any questions.',
        example: {
          body_text: [
            [
              'Amit Patel',
              'Your tenancy agreement for Flat B-202 is due on 2026-11-15 (16 days remaining).',
            ],
          ],
        },
      },
      {
        type: 'FOOTER',
        text: 'Property Management CRM',
      },
    ],
  },
  {
    name: 'agreement_notification_alert',
    language: 'en_US',
    category: 'UTILITY',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Property Agreement Update',
      },
      {
        type: 'BODY',
        text: 'Hello {{1}}, this is an official update regarding your property agreement for {{2}}. Agreement status: {{3}} (End date: {{4}}). {{5}} Please reply to this message if you need any assistance.',
        example: {
          body_text: [
            [
              'Rahul Sharma',
              'Flat A-101',
              'Due in 15 days',
              '2026-11-15',
              'We are preparing to assist with agreement renewal or finding a suitable tenant.',
            ],
          ],
        },
      },
      {
        type: 'FOOTER',
        text: 'Property Management CRM',
      },
    ],
  },
] as const;

interface MetaTemplateComponent {
  type: string;
  text?: string;
  format?: string;
  example?: {
    header_text?: string[];
    header_handle?: string[];
    body_text?: string[][];
  };
}

interface MetaRemoteTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: MetaTemplateComponent[];
}

/**
 * Ensures the notification utility templates exist on Meta WABA and syncs
 * all WABA templates (and their current APPROVED/PENDING statuses) into
 * the local `message_templates` table.
 */
export async function ensureAndSyncNotificationTemplates(
  db: SupabaseClient,
  accountId: string,
  userId: string
): Promise<MessageTemplate[]> {
  const { data: config } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (!config?.waba_id || !config?.access_token) {
    const { data: localOnly } = await db
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    return (localOnly ?? []) as MessageTemplate[];
  }

  const accessToken = decrypt(config.access_token);
  const wabaId = config.waba_id;

  // 1. Fetch existing templates from Meta WABA
  let remoteTemplates: MetaRemoteTemplate[] = [];
  try {
    const res = await fetch(
      `${META_API_BASE}/${wabaId}/message_templates?limit=100&fields=id,name,language,status,category,components`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      const json = (await res.json()) as { data?: MetaRemoteTemplate[] };
      remoteTemplates = json.data ?? [];
    }
  } catch (err) {
    console.warn('[notification-template] Failed to list Meta templates:', err);
  }

  // 2. Submit any missing default notification templates to Meta WABA
  const existingNames = new Set(remoteTemplates.map((t) => t.name));
  let submittedNew = false;

  for (const defTpl of DEFAULT_NOTIFICATION_TEMPLATES) {
    if (!existingNames.has(defTpl.name)) {
      try {
        const submitRes = await fetch(
          `${META_API_BASE}/${wabaId}/message_templates`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(defTpl),
          }
        );
        if (submitRes.ok) {
          submittedNew = true;
        }
      } catch (err) {
        console.warn(
          `[notification-template] Failed to submit ${defTpl.name}:`,
          err
        );
      }
    }
  }

  // Re-fetch if we submitted a new template
  if (submittedNew) {
    try {
      const res = await fetch(
        `${META_API_BASE}/${wabaId}/message_templates?limit=100&fields=id,name,language,status,category,components`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.ok) {
        const json = (await res.json()) as { data?: MetaRemoteTemplate[] };
        remoteTemplates = json.data ?? remoteTemplates;
      }
    } catch {
      // ignore
    }
  }

  // 3. Upsert into local `message_templates`
  for (const t of remoteTemplates) {
    const bodyComp = (t.components ?? []).find((c) => c.type === 'BODY');
    const headerComp = (t.components ?? []).find((c) => c.type === 'HEADER');
    const footerComp = (t.components ?? []).find((c) => c.type === 'FOOTER');

    const catUpper = (t.category || '').toUpperCase();
    const category: 'Marketing' | 'Utility' | 'Authentication' =
      catUpper === 'UTILITY'
        ? 'Utility'
        : catUpper === 'AUTHENTICATION'
          ? 'Authentication'
          : 'Marketing';

    const headerFormat = headerComp?.format?.toUpperCase();
    const headerType =
      headerFormat === 'TEXT' ||
      headerFormat === 'IMAGE' ||
      headerFormat === 'VIDEO' ||
      headerFormat === 'DOCUMENT'
        ? (headerFormat.toLowerCase() as 'text' | 'image' | 'video' | 'document')
        : null;

    const row = {
      account_id: accountId,
      user_id: userId || config.user_id,
      name: t.name,
      category,
      language: t.language || 'en_US',
      header_type: headerType,
      header_content: headerComp?.text ?? null,
      header_handle: headerComp?.example?.header_handle?.[0] ?? null,
      body_text: bodyComp?.text ?? '',
      footer_text: footerComp?.text ?? null,
      sample_values: bodyComp?.example?.body_text?.[0]
        ? { body: bodyComp.example.body_text[0] }
        : null,
      status: normalizeStatus(t.status),
      meta_template_id: t.id,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await db
      .from('message_templates')
      .select('id')
      .eq('account_id', accountId)
      .eq('name', t.name)
      .eq('language', t.language)
      .maybeSingle();

    if (existing?.id) {
      await db
        .from('message_templates')
        .update(row)
        .eq('id', existing.id);
    } else {
      await db.from('message_templates').insert(row);
    }
  }

  const { data: syncedRows } = await db
    .from('message_templates')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  return (syncedRows ?? []) as MessageTemplate[];
}

/**
 * Checks whether the recipient has sent an inbound message within the last
 * 24 hours (Meta's customer service window for free-form text messages).
 */
export async function checkCustomer24HourWindow(
  db: SupabaseClient,
  accountId: string,
  variants: string[]
): Promise<{
  within24h: boolean;
  lastInboundAt: string | null;
  contactId: string | null;
  conversationId: string | null;
}> {
  const { data: contacts } = await db
    .from('contacts')
    .select('id, phone')
    .eq('account_id', accountId)
    .in('phone', variants)
    .limit(5);

  if (!contacts || contacts.length === 0) {
    return {
      within24h: false,
      lastInboundAt: null,
      contactId: null,
      conversationId: null,
    };
  }

  const contactIds = contacts.map((c) => c.id);
  const { data: conversations } = await db
    .from('conversations')
    .select('id, contact_id')
    .eq('account_id', accountId)
    .in('contact_id', contactIds)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (!conversations || conversations.length === 0) {
    return {
      within24h: false,
      lastInboundAt: null,
      contactId: contacts[0].id,
      conversationId: null,
    };
  }

  const convIds = conversations.map((c) => c.id);
  const { data: lastInbound } = await db
    .from('messages')
    .select('id, created_at, conversation_id')
    .in('conversation_id', convIds)
    .eq('sender_type', 'customer')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!lastInbound || lastInbound.length === 0) {
    return {
      within24h: false,
      lastInboundAt: null,
      contactId: contacts[0].id,
      conversationId: conversations[0].id,
    };
  }

  const lastTs = new Date(lastInbound[0].created_at).getTime();
  const cutoffTs = Date.now() - 24 * 60 * 60 * 1000;
  // Leave a 2-minute safety margin so borderline 24h doesn't fail with 131047
  const within24h = lastTs > cutoffTs + 2 * 60 * 1000;

  return {
    within24h,
    lastInboundAt: lastInbound[0].created_at,
    contactId: contacts[0].id,
    conversationId: lastInbound[0].conversation_id,
  };
}

/**
 * Picks the best APPROVED template for sending a client/investor notification
 * outside the 24-hour customer service window and builds its parameters.
 */
export function selectApprovedNotificationTemplate(
  templates: MessageTemplate[],
  context: {
    recipientName: string;
    fullMessage: string;
    flatDetails?: string | null;
    endDate?: string | null;
    daysStatusLabel?: string | null;
    preferredTemplateName?: string | null;
  }
): {
  template: MessageTemplate;
  bodyParams: string[];
  renderedText: string;
  isParameterized: boolean;
} | null {
  const approved = templates.filter(
    (t) => (t.status || '').toUpperCase() === 'APPROVED'
  );
  if (approved.length === 0) return null;

  const cleanOneLine = (str: string) =>
    str.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  const nameVal = cleanOneLine(context.recipientName || 'Customer');
  const flatVal = cleanOneLine(context.flatDetails || 'Property Unit');
  const statusVal = cleanOneLine(context.daysStatusLabel || 'Scheduled Reminder');
  const dateVal = cleanOneLine(context.endDate || new Date().toISOString().slice(0, 10));
  const msgVal = cleanOneLine(context.fullMessage).slice(0, 900);

  // Ordered candidate names
  const priorityOrder = [
    ...(context.preferredTemplateName ? [context.preferredTemplateName] : []),
    'agreement_reminder_template',
    'agreement_notification_alert',
    'client_investor_notification',
  ];

  let chosen: MessageTemplate | undefined;
  for (const name of priorityOrder) {
    chosen = approved.find((t) => t.name === name);
    if (chosen) break;
  }

  // Next, prefer any APPROVED template that has body variables ({{1}}...) and no media header requirement
  if (!chosen) {
    chosen = approved.find(
      (t) =>
        extractVariableIndices(t.body_text || '').length > 0 &&
        (!t.header_type || t.header_type === 'text')
    );
  }

  // Finally, fallback to any APPROVED template with no media header requirement (e.g., `hello` or `3p_direct_integration_test_template`)
  if (!chosen) {
    chosen =
      approved.find((t) => !t.header_type || t.header_type === 'text') ??
      approved[0];
  }

  const varCount = extractVariableIndices(chosen.body_text || '').length;
  let bodyParams: string[] = [];

  if (
    chosen.name === 'agreement_reminder_template' ||
    chosen.name === 'agreement_notification_alert' ||
    varCount === 5
  ) {
    bodyParams = [
      nameVal,
      flatVal,
      statusVal,
      dateVal,
      'We are ready to assist you with agreement renewal or property formalities.',
    ].slice(0, varCount);
  } else if (chosen.name === 'client_investor_notification' || varCount === 2) {
    bodyParams = [nameVal, msgVal].slice(0, varCount);
  } else if (varCount === 1) {
    bodyParams = [msgVal];
  } else if (varCount > 0) {
    const pool = [nameVal, msgVal, flatVal, dateVal, statusVal];
    bodyParams = Array.from({ length: varCount }, (_, i) => pool[i] || nameVal);
  }

  const renderedText =
    varCount > 0
      ? renderTemplateBody(chosen.body_text || '', bodyParams)
      : chosen.body_text || `[Template: ${chosen.name}]`;

  return {
    template: chosen,
    bodyParams,
    renderedText,
    isParameterized: varCount > 0,
  };
}

export interface SmartNotificationSendOptions {
  phone: string;
  name: string;
  message: string;
  flatDetails?: string | null;
  endDate?: string | null;
  daysStatusLabel?: string | null;
  forceTemplate?: boolean;
  preferredTemplateName?: string | null;
}

export interface SmartNotificationSendResult {
  whatsappMessageId: string;
  deliveredPhone: string;
  sentAs: 'text' | 'template';
  templateName?: string;
  outside24hWindow: boolean;
  isParameterizedTemplate?: boolean;
  renderedText: string;
  contactId: string | null;
  conversationId: string | null;
}

/**
 * Sends a WhatsApp notification using free-form text if the recipient has
 * replied within the last 24 hours, OR automatically switches to an APPROVED
 * WhatsApp Template when outside the 24-hour customer service window (preventing
 * Meta error 131047 "Re-engagement message").
 */
export async function sendSmartWhatsAppNotification(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  options: SmartNotificationSendOptions
): Promise<SmartNotificationSendResult> {
  let sanitizedPhone = sanitizePhoneForMeta(options.phone);
  if (sanitizedPhone.length === 10 && /^[6-9]\d{9}$/.test(sanitizedPhone)) {
    sanitizedPhone = `91${sanitizedPhone}`;
  }

  if (!sanitizedPhone || sanitizedPhone.length < 8) {
    throw new Error(`Invalid contact phone number: "${options.phone}".`);
  }

  const { data: waConfig } = await db
    .from('whatsapp_config')
    .select('phone_number_id, waba_id, access_token, status')
    .eq('account_id', accountId)
    .eq('status', 'connected')
    .maybeSingle();

  if (!waConfig?.phone_number_id || !waConfig?.access_token) {
    throw new Error(
      'WhatsApp Business API is not connected for this account. Please connect WhatsApp in Settings.'
    );
  }

  const accessToken = decrypt(waConfig.access_token);
  const variants = phoneVariants(sanitizedPhone);

  // Check if the customer replied within the last 24 hours
  const windowCheck = await checkCustomer24HourWindow(db, accountId, variants);
  const useTemplate =
    Boolean(options.forceTemplate) ||
    Boolean(options.preferredTemplateName) ||
    !windowCheck.within24h;

  if (!useTemplate) {
    // Customer replied within 24 hours -> free-form text message is allowed by Meta!
    let whatsappMessageId = '';
    let deliveredPhone = sanitizedPhone;
    let lastErr: unknown = null;

    for (const candidate of variants) {
      try {
        const res = await sendTextMessage({
          phoneNumberId: waConfig.phone_number_id,
          accessToken,
          to: candidate,
          text: options.message,
        });
        whatsappMessageId = res.messageId;
        deliveredPhone = candidate;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (!isRecipientNotAllowedError(msg)) break;
      }
    }

    if (!lastErr && whatsappMessageId) {
      return {
        whatsappMessageId,
        deliveredPhone,
        sentAs: 'text',
        outside24hWindow: false,
        renderedText: options.message,
        contactId: windowCheck.contactId,
        conversationId: windowCheck.conversationId,
      };
    }
  }

  // Outside 24-hour window (or template explicitly requested) -> MUST use an APPROVED template to avoid 131047!
  const templates = await ensureAndSyncNotificationTemplates(
    db,
    accountId,
    userId
  );

  const selected = selectApprovedNotificationTemplate(templates, {
    recipientName: options.name,
    fullMessage: options.message,
    flatDetails: options.flatDetails,
    endDate: options.endDate,
    daysStatusLabel: options.daysStatusLabel,
    preferredTemplateName: options.preferredTemplateName,
  });

  if (!selected) {
    throw new Error(
      'More than 24 hours have passed since the customer last replied (Meta code 131047), and no APPROVED WhatsApp template was found on your WABA.'
    );
  }

  let whatsappMessageId = '';
  let deliveredPhone = sanitizedPhone;
  let lastError: unknown = null;

  for (const candidate of variants) {
    try {
      const res = await sendTemplateMessage({
        phoneNumberId: waConfig.phone_number_id,
        accessToken,
        to: candidate,
        templateName: selected.template.name,
        language: selected.template.language || 'en_US',
        template: selected.template,
        messageParams: {
          body: selected.bodyParams,
        },
      });
      whatsappMessageId = res.messageId;
      deliveredPhone = candidate;
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRecipientNotAllowedError(msg)) break;
    }
  }

  if (lastError || !whatsappMessageId) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to send WhatsApp notification template');
  }

  return {
    whatsappMessageId,
    deliveredPhone,
    sentAs: 'template',
    templateName: selected.template.name,
    outside24hWindow: !windowCheck.within24h,
    isParameterizedTemplate: selected.isParameterized,
    renderedText: selected.renderedText,
    contactId: windowCheck.contactId,
    conversationId: windowCheck.conversationId,
  };
}

export interface LeadConversationForwardSendOptions {
  recipientPhone: string;
  clientName: string;
  clientPhone: string;
  flowName: string;
  answersOneLine: string;
  conversationOneLine: string;
  fullTextSummary: string;
}

/**
 * Sends a single client's consolidated Lead & Conversation Summary to the admin's
 * configured WhatsApp Contact Number.
 *
 * - If the admin's number replied within the last 24 hours, sends the full
 *   multi-line formatted summary via `sendTextMessage`.
 * - If more than 24 hours have passed (preventing Meta error 131047), automatically
 *   sends using an APPROVED WhatsApp Template (`workflow_lead_conversation_summary`,
 *   `client_investor_notification`, or `agreement_notification_alert`) populated
 *   with the client's name, phone, workflow answers, and complete new conversation timeline.
 */
export async function sendSmartLeadConversationForward(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  options: LeadConversationForwardSendOptions
): Promise<{
  whatsappMessageId: string;
  deliveredPhone: string;
  sentAs: 'text' | 'template';
  templateName?: string;
}> {
  let sanitizedPhone = sanitizePhoneForMeta(options.recipientPhone);
  if (sanitizedPhone.length === 10 && /^[6-9]\d{9}$/.test(sanitizedPhone)) {
    sanitizedPhone = `91${sanitizedPhone}`;
  }

  const { data: waConfig } = await db
    .from('whatsapp_config')
    .select('phone_number_id, waba_id, access_token, status')
    .eq('account_id', accountId)
    .eq('status', 'connected')
    .maybeSingle();

  if (!waConfig?.phone_number_id || !waConfig?.access_token) {
    throw new Error('whatsapp_not_connected');
  }

  const accessToken = decrypt(waConfig.access_token);
  const variants = phoneVariants(sanitizedPhone);

  const windowCheck = await checkCustomer24HourWindow(db, accountId, variants);

  if (windowCheck.within24h) {
    let whatsappMessageId = '';
    let deliveredPhone = sanitizedPhone;
    let lastErr: unknown = null;

    for (const candidate of variants) {
      try {
        const res = await sendTextMessage({
          phoneNumberId: waConfig.phone_number_id,
          accessToken,
          to: candidate,
          text: options.fullTextSummary,
        });
        whatsappMessageId = res.messageId;
        deliveredPhone = candidate;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (!isRecipientNotAllowedError(msg)) break;
      }
    }

    if (!lastErr && whatsappMessageId) {
      return {
        whatsappMessageId,
        deliveredPhone,
        sentAs: 'text',
      };
    }
  }

  // Outside 24h window -> send via APPROVED WhatsApp template
  const templates = await ensureAndSyncNotificationTemplates(
    db,
    accountId,
    userId
  );
  const approved = templates.filter(
    (t) => (t.status || '').toUpperCase() === 'APPROVED'
  );

  if (approved.length === 0) {
    throw new Error('no_approved_template_for_lead_forward');
  }

  const cleanParam = (s: string, maxLen = 450) =>
    (s || 'N/A')
      .replace(/[\r\n\t]+/g, ' | ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, maxLen) || 'N/A';

  const cName = cleanParam(options.clientName, 120);
  const cPhone = cleanParam(options.clientPhone, 60);
  const fName = cleanParam(options.flowName, 120);
  const ansLine = cleanParam(options.answersOneLine, 420);
  const convLine = cleanParam(options.conversationOneLine, 480);

  const priorityNames = [
    'workflow_lead_conversation_summary',
    'client_investor_notification',
    'agreement_notification_alert',
    'agreement_reminder_template',
  ];

  let chosen: MessageTemplate | undefined;
  for (const name of priorityNames) {
    chosen = approved.find((t) => t.name === name);
    if (chosen) break;
  }
  if (!chosen) {
    chosen =
      approved.find((t) => !t.header_type || t.header_type === 'text') ??
      approved[0];
  }

  const varCount = extractVariableIndices(chosen.body_text || '').length;
  let bodyParams: string[] = [];

  if (chosen.name === 'workflow_lead_conversation_summary') {
    bodyParams = [cName, cPhone, fName, ansLine, convLine].slice(0, varCount);
  } else if (chosen.name === 'client_investor_notification' || varCount === 2) {
    bodyParams = [
      cleanParam(`Admin — Lead: ${cName} (${cPhone}) [${fName}]`, 180),
      cleanParam(`Answers: ${ansLine} || Conversation: ${convLine}`, 850),
    ].slice(0, varCount);
  } else if (varCount === 5) {
    bodyParams = [
      cleanParam(`${cName} (${cPhone})`, 140),
      fName,
      ansLine,
      new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      cleanParam(`Chat: ${convLine}`, 450),
    ];
  } else if (varCount > 0) {
    const pool = [cName, cPhone, fName, ansLine, convLine];
    bodyParams = Array.from({ length: varCount }, (_, i) => pool[i] || cName);
  }

  let whatsappMessageId = '';
  let deliveredPhone = sanitizedPhone;
  let lastError: unknown = null;

  for (const candidate of variants) {
    try {
      const res = await sendTemplateMessage({
        phoneNumberId: waConfig.phone_number_id,
        accessToken,
        to: candidate,
        templateName: chosen.name,
        language: chosen.language || 'en_US',
        template: chosen,
        messageParams: {
          body: bodyParams,
        },
      });
      whatsappMessageId = res.messageId;
      deliveredPhone = candidate;
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRecipientNotAllowedError(msg)) break;
    }
  }

  if (lastError || !whatsappMessageId) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to send lead summary template');
  }

  return {
    whatsappMessageId,
    deliveredPhone,
    sentAs: 'template',
    templateName: chosen.name,
  };
}


