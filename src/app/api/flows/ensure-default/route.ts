import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST() {
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

    const admin = supabaseAdmin();

    // Check if the property flow already exists
    const { data: existingFlow } = await admin
      .from('flows')
      .select('id, status')
      .eq('account_id', profile.account_id)
      .eq('name', 'Property Inquiry & Site Visit')
      .maybeSingle();

    if (existingFlow) {
      if (existingFlow.status !== 'active') {
        await admin
          .from('flows')
          .update({ status: 'active' })
          .eq('id', existingFlow.id);
      }
      return NextResponse.json({ success: true, flow_id: existingFlow.id });
    }

    // Call bootstrap_default_property_flow function
    const { data: flowId, error: rpcErr } = await admin.rpc(
      'bootstrap_default_property_flow',
      {
        p_account_id: profile.account_id,
        p_user_id: user.id,
      }
    );

    if (rpcErr) {
      console.warn('[flows] bootstrap_default_property_flow rpc error:', rpcErr);
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, flow_id: flowId });
  } catch (err) {
    console.error('[flows] ensure-default error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
