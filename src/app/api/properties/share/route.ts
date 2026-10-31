import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  sendMediaMessage,
  sendTemplateMessage,
  sendTextMessage,
} from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  phoneVariants,
  sanitizePhoneForMeta,
} from '@/lib/whatsapp/phone-utils';
import {
  checkCustomer24HourWindow,
  ensureAndSyncNotificationTemplates,
} from '@/lib/whatsapp/notification-template';
import { renderTemplateBody } from '@/lib/whatsapp/template-body';
import { extractVariableIndices } from '@/lib/whatsapp/template-validators';
import type { MessageTemplate, Property, PropertyMediaItem } from '@/types';

export interface ShareRecipientInput {
  name: string;
  phone: string;
  contactId?: string;
}

export interface SharePropertyRequestBody {
  propertyId?: string;
  property?: Partial<Property>;
  recipients: ShareRecipientInput[];
  customMessage?: string;
  mediaItems?: PropertyMediaItem[];
  deliveryMode?: string; // 'auto' | template name
  forceTemplate?: boolean;
}

function buildPropertyFormattedMessage(
  prop: Partial<Property>,
  mediaItems: PropertyMediaItem[],
  recipientName?: string
): {
  fullText: string;
  specsSummary: string;
  mediaSummary: string;
  titleSummary: string;
} {
  const title = prop.title || 'Property Listing';
  const typeLabel = prop.property_type
    ? prop.property_type.toUpperCase()
    : 'PROPERTY';
  const bhkLabel = prop.bedrooms ? `${prop.bedrooms} BHK ` : '';
  const titleSummary = `${title} (${bhkLabel}${typeLabel})`;

  const listingKind =
    prop.listing_type === 'rent' ? 'Rent' : 'Sell Price';
  const priceStr = prop.price
    ? `₹${Number(prop.price).toLocaleString('en-IN')}`
    : 'Price on Request';

  const specParts = [
    `${listingKind}: ${priceStr}`,
    prop.bedrooms ? `Configuration: ${prop.bedrooms} BHK` : null,
    prop.bathrooms ? `Bathrooms: ${prop.bathrooms}` : null,
    prop.area_sqft ? `Carpet/Super Area: ${prop.area_sqft} sq.ft.` : null,
    prop.address
      ? `Location: ${prop.address}${prop.city ? `, ${prop.city}` : ''}`
      : prop.city
        ? `City: ${prop.city}`
        : null,
    prop.description ? `Details: ${prop.description}` : null,
  ].filter(Boolean) as string[];

  const specsSummary = specParts.join(' | ');

  const mediaLinks: string[] = [];
  mediaItems.forEach((m, idx) => {
    if (m.url) {
      const label = m.type === 'video' ? `Video ${idx + 1}` : `Photo ${idx + 1}`;
      mediaLinks.push(`${label}: ${m.url}`);
    }
  });
  if (prop.google_drive_folder_url) {
    mediaLinks.push(`Google Drive Album: ${prop.google_drive_folder_url}`);
  }

  const mediaSummary =
    mediaLinks.length > 0
      ? mediaLinks.join(' | ')
      : 'Contact us for full photo & video walkthrough.';

  const lines = [
    recipientName ? `Hello *${recipientName}*,` : 'Hello,',
    `Here are the complete property details for *${titleSummary}*:`,
    '',
    `🏢 *Property:* ${titleSummary}`,
    `💰 *${listingKind}:* ${priceStr}`,
    prop.bedrooms ? `🛏️ *Configuration:* ${prop.bedrooms} BHK` : null,
    prop.bathrooms ? `🚿 *Bathrooms:* ${prop.bathrooms}` : null,
    prop.area_sqft ? `📐 *Area:* ${prop.area_sqft} sq.ft.` : null,
    prop.address || prop.city
      ? `📍 *Location:* ${[prop.address, prop.city].filter(Boolean).join(', ')}`
      : null,
    prop.description ? `\n📝 *Overview:*\n${prop.description}` : null,
    mediaLinks.length > 0
      ? `\n🖼️ *Photos & Videos:*\n${mediaLinks.map((l) => `• ${l}`).join('\n')}`
      : null,
    '',
    'Please reply to this message if you would like to schedule a site visit or need further details!',
  ].filter((l) => l !== null);

  return {
    fullText: lines.join('\n'),
    specsSummary,
    mediaSummary,
    titleSummary,
  };
}

