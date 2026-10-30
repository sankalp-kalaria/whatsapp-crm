import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

/**
 * DELETE /api/notifications?id=<uuid>
 * Deletes a single notification (or all notifications for the account when ?all=1).
 */
export async function DELETE(request: Request) {
  try {
    const { accountId } = await requireRole('agent');
    const db = supabaseAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const clearAll = searchParams.get('all') === '1';

    if (clearAll) {
      const { error } = await db
        .from('notifications')
        .delete()
        .eq('account_id', accountId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, clearedAll: true });
    }

    if (!id) {
      return NextResponse.json(
        { error: 'Notification id is required' },
        { status: 400 }
      );
    }

    const { error } = await db
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return toErrorResponse(error);
  }
}

