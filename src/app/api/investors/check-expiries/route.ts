import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import { checkAndNotifyExpiries } from '@/lib/investors/check-expiries';

export async function GET() {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');

    const summary = await checkAndNotifyExpiries(supabase, accountId, userId);

    return NextResponse.json({
      success: true,
      ...summary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