function selectApprovedPropertyTemplate(
  templates: MessageTemplate[],
  context: {
    recipientName: string;
    titleSummary: string;
    specsSummary: string;
    mediaSummary: string;
    fullText: string;
    preferredTemplateName?: string | null;
  }
): {
  template: MessageTemplate;
  bodyParams: string[];
  renderedText: string;
} | null {
  const approved = templates.filter(
    (t) => (t.status || '').toUpperCase() === 'APPROVED'
  );
  if (approved.length === 0) return null;

  const cleanOneLine = (str: string, max = 450) =>
    (str || 'N/A')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, max) || 'N/A';

  const rName = cleanOneLine(context.recipientName || 'Customer', 100);
  const titleVal = cleanOneLine(context.titleSummary, 160);
  const specsVal = cleanOneLine(context.specsSummary, 420);
  const mediaVal = cleanOneLine(context.mediaSummary, 420);
  const combinedVal = cleanOneLine(
    `Property: ${titleVal} | ${specsVal} | Media: ${mediaVal}`,
    880
  );

  const priorityOrder = [
    ...(context.preferredTemplateName &&
    context.preferredTemplateName !== 'auto'
      ? [context.preferredTemplateName]
      : []),
    'property_listing_share',
    'client_investor_notification',
    'agreement_notification_alert',
    'agreement_reminder_template',
  ];

  let chosen: MessageTemplate | undefined;
  for (const name of priorityOrder) {
    chosen = approved.find((t) => t.name === name);
    if (chosen) break;
  }

  if (!chosen) {
    chosen = approved.find(
      (t) =>
        extractVariableIndices(t.body_text || '').length > 0 &&
        (!t.header_type || t.header_type === 'text')
    );
  }

  if (!chosen) {
    chosen =
      approved.find((t) => !t.header_type || t.header_type === 'text') ??
      approved[0];
  }

  const varCount = extractVariableIndices(chosen.body_text || '').length;
  let bodyParams: string[] = [];

  if (chosen.name === 'property_listing_share' || varCount === 4) {
    bodyParams = [rName, titleVal, specsVal, mediaVal].slice(0, varCount);
  } else if (chosen.name === 'client_investor_notification' || varCount === 2) {
    bodyParams = [rName, combinedVal].slice(0, varCount);
  } else if (
    chosen.name === 'agreement_notification_alert' ||
    chosen.name === 'agreement_reminder_template' ||
    varCount === 5
  ) {
    bodyParams = [
      rName,
      titleVal,
      specsVal,
      new Date().toISOString().slice(0, 10),
      `Photos & Videos: ${mediaVal}`,
    ].slice(0, varCount);
  } else if (varCount === 1) {
    bodyParams = [combinedVal];
  } else if (varCount > 0) {
    const pool = [rName, titleVal, specsVal, mediaVal, combinedVal];
    bodyParams = Array.from({ length: varCount }, (_, i) => pool[i] || rName);
  }

  const renderedText =
    varCount > 0
      ? renderTemplateBody(chosen.body_text || '', bodyParams)
      : chosen.body_text || context.fullText;

  return {
    template: chosen,
    bodyParams,
    renderedText,
  };
}

/**
 * POST /api/properties/share
 *
 * Shares complete Property Details along with selected Images & Videos to one or
 * multiple Contacts / Clients / Investors via WhatsApp Business Cloud API.
 *
 * - Inside the 24-hour customer reply window: sends native Image & Video media
 *   messages + the full formatted Property Details text.
 * - Outside the 24-hour customer reply window (Meta code 131047): automatically
 *   sends using an APPROVED WhatsApp Template (`property_listing_share` /
 *   `client_investor_notification` / `agreement_notification_alert`) populated
 *   with all property specifications and direct photo/video/Drive links so it
 *   can be delivered anytime!
 * - Persists every sent message and media item to `conversations` & `messages`
 *   so it appears immediately in the CRM Inbox.
 */
