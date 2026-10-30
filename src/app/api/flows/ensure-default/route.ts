import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import {
  findForwardConversationNode,
  processDueConversationForwards,
} from '@/lib/flows/forward-conversation';
import type { FlowNodeRow } from '@/lib/flows/types';

function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function ensureForwardConversationNodeOnPropertyFlow(
  admin: ReturnType<typeof supabaseAdmin>,
  flowId: string
) {
  const { data: nodes } = await admin
    .from('flow_nodes')
    .select('*')
    .eq('flow_id', flowId);

  const nodeList = (nodes ?? []) as FlowNodeRow[];
  const existingForward = findForwardConversationNode(nodeList);
  if (existingForward) return;

  // Insert forward_conversation node between confirm_site_visit and end
  const forwardConfig = {
    interval_mode: 'profile_default',
    recipient_phone: '',
    custom_note: 'Property Inquiry & Site Visit Lead Summary',
    next_node_key: 'end',
  };

  const { error: insErr } = await admin.from('flow_nodes').insert({
    flow_id: flowId,
    node_key: 'forward_conversation',
    node_type: 'forward_conversation',
    config: forwardConfig,
    position_x: 1600,
    position_y: 200,
  });

  if (insErr && insErr.message.includes('flow_nodes_node_type_check')) {
    await admin.from('flow_nodes').insert({
      flow_id: flowId,
      node_key: 'forward_conversation',
      node_type: 'http_fetch',
      config: { ...forwardConfig, __node_type: 'forward_conversation' },
      position_x: 1600,
      position_y: 200,
    });
  }

  // Point confirm_site_visit -> forward_conversation and shift end node position
  const confirmNode = nodeList.find((n) => n.node_key === 'confirm_site_visit');
  if (confirmNode) {
    await admin
      .from('flow_nodes')
      .update({
        config: {
          ...(confirmNode.config || {}),
          next_node_key: 'forward_conversation',
        },
      })
      .eq('id', confirmNode.id);
  }

  const endNode = nodeList.find((n) => n.node_key === 'end');
  if (endNode) {
    await admin
      .from('flow_nodes')
      .update({ position_x: 1880, position_y: 200 })
      .eq('id', endNode.id);
  }
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

    // Also process any due scheduled conversation forwards for this account
    void processDueConversationForwards(admin, {
      accountId: profile.account_id,
    });

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
      await ensureForwardConversationNodeOnPropertyFlow(admin, existingFlow.id);
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

    if (flowId) {
      await ensureForwardConversationNodeOnPropertyFlow(admin, flowId as string);
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
