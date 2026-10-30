import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { sendTextMessage } from '@/lib/whatsapp/meta-api';
import {
  isRecipientNotAllowedError,
  phoneVariants,
  sanitizePhoneForMeta,
} from '@/lib/whatsapp/phone-utils';
import {
  extractForwardSettingsFromProfile,
  normalizeForwardInterval,
  type ForwardIntervalMinutes,
} from '@/lib/profile/forward-settings';
import type {
  FlowNodeRow,
  FlowRunRow,
  ForwardConversationNodeConfig,
} from './types';

type AdminClient = SupabaseClient;

/**
 * Normalizes a raw `flow_nodes` row from the DB so that if the DB constraint
 * required storing `forward_conversation` as `http_fetch` with
 * `config.__node_type = 'forward_conversation'`, the application sees
 * `node_type: 'forward_conversation'` everywhere.
 */
export function normalizeFlowNodeRow<
  T extends { node_type: string; config: Record<string, unknown> }
>(row: T): T {
  if (
    row.node_type === 'http_fetch' &&
    row.config &&
    row.config.__node_type === 'forward_conversation'
  ) {
    const restConfig = { ...row.config };
    delete restConfig.__node_type;
    return {
      ...row,
      node_type: 'forward_conversation',
      config: restConfig,
    };
  }
  return row;
}

/**
 * Finds the first `forward_conversation` node in a flow's node map.
 */
export function findForwardConversationNode(
  nodes: Map<string, FlowNodeRow> | FlowNodeRow[]
): FlowNodeRow | null {
  const list = Array.isArray(nodes) ? nodes : Array.from(nodes.values());
  for (const raw of list) {
    const n = normalizeFlowNodeRow(raw);
    if (n.node_type === 'forward_conversation') {
      return n;
    }
  }
  return null;
}

/**
 * Resolves the target recipient phone number and interval (in minutes)
 * for a `forward_conversation` node by checking the node config first
 * and falling back to the account owner/admin's Profile settings.
 */
export async function resolveForwardTargetAndInterval(
  db: AdminClient,
  accountId: string,
  userId: string,
  nodeConfig?: Partial<ForwardConversationNodeConfig>
): Promise<{
  recipientPhone: string | null;
  intervalMinutes: ForwardIntervalMinutes | 0;
}> {
  // Fetch profiles belonging to this account (prioritize userId, then owner/admin with phone set)
  const { data: profiles } = await db
    .from('profiles')
    .select('*')
    .eq('account_id', accountId);

  let profilePhone = '';
  let profileInterval: ForwardIntervalMinutes = 60;

  if (Array.isArray(profiles) && profiles.length > 0) {
    // Sort so the flow's user_id or owner comes first
    const sorted = [...profiles].sort((a, b) => {
      if (a.user_id === userId) return -1;
      if (b.user_id === userId) return 1;
      if (a.account_role === 'owner') return -1;
      if (b.account_role === 'owner') return 1;
      return 0;
    });

    for (const p of sorted) {
      const extracted = extractForwardSettingsFromProfile(p);
      if (!profilePhone && extracted.phone) {
        profilePhone = extracted.phone;
        profileInterval = extracted.forwardIntervalMinutes;
        break;
      }
    }
    if (!profilePhone && sorted[0]) {
      const extracted = extractForwardSettingsFromProfile(sorted[0]);
      profileInterval = extracted.forwardIntervalMinutes;
    }
  }

  const rawOverridePhone =
    typeof nodeConfig?.recipient_phone === 'string'
      ? nodeConfig.recipient_phone.trim()
      : '';
  const chosenPhone = rawOverridePhone || profilePhone;

  // Normalize phone: if 10 digits (Indian mobile), prepend 91
  let sanitized = sanitizePhoneForMeta(chosenPhone);
  if (sanitized.length === 10 && /^[6-9]\d{9}$/.test(sanitized)) {
    sanitized = `91${sanitized}`;
  }

  const mode = nodeConfig?.interval_mode ?? 'profile_default';
  let intervalMinutes: ForwardIntervalMinutes | 0 = profileInterval;
  if (mode === 'immediate') {
    intervalMinutes = 0;
  } else if (mode === '30' || mode === '60' || mode === '120') {
    intervalMinutes = normalizeForwardInterval(Number(mode));
  }

  return {
    recipientPhone: sanitized || null,
    intervalMinutes,
  };
}

