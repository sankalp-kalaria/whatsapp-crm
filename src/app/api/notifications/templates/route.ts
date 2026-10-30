import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { ensureAndSyncNotificationTemplates } from '@/lib/whatsapp/notification-template';

/**
 * GET /api/notifications/templates
 * Returns the account's message_templates list (syncing from Meta WABA if ?sync=1).
 */
export async function GET(request: Request) {
  try {
    const { accountId, userId } = await requireRole('agent');
    const db = supabaseAdmin();
    const { searchParams } = new URL(request.url);
    const shouldSync = searchParams.get('sync') === '1';

    if (shouldSync) {
      const synced = await ensureAndSyncNotificationTemplates(
        db,
        accountId,
        userId
      );
      return NextResponse.json({
        success: true,
        templates: synced,
      });
    }

    const { data: rows } = await db
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      success: true,
      templates: rows ?? [],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/notifications/templates
 * Ensures the default notification templates (`agreement_notification_alert` &
 * `client_investor_notification`) are created on Meta WABA and syncs all
 * template approval statuses into `message_templates`.
 */
export async function POST() {
  try {
    const { accountId, userId } = await requireRole('agent');
    const db = supabaseAdmin();

    const templates = await ensureAndSyncNotificationTemplates(
      db,
      accountId,
      userId
    );

    return NextResponse.json({
      success: true,
      templates,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

