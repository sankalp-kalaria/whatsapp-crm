import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

/**
 * DELETE /api/notifications
 * Soft-deletes a notification by setting `status = 'deleted'` and `deleted_at = NOW()`
 * so it never reappears on window refresh and remains accessible in the
 * "Deleted Notifications" tab for future reference.
 *
 * Also supports soft-deleting a Client or Investor notification card even if no
 * `notifications` row existed yet by creating a row with `status = 'deleted'`.
 */
export async function DELETE(request: Request) {
  try {
    const { accountId, userId } = await requireRole('agent');
    const db = supabaseAdmin();
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));

    const id = (body.id as string | undefined) || searchParams.get('id');
    const entityType =
      (body.entityType as 'client' | 'investor' | undefined) ||
      (searchParams.get('entityType') as 'client' | 'investor' | null);
    const entityId =
      (body.entityId as string | undefined) || searchParams.get('entityId');
    const title =
      (body.title as string | undefined) ||
      `${entityType === 'investor' ? 'Investor' : 'Client'} Notification`;
    const notifBody = (body.body as string | undefined) || '';
    const clearAll = searchParams.get('all') === '1' || body.all === true;
    const nowIso = new Date().toISOString();

    if (clearAll) {
      const { error } = await db
        .from('notifications')
        .update({
          status: 'deleted',
          deleted_at: nowIso,
          read_at: nowIso,
        })
        .eq('account_id', accountId)
        .neq('status', 'deleted');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, clearedAll: true });
    }

    // 1. If a specific notification row ID is provided, mark it status = 'deleted'
    let updatedRow: Record<string, unknown> | null = null;
    if (id) {
      const { data, error } = await db
        .from('notifications')
        .update({
          status: 'deleted',
          deleted_at: nowIso,
          read_at: nowIso,
        })
        .eq('id', id)
        .eq('account_id', accountId)
        .select('*')
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      updatedRow = data;
    }

    // 2. If entityType + entityId are provided (Client or Investor card),
    //    mark all matching notifications as 'deleted' or insert a 'deleted' record
    //    so refreshing the window never shows this Client/Investor card in active tabs.
    if (entityType && entityId) {
      const { data: existingRows } = await db
        .from('notifications')
        .select('id')
        .eq('account_id', accountId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId);

      if (existingRows && existingRows.length > 0) {
        const { data: updatedList } = await db
          .from('notifications')
          .update({
            status: 'deleted',
            deleted_at: nowIso,
            read_at: nowIso,
          })
          .eq('account_id', accountId)
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
          .select('*');
        if (updatedList && updatedList.length > 0) {
          updatedRow = updatedList[0];
        }
      } else if (!updatedRow) {
        const { data: inserted, error: insErr } = await db
          .from('notifications')
          .insert({
            account_id: accountId,
            user_id: userId,
            type: 'agreement_expiring',
            entity_type: entityType,
            entity_id: entityId,
            title,
            body: notifBody,
            read_at: nowIso,
            status: 'deleted',
            deleted_at: nowIso,
          })
          .select('*')
          .single();

        if (insErr) {
          return NextResponse.json({ error: insErr.message }, { status: 500 });
        }
        updatedRow = inserted;
      }
    }

    if (!id && !(entityType && entityId)) {
      return NextResponse.json(
        { error: 'Notification id or entityType/entityId is required' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      id: updatedRow?.id || id,
      notification: updatedRow,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * PATCH /api/notifications
 * Restores a deleted notification back to `status = 'active'` (or restores all).
 */
export async function PATCH(request: Request) {
  try {
    const { accountId } = await requireRole('agent');
    const db = supabaseAdmin();
    const body = await request.json().catch(() => ({}));
    const { action, id, entityType, entityId } = body as {
      action?: 'restore' | 'restore_all';
      id?: string;
      entityType?: 'client' | 'investor';
      entityId?: string;
    };

    if (action === 'restore_all') {
      const { error } = await db
        .from('notifications')
        .update({
          status: 'active',
          deleted_at: null,
        })
        .eq('account_id', accountId)
        .eq('status', 'deleted');

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (id) {
      const { error } = await db
        .from('notifications')
        .update({
          status: 'active',
          deleted_at: null,
        })
        .eq('id', id)
        .eq('account_id', accountId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (entityType && entityId) {
      await db
        .from('notifications')
        .update({
          status: 'active',
          deleted_at: null,
        })
        .eq('account_id', accountId)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
