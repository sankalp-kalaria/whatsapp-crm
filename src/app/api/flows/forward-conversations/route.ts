import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { processDueConversationForwards } from '@/lib/flows/forward-conversation';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      forceRecent?: boolean;
    };

    const admin = supabaseAdmin();
    const result = await processDueConversationForwards(admin, {
      accountId: profile.account_id,
      forceRecent: Boolean(body.forceRecent),
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[flows] forward-conversations POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const admin = supabaseAdmin();
    const result = await processDueConversationForwards(admin);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[flows] forward-conversations GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

