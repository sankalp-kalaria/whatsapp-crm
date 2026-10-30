import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';
import {
  buildClientExpiryItem,
  buildInvestorExpiryItem,
  calculateDaysFromToday,
} from '@/lib/investors/check-expiries';
import { sendSmartWhatsAppNotification } from '@/lib/whatsapp/notification-template';
import type { Client, Investor } from '@/types';

/**
 * POST /api/notifications/send
 *
 * Sends a notification message directly to a specific Client or Investor's
 * contact number via the connected WhatsApp Business Cloud API.
 *
 * Automatically checks Meta's 24-hour customer service window:
 * - If the customer replied within the last 24 hours, sends the full text message.
 * - If more than 24 hours have passed (which causes Meta error 131047 on text
 *   messages), automatically sends an APPROVED WhatsApp Message Template
 *   (`agreement_notification_alert`, `client_investor_notification`, or the
 *   selected approved template on the WABA).
 */
export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('agent');
    const db = supabaseAdmin();

    const body = await request.json().catch(() => ({}));
    const {
      notificationId,
      entityType,
      entityId,
      phone: inputPhone,
      name: inputName,
      message: inputMessage,
      flatDetails: inputFlatDetails,
      endDate: inputEndDate,
      daysStatusLabel: inputDaysStatusLabel,
      forceTemplate,
      templateName: preferredTemplateName,
    } = body as {
      notificationId?: string;
      entityType?: 'investor' | 'client';
      entityId?: string;
      phone?: string;
      name?: string;
      message?: string;
      flatDetails?: string | null;
      endDate?: string | null;
      daysStatusLabel?: string | null;
      forceTemplate?: boolean;
      templateName?: string | null;
    };

    const now = new Date();
    let resolvedPhone = typeof inputPhone === 'string' ? inputPhone.trim() : '';
    let resolvedName = typeof inputName === 'string' ? inputName.trim() : '';
    let resolvedMessage =
      typeof inputMessage === 'string' ? inputMessage.trim() : '';
    let resolvedFlatDetails = inputFlatDetails ?? null;
    let resolvedEndDate = inputEndDate ?? null;
    let resolvedDaysLabel = inputDaysStatusLabel ?? null;

    // 1. Resolve from live Investor or Client record on the spot if needed
    if (entityType === 'investor' && entityId) {
      const { data: inv } = await db
        .from('investors')
        .select('*')
        .eq('id', entityId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (inv) {
        const investor = inv as Investor;
        if (!resolvedPhone) resolvedPhone = investor.phone || '';
        if (!resolvedName) resolvedName = investor.name || 'Investor';
        if (!resolvedFlatDetails)
          resolvedFlatDetails = investor.purchase_flat_details || 'Flat/Property';
        const built = buildInvestorExpiryItem(investor, now);
        if (built) {
          if (!resolvedEndDate) resolvedEndDate = built.endDate;
          if (!resolvedDaysLabel) resolvedDaysLabel = built.daysStatusLabel;
          if (!resolvedMessage) resolvedMessage = built.suggestedWhatsAppMessage;
        } else if (!resolvedMessage) {
          resolvedMessage = `Hello ${investor.name}, gentle reminder regarding your property agreement (${investor.purchase_flat_details || 'Flat/Property'}).`;
        }
      }
    } else if (entityType === 'client' && entityId) {
      const { data: cl } = await db
        .from('clients')
        .select('*, investor:investors(*)')
        .eq('id', entityId)
        .eq('account_id', accountId)
        .maybeSingle();

      if (cl) {
        const client = cl as Client & { investor?: Investor | null };
        if (!resolvedPhone) resolvedPhone = client.phone || '';
        if (!resolvedName) resolvedName = client.name || 'Client';
        if (!resolvedFlatDetails)
          resolvedFlatDetails =
            client.investor?.purchase_flat_details || 'Rented Unit';
        const built = buildClientExpiryItem(client, now);
        if (built) {
          if (!resolvedEndDate) resolvedEndDate = built.endDate;
          if (!resolvedDaysLabel) resolvedDaysLabel = built.daysStatusLabel;
          if (!resolvedMessage) resolvedMessage = built.suggestedWhatsAppMessage;
        } else if (!resolvedMessage) {
          resolvedMessage = `Hello ${client.name}, gentle reminder regarding your tenancy agreement.`;
        }
      }
    }

    if (resolvedEndDate && !resolvedDaysLabel) {
      resolvedDaysLabel = calculateDaysFromToday(
        resolvedEndDate,
        now
      ).daysStatusLabel;
    }

    if (!resolvedPhone) {
      return NextResponse.json(
        {
          error:
            'Contact phone number is missing for this client/investor. Please add a valid phone number first.',
        },
        { status: 400 }
      );
    }

    if (!resolvedMessage) {
      resolvedMessage = `Hello ${resolvedName || 'there'}, this is an important notification regarding your property agreement.`;
    }

    let sanitizedPhone = sanitizePhoneForMeta(resolvedPhone);
    if (sanitizedPhone.length === 10 && /^[6-9]\d{9}$/.test(sanitizedPhone)) {
      sanitizedPhone = `91${sanitizedPhone}`;
    }

    // 2. Send via Smart WhatsApp Notification (auto-uses Template outside 24h window to prevent 131047)
    let sendResult;
    try {
      sendResult = await sendSmartWhatsAppNotification(db, accountId, userId, {
        phone: sanitizedPhone,
        name: resolvedName || sanitizedPhone,
        message: resolvedMessage,
        flatDetails: resolvedFlatDetails,
        endDate: resolvedEndDate,
        daysStatusLabel: resolvedDaysLabel,
        forceTemplate,
        preferredTemplateName,
      });
    } catch (sendErr) {
      const errMsg =
        sendErr instanceof Error
          ? sendErr.message
          : 'Failed to send WhatsApp notification';
      return NextResponse.json(
        {
          error: errMsg,
          fallbackWaLink: `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(resolvedMessage)}`,
        },
        { status: 502 }
      );
    }

    // 3. Persist to CRM contact + conversation + messages so it shows up in the Inbox
    let persistedConversationId: string | null = sendResult.conversationId;
    try {
      let contactId = sendResult.contactId;

      if (!contactId) {
        const { data: createdContact } = await db
          .from('contacts')
          .insert({
            account_id: accountId,
            user_id: userId,
            phone: sendResult.deliveredPhone,
            name: resolvedName || sendResult.deliveredPhone,
          })
          .select('id')
          .single();
        contactId = createdContact?.id ?? null;
      }

      if (contactId && !persistedConversationId) {
        const { data: existingConv } = await db
          .from('conversations')
          .select('id')
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .maybeSingle();

        if (existingConv?.id) {
          persistedConversationId = existingConv.id;
        } else {
          const { data: createdConv } = await db
            .from('conversations')
            .insert({
              account_id: accountId,
              user_id: userId,
              contact_id: contactId,
              status: 'open',
              unread_count: 0,
            })
            .select('id')
            .single();
          persistedConversationId = createdConv?.id ?? null;
        }
      }

      if (persistedConversationId) {
        const nowIso = new Date().toISOString();
        await db.from('messages').insert({
          account_id: accountId,
          conversation_id: persistedConversationId,
          sender_type: 'agent',
          sender_id: userId,
          content_type: sendResult.sentAs,
          template_name: sendResult.templateName ?? null,
          content_text: sendResult.renderedText,
          message_id: sendResult.whatsappMessageId,
          status: 'sent',
        });

        await db
          .from('conversations')
          .update({
            last_message_text: sendResult.renderedText.slice(0, 200),
            last_message_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', persistedConversationId);
      }
    } catch (persistErr) {
      console.warn(
        '[notifications/send] Sent via WhatsApp API, but failed to persist to inbox conversation:',
        persistErr
      );
    }

    // 4. Mark notification as read if notificationId was provided
    if (notificationId) {
      await db
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('account_id', accountId);
    }

    return NextResponse.json({
      success: true,
      whatsappMessageId: sendResult.whatsappMessageId,
      sentAs: sendResult.sentAs,
      templateName: sendResult.templateName,
      outside24hWindow: sendResult.outside24hWindow,
      isParameterizedTemplate: sendResult.isParameterizedTemplate,
      conversationId: persistedConversationId,
      recipientName: resolvedName || sendResult.deliveredPhone,
      recipientPhone: sendResult.deliveredPhone,
      fallbackWaLink: `https://wa.me/${sendResult.deliveredPhone}?text=${encodeURIComponent(resolvedMessage)}`,
    });
  } catch (error) {
    console.error('[notifications/send] Error:', error);
    return toErrorResponse(error);
  }
}