export async function POST(request: Request) {
  try {
    const { accountId, userId } = await requireRole('agent');
    const db = supabaseAdmin();

    const body = (await request
      .json()
      .catch(() => ({}))) as SharePropertyRequestBody;

    const recipients = Array.isArray(body.recipients) ? body.recipients : [];
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one contact to share this property with.' },
        { status: 400 }
      );
    }

    let propertyData: Partial<Property> = body.property ?? {};
    if (body.propertyId) {
      const { data: dbProp } = await db
        .from('properties')
        .select('*')
        .eq('id', body.propertyId)
        .eq('account_id', accountId)
        .maybeSingle();
      if (dbProp) {
        propertyData = dbProp as Property;
      }
    }

    const mediaItems: PropertyMediaItem[] = Array.isArray(body.mediaItems)
      ? body.mediaItems
      : Array.isArray(propertyData.media_urls)
        ? propertyData.media_urls
        : [];

    const { data: waConfig } = await db
      .from('whatsapp_config')
      .select('phone_number_id, waba_id, access_token, status')
      .eq('account_id', accountId)
      .eq('status', 'connected')
      .maybeSingle();

    if (!waConfig?.phone_number_id || !waConfig?.access_token) {
      return NextResponse.json(
        {
          error:
            'WhatsApp Business API is not connected. Please connect WhatsApp in Settings.',
        },
        { status: 400 }
      );
    }

    const accessToken = decrypt(waConfig.access_token);
    const templates = await ensureAndSyncNotificationTemplates(
      db,
      accountId,
      userId
    );

    const results: Array<{
      phone: string;
      name: string;
      success: boolean;
      sentAs?: 'media_and_text' | 'text' | 'template';
      templateName?: string;
      mediaSentCount?: number;
      conversationId?: string | null;
      error?: string;
      waLink?: string;
    }> = [];

    for (const recipient of recipients) {
      let sanitizedPhone = sanitizePhoneForMeta(recipient.phone || '');
      if (sanitizedPhone.length === 10 && /^[6-9]\d{9}$/.test(sanitizedPhone)) {
        sanitizedPhone = `91${sanitizedPhone}`;
      }

      if (!sanitizedPhone || sanitizedPhone.length < 8) {
        results.push({
          phone: recipient.phone,
          name: recipient.name,
          success: false,
          error: `Invalid phone number: ${recipient.phone}`,
        });
        continue;
      }

      const formatted = buildPropertyFormattedMessage(
        propertyData,
        mediaItems,
        recipient.name
      );
      const messageToSend =
        body.customMessage && body.customMessage.trim().length > 0
          ? body.customMessage.trim()
          : formatted.fullText;

      const variants = phoneVariants(sanitizedPhone);
      const windowCheck = await checkCustomer24HourWindow(
        db,
        accountId,
        variants
      );

      const forceTpl =
        Boolean(body.forceTemplate) ||
        (Boolean(body.deliveryMode) && body.deliveryMode !== 'auto') ||
        !windowCheck.within24h;

      let deliveredPhone = sanitizedPhone;
      let sentViaFreeform = false;
      let sentAsMode: 'media_and_text' | 'text' | 'template' = 'text';
      let usedTemplateName: string | undefined;
      let mediaSentCount = 0;
      const persistedMessages: Array<{
        content_type: string;
        content_text: string;
        media_url?: string | null;
        template_name?: string | null;
        message_id: string;
      }> = [];

      // 1. Try sending native Images + Videos + Full Text if within 24h window
      if (!forceTpl) {
        let primarySendSuccess = false;

        for (const candidate of variants) {
          try {
            // Send full property details text first so the contact gets complete details
            const textRes = await sendTextMessage({
              phoneNumberId: waConfig.phone_number_id,
              accessToken,
              to: candidate,
              text: messageToSend,
            });
            deliveredPhone = candidate;
            primarySendSuccess = true;
            persistedMessages.push({
              content_type: 'text',
              content_text: messageToSend,
              message_id: textRes.messageId,
            });
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!isRecipientNotAllowedError(msg)) break;
          }
        }

        if (primarySendSuccess) {
          sentViaFreeform = true;
          sentAsMode = 'text';

          // Now send each selected Image & Video as native WhatsApp media attachments!
          for (const media of mediaItems) {
            if (!media.url || !/^https?:\/\//i.test(media.url)) continue;
            const kind = media.type === 'video' ? 'video' : 'image';
            const caption = `${propertyData.title || 'Property'} — ${media.name || (kind === 'video' ? 'Property Video' : 'Property Photo')}`;
            try {
              const mediaRes = await sendMediaMessage({
                phoneNumberId: waConfig.phone_number_id,
                accessToken,
                to: deliveredPhone,
                kind,
                link: media.url,
                caption: caption.slice(0, 1000),
              });
              mediaSentCount += 1;
              sentAsMode = 'media_and_text';
              persistedMessages.push({
                content_type: kind,
                content_text: caption,
                media_url: media.url,
                message_id: mediaRes.messageId,
              });
            } catch (mediaErr) {
              console.warn(
                `[properties/share] Media send warning for ${media.url}:`,
                mediaErr
              );
            }
          }
        }
      }

      // 2. Outside 24h window (or if free-form failed with 131047, or template mode selected) -> Send via APPROVED Template!
      if (!sentViaFreeform) {
        const selectedTpl = selectApprovedPropertyTemplate(templates, {
          recipientName: recipient.name || sanitizedPhone,
          titleSummary: formatted.titleSummary,
          specsSummary: formatted.specsSummary,
          mediaSummary: formatted.mediaSummary,
          fullText: messageToSend,
          preferredTemplateName: body.deliveryMode,
        });

        if (!selectedTpl) {
          results.push({
            phone: sanitizedPhone,
            name: recipient.name,
            success: false,
            error:
              'Outside 24h window and no APPROVED WhatsApp template found on your WABA.',
            waLink: `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(messageToSend)}`,
          });
          continue;
        }

        let tplMessageId = '';
        let lastErr: unknown = null;

        for (const candidate of variants) {
          try {
            const res = await sendTemplateMessage({
              phoneNumberId: waConfig.phone_number_id,
              accessToken,
              to: candidate,
              templateName: selectedTpl.template.name,
              language: selectedTpl.template.language || 'en_US',
              template: selectedTpl.template,
              messageParams: {
                body: selectedTpl.bodyParams,
              },
            });
            tplMessageId = res.messageId;
            deliveredPhone = candidate;
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            if (!isRecipientNotAllowedError(msg)) break;
          }
        }

        if (lastErr || !tplMessageId) {
          results.push({
            phone: sanitizedPhone,
            name: recipient.name,
            success: false,
            error:
              lastErr instanceof Error
                ? lastErr.message
                : 'Failed to send property template message',
            waLink: `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(messageToSend)}`,
          });
          continue;
        }

        sentAsMode = 'template';
        usedTemplateName = selectedTpl.template.name;
        persistedMessages.push({
          content_type: 'template',
          content_text: selectedTpl.renderedText,
          template_name: selectedTpl.template.name,
          message_id: tplMessageId,
        });
      }

      // 3. Persist Contact, Conversation, and Messages so everything shows up in Inbox!
      let conversationId: string | null = windowCheck.conversationId;
      try {
        let contactId = windowCheck.contactId;

        if (!contactId) {
          const { data: existingContact } = await db
            .from('contacts')
            .select('id')
            .eq('account_id', accountId)
            .in('phone', variants)
            .maybeSingle();

          if (existingContact?.id) {
            contactId = existingContact.id;
          } else {
            const { data: createdContact } = await db
              .from('contacts')
              .insert({
                account_id: accountId,
                user_id: userId,
                phone: deliveredPhone,
                name: recipient.name || deliveredPhone,
              })
              .select('id')
              .single();
            contactId = createdContact?.id ?? null;
          }
        }

        if (contactId && !conversationId) {
          const { data: existingConv } = await db
            .from('conversations')
            .select('id')
            .eq('account_id', accountId)
            .eq('contact_id', contactId)
            .maybeSingle();

          if (existingConv?.id) {
            conversationId = existingConv.id;
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
            conversationId = createdConv?.id ?? null;
          }
        }

        if (conversationId && persistedMessages.length > 0) {
          const nowIso = new Date().toISOString();
          for (const pm of persistedMessages) {
            await db.from('messages').insert({
              conversation_id: conversationId,
              sender_type: 'agent',
              sender_id: userId,
              content_type: pm.content_type,
              content_text: pm.content_text,
              media_url: pm.media_url ?? null,
              template_name: pm.template_name ?? null,
              message_id: pm.message_id,
              status: 'sent',
            });
          }

          const lastMsg = persistedMessages[persistedMessages.length - 1];
          await db
            .from('conversations')
            .update({
              last_message_text: lastMsg.content_text.slice(0, 200),
              last_message_at: nowIso,
              updated_at: nowIso,
            })
            .eq('id', conversationId);
        }
      } catch (persistErr) {
        console.warn('[properties/share] Persist warning:', persistErr);
      }

      results.push({
        phone: deliveredPhone,
        name: recipient.name || deliveredPhone,
        success: true,
        sentAs: sentAsMode,
        templateName: usedTemplateName,
        mediaSentCount,
        conversationId,
        waLink: `https://wa.me/${deliveredPhone}?text=${encodeURIComponent(messageToSend)}`,
      });
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      success: successCount > 0,
      sentCount: successCount,
      failedCount: failCount,
      results,
    });
  } catch (error) {
    console.error('[properties/share] Error:', error);
    return toErrorResponse(error);
  }
}

