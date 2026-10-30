import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  phoneVariants,
  sanitizePhoneForMeta,
} from '@/lib/whatsapp/phone-utils';
import {
  buildClientExpiryItem,
  buildInvestorExpiryItem,
} from '@/lib/investors/check-expiries';
import type { Client, Investor } from '@/types';

/**
 * POST /api/notifications/send
 *
 * Sends a notification message directly to a specific Client or Investor's
 * contact number via the connected WhatsApp Business Cloud API, logs the
 * message in the CRM inbox conversation thread (creating contact/conversation
 * if needed), and marks the notification row as read.
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
    } = body as {
      notificationId?: string;
      entityType?: 'investor' | 'client';
      entityId?: string;
      phone?: string;
      name?: string;
      message?: string;
    };

    const now = new Date();
    let resolvedPhone = typeof inputPhone === 'string' ? inputPhone.trim() : '';
    let resolvedName = typeof inputName === 'string' ? inputName.trim() : '';
    let resolvedMessage =
      typeof inputMessage === 'string' ? inputMessage.trim() : '';

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
        if (!resolvedMessage) {
          const built = buildInvestorExpiryItem(investor, now);
          resolvedMessage =
            built?.suggestedWhatsAppMessage ||
            `Hello ${investor.name}, gentle reminder regarding your property agreement (${investor.purchase_flat_details || 'Flat/Property'}).`;
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
        if (!resolvedMessage) {
          const built = buildClientExpiryItem(client, now);
          resolvedMessage =
            built?.suggestedWhatsAppMessage ||
            `Hello ${client.name}, gentle reminder regarding your tenancy agreement.`;
        }
      }
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

    // 2. Normalize phone number for WhatsApp Cloud API (prepend 91 for 10-digit Indian mobile numbers)
    let sanitizedPhone = sanitizePhoneForMeta(resolvedPhone);
    if (sanitizedPhone.length === 10 && /^[6-9]\d{9}$/.test(sanitizedPhone)) {
      sanitizedPhone = `91${sanitizedPhone}`;
    }

    if (!sanitizedPhone || sanitizedPhone.length < 8) {
      return NextResponse.json(
        {
          error: `Invalid contact phone number: "${resolvedPhone}".`,
        },
        { status: 400 }
      );
    }

    // 3. Load connected WhatsApp config for this account
    const { data: waConfig } = await db
      .from('whatsapp_config')
      .select('phone_number_id, access_token, status')
      .eq('account_id', accountId)
      .eq('status', 'connected')
      .maybeSingle();

    if (!waConfig?.phone_number_id || !waConfig?.access_token) {
      return NextResponse.json(
        {
          error:
            'WhatsApp Business API is not connected for this account. Please connect WhatsApp in Settings.',
          fallbackWaLink: `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(resolvedMessage)}`,
        },
        { status: 400 }
      );
    }

    const accessToken = decrypt(waConfig.access_token);
    const variants = phoneVariants(sanitizedPhone);

    let whatsappMessageId = '';
    let deliveredPhone = sanitizedPhone;
    let lastError: unknown = null;

    for (const candidate of variants) {
      try {
        const res = await sendTextMessage({
          phoneNumberId: waConfig.phone_number_id,
          accessToken,
          to: candidate,
          text: resolvedMessage,
        });
        whatsappMessageId = res.messageId;
        deliveredPhone = candidate;
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (!isRecipientNotAllowedError(msg)) {
          break;
        }
      }
    }

    if (lastError || !whatsappMessageId) {
      const errMsg =
        lastError instanceof Error
          ? lastError.message
          : 'Failed to send WhatsApp notification';
      return NextResponse.json(
        {
          error: errMsg,
          fallbackWaLink: `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(resolvedMessage)}`,
        },
        { status: 502 }
      );
    }

    // 4. Best-effort: Persist to CRM contact + conversation + messages so it shows up in the Inbox
    let persistedConversationId: string | null = null;
    try {
      const { data: existingContacts } = await db
        .from('contacts')
        .select('id, phone, name')
        .eq('account_id', accountId)
        .in('phone', variants)
        .limit(1);

      let contactId = existingContacts?.[0]?.id ?? null;

      if (!contactId) {
        const { data: createdContact } = await db
          .from('contacts')
          .insert({
            account_id: accountId,
            user_id: userId,
            phone: deliveredPhone,
            name: resolvedName || deliveredPhone,
          })
          .select('id')
          .single();
        contactId = createdContact?.id ?? null;
      }

      if (contactId) {
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

        if (persistedConversationId) {
          const nowIso = new Date().toISOString();
          await db.from('messages').insert({
            account_id: accountId,
            conversation_id: persistedConversationId,
            sender_type: 'agent',
            sender_id: userId,
            content_type: 'text',
            content_text: resolvedMessage,
            message_id: whatsappMessageId,
            status: 'sent',
          });

          await db
            .from('conversations')
            .update({
              last_message_text: resolvedMessage.slice(0, 200),
              last_message_at: nowIso,
              updated_at: nowIso,
            })
            .eq('id', persistedConversationId);
        }
      }
    } catch (persistErr) {
      console.warn(
        '[notifications/send] Sent via WhatsApp API, but failed to persist to inbox conversation:',
        persistErr
      );
    }

    // 5. Mark notification as read if notificationId was provided
    if (notificationId) {
      await db
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('account_id', accountId);
    }

    return NextResponse.json({
      success: true,
      whatsappMessageId,
      conversationId: persistedConversationId,
      recipientName: resolvedName || deliveredPhone,
      recipientPhone: deliveredPhone,
    });
  } catch (error) {
    console.error('[notifications/send] Error:', error);
    return toErrorResponse(error);
  }
}