/**
 * Formats a human-readable label for a variable key in `flow_runs.vars`.
 */
function formatVarLabel(key: string): string {
  const labels: Record<string, string> = {
    configuration: 'Configuration',
    budget_range: 'Budget Range',
    site_visit_availability: 'Site Visit Availability',
    site_visit_date: 'Scheduled Visit Date',
    site_visit_time: 'Scheduled Visit Time',
    site_visit_status: 'Visit Status',
  };
  if (labels[key]) return labels[key];
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Builds and sends the complete client details + conversation summary
 * to the admin's profile phone number via WhatsApp.
 */
export async function executeConversationForwardForRun(
  db: AdminClient,
  run: FlowRunRow,
  nodeConfig?: Partial<ForwardConversationNodeConfig>
): Promise<{
  sent: boolean;
  recipientPhone?: string;
  messageId?: string;
  reason?: string;
}> {
  try {
    const { recipientPhone, intervalMinutes } =
      await resolveForwardTargetAndInterval(
        db,
        run.account_id,
        run.user_id,
        nodeConfig
      );

    if (!recipientPhone) {
      return {
        sent: false,
        reason: 'no_profile_phone_configured',
      };
    }

    // 1. Load WhatsApp config for this account
    const { data: waConfig } = await db
      .from('whatsapp_config')
      .select('phone_number_id, access_token, status')
      .eq('account_id', run.account_id)
      .eq('status', 'connected')
      .maybeSingle();

    if (!waConfig?.phone_number_id || !waConfig?.access_token) {
      return {
        sent: false,
        reason: 'whatsapp_not_connected',
      };
    }

    // 2. Load Flow name, Contact details, Site Visit details, and Conversation messages
    const [flowRes, contactRes, visitRes, messagesRes] = await Promise.all([
      db.from('flows').select('name').eq('id', run.flow_id).maybeSingle(),
      run.contact_id
        ? db
            .from('contacts')
            .select('name, phone, email, company')
            .eq('id', run.contact_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      run.contact_id
        ? db
            .from('site_visits')
            .select('*')
            .eq('account_id', run.account_id)
            .eq('contact_id', run.contact_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      run.conversation_id
        ? db
            .from('messages')
            .select('sender_type, content_type, content_text, created_at')
            .eq('conversation_id', run.conversation_id)
            .order('created_at', { ascending: true })
            .limit(60)
        : Promise.resolve({ data: [] }),
    ]);

    const flowName =
      (flowRes.data as { name?: string } | null)?.name ||
      'Property Inquiry & Site Visit';
    const contact = contactRes.data as {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      company?: string | null;
    } | null;
    const visit = visitRes.data as {
      visit_date?: string;
      visit_time?: string;
      configuration?: string | null;
      budget_range?: string | null;
      status?: string;
      notes?: string | null;
      client_name?: string | null;
      client_phone?: string | null;
    } | null;

    const clientName =
      contact?.name || visit?.client_name || 'WhatsApp Client';
    const clientPhone =
      contact?.phone || visit?.client_phone || 'Not available';

    // 3. Build Client Answers / Captured Variables section
    const INTERNAL_VAR_KEYS = new Set([
      'calendar_link',
      'forward_node_key',
      'forward_interval_minutes',
      'forward_scheduled_at',
      'forward_status',
      'forward_sent_at',
      'forward_recipient_phone',
      'forward_last_msg_at',
    ]);

    const answerLines: string[] = [];
    const vars = run.vars || {};

    for (const [k, v] of Object.entries(vars)) {
      if (INTERNAL_VAR_KEYS.has(k)) continue;
      if (v === undefined || v === null || v === '') continue;
      answerLines.push(`• *${formatVarLabel(k)}:* ${String(v)}`);
    }

    if (visit) {
      if (!vars.configuration && visit.configuration) {
        answerLines.push(`• *Configuration:* ${visit.configuration}`);
      }
      if (!vars.budget_range && visit.budget_range) {
        answerLines.push(`• *Budget Range:* ${visit.budget_range}`);
      }
      if (visit.visit_date && visit.visit_time) {
        answerLines.push(
          `• *Site Visit Slot:* ${visit.visit_date} at ${visit.visit_time} (${visit.status || 'scheduled'})`
        );
      }
      if (visit.notes) {
        answerLines.push(`• *Notes:* ${visit.notes}`);
      }
    }

    // 4. Build Complete Conversation Transcript & Client Answers
    const rawMessages = (messagesRes.data ?? []) as Array<{
      sender_type: string;
      content_type: string;
      content_text: string | null;
      created_at: string;
    }>;

    // Filter to messages from the current run window (within 2 minutes before run.started_at)
    // or fallback to the last 25 messages if none match
    const runStartMs = new Date(run.started_at).getTime() - 2 * 60 * 1000;
    const runMessages = rawMessages.filter(
      (m) => new Date(m.created_at).getTime() >= runStartMs
    );
    const messagesToFormat =
      runMessages.length > 0 ? runMessages : rawMessages.slice(-25);

    const transcriptLines: string[] = [];
    const clientOnlyAnswers: string[] = [];

    for (const m of messagesToFormat) {
      const text = (m.content_text || `[${m.content_type}]`).trim();
      if (!text) continue;
      const timeStr = new Date(m.created_at).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      const isClient = m.sender_type === 'customer';
      const speaker = isClient ? '👤 Client' : '🤖 Bot';
      transcriptLines.push(`[${timeStr}] *${speaker}:* ${text}`);
      if (isClient) {
        clientOnlyAnswers.push(`• "${text}"`);
      }
    }

    if (answerLines.length === 0 && clientOnlyAnswers.length > 0) {
      answerLines.push(...clientOnlyAnswers);
    }

    const customNote =
      typeof nodeConfig?.custom_note === 'string' &&
      nodeConfig.custom_note.trim()
        ? `\n📌 *Note:* ${nodeConfig.custom_note.trim()}\n`
        : '';

    const intervalLabel =
      intervalMinutes === 0
        ? 'Immediate'
        : intervalMinutes === 30
          ? '30 Minutes'
          : intervalMinutes === 120
            ? '2 Hours'
            : '1 Hour';

    const summaryHeader = [
      `📋 *Workflow Conversation Summary*`,
      `🔹 *Workflow:* ${flowName}`,
      `⏱️ *Interval:* ${intervalLabel}`,
      customNote,
      `👤 *Client Details:*`,
      `• *Name:* ${clientName}`,
      `• *Number:* ${clientPhone}`,
      contact?.email ? `• *Email:* ${contact.email}` : null,
      ``,
      `📊 *Client Answers & Details:*`,
      answerLines.length > 0
        ? answerLines.join('\n')
        : '• Waiting for client answers',
      ``,
      `💬 *Complete Conversation:*`,
      transcriptLines.length > 0
        ? transcriptLines.join('\n')
        : 'No messages recorded yet.',
    ]
      .filter((line) => line !== null)
      .join('\n');

    // Ensure message fits within WhatsApp's 4096 char limit
    const finalMessage =
      summaryHeader.length > 4000
        ? `${summaryHeader.slice(0, 3990)}\n…(truncated)`
        : summaryHeader;

    // 5. Send via Meta WhatsApp API (with phoneVariants retry for sandbox/trunk prefix)
    const accessToken = decrypt(waConfig.access_token);
    const variants = phoneVariants(recipientPhone);
    let messageId = '';
    let lastErr: unknown = null;

    for (const candidate of variants) {
      try {
        const res = await sendTextMessage({
          phoneNumberId: waConfig.phone_number_id,
          accessToken,
          to: candidate,
          text: finalMessage,
        });
        messageId = res.messageId;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (!isRecipientNotAllowedError(msg)) {
          break;
        }
      }
    }

    if (lastErr && !messageId) {
      throw lastErr;
    }

    // 6. Update flow_runs.vars to record the sent forward
    const nowIso = new Date().toISOString();
    const updatedVars = {
      ...(run.vars || {}),
      forward_status: 'sent',
      forward_sent_at: nowIso,
      forward_recipient_phone: recipientPhone,
    };

    await db
      .from('flow_runs')
      .update({ vars: updatedVars })
      .eq('id', run.id);
    run.vars = updatedVars;

    // 7. Record audit event in flow_run_events + dashboard notification
    await db.from('flow_run_events').insert({
      flow_run_id: run.id,
      event_type: 'message_sent',
      node_key:
        (run.vars.forward_node_key as string | undefined) ||
        'forward_conversation',
      payload: {
        node_type: 'forward_conversation',
        forwarded_to: recipientPhone,
        whatsapp_message_id: messageId,
        interval_minutes: intervalMinutes,
      },
    });

    try {
      await db.from('notifications').insert({
        account_id: run.account_id,
        user_id: run.user_id,
        type: 'flow_conversation_forwarded',
        title: `Forwarded Conversation: ${clientName} (${clientPhone})`,
        body: `Sent ${flowName} summary and complete conversation to ${recipientPhone}.`,
        entity_type: 'conversation',
        entity_id: run.conversation_id,
      });
    } catch {
      // non-fatal if notifications check constraint restricts type
    }

    return {
      sent: true,
      recipientPhone,
      messageId,
    };
  } catch (err) {
    console.error('[flows] executeConversationForwardForRun error:', err);
    return {
      sent: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Processes all flow runs whose scheduled conversation forward time
 * (`vars.forward_scheduled_at`) has arrived (or all recent unforwarded runs
 * when `options.forceRecent` is true).
 */
export async function processDueConversationForwards(
  db: AdminClient,
  options?: {
    accountId?: string;
    forceRecent?: boolean;
  }
): Promise<{ processed: number; forwarded: number }> {
  try {
    let query = db
      .from('flow_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50);

    if (options?.accountId) {
      query = query.eq('account_id', options.accountId);
    }

    const { data: runs, error } = await query;
    if (error || !runs?.length) {
      return { processed: 0, forwarded: 0 };
    }

    const nowMs = Date.now();
    let processed = 0;
    let forwarded = 0;

    for (const rawRun of runs as FlowRunRow[]) {
      const vars = rawRun.vars || {};
      const status = vars.forward_status as string | undefined;
      const scheduledAt = vars.forward_scheduled_at as string | undefined;

      // Determine if this run is eligible
      let isDue = false;
      if (options?.forceRecent) {
        // When admin clicks "Forward Recent Now", forward any pending run or recent run from last 24h
        const ageHours =
          (nowMs - new Date(rawRun.started_at).getTime()) / (1000 * 60 * 60);
        if (status === 'pending' || (ageHours <= 24 && status !== 'sent')) {
          isDue = true;
        }
      } else if (status === 'pending' && scheduledAt) {
        if (new Date(scheduledAt).getTime() <= nowMs) {
          isDue = true;
        }
      } else if (!status) {
        // Check if this run's flow has a forward_conversation node and elapsed its interval
        const { data: flowNodes } = await db
          .from('flow_nodes')
          .select('*')
          .eq('flow_id', rawRun.flow_id);
        const forwardNode = findForwardConversationNode(
          (flowNodes ?? []) as FlowNodeRow[]
        );
        if (forwardNode) {
          const { intervalMinutes } = await resolveForwardTargetAndInterval(
            db,
            rawRun.account_id,
            rawRun.user_id,
            forwardNode.config as Partial<ForwardConversationNodeConfig>
          );
          const dueTimeMs =
            new Date(rawRun.started_at).getTime() +
            (intervalMinutes || 60) * 60 * 1000;
          if (nowMs >= dueTimeMs) {
            isDue = true;
          } else {
            // Stamp the schedule onto the run so subsequent checks don't re-query flow_nodes
            await db
              .from('flow_runs')
              .update({
                vars: {
                  ...vars,
                  forward_node_key: forwardNode.node_key,
                  forward_interval_minutes: intervalMinutes || 60,
                  forward_scheduled_at: new Date(dueTimeMs).toISOString(),
                  forward_status: 'pending',
                },
              })
              .eq('id', rawRun.id);
          }
        }
      }

      if (!isDue) continue;
      processed++;

      // Load the forward_conversation node config if available
      const { data: flowNodes } = await db
        .from('flow_nodes')
        .select('*')
        .eq('flow_id', rawRun.flow_id);
      const forwardNode = findForwardConversationNode(
        (flowNodes ?? []) as FlowNodeRow[]
      );

      const res = await executeConversationForwardForRun(
        db,
        rawRun,
        (forwardNode?.config as Partial<ForwardConversationNodeConfig>) ?? {}
      );
      if (res.sent) {
        forwarded++;
      }
    }

    return { processed, forwarded };
  } catch (err) {
    console.error('[flows] processDueConversationForwards error:', err);
    return { processed: 0, forwarded: 0 };
  }
}

