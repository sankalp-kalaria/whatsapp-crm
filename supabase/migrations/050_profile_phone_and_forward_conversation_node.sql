-- ============================================================
-- 050_profile_phone_and_forward_conversation_node.sql
--
-- 1. Adds `phone` and `forward_interval_minutes` (30, 60, 120) to `profiles`
--    so admins/users can save their WhatsApp contact number and choose
--    between 30 minutes, 1 hour (default), or 2 hours for automatic
--    workflow conversation forwarding.
-- 2. Adds `'forward_conversation'` to `flow_nodes.node_type` CHECK constraint
--    so any workflow can include the reusable Forward Conversation node.
-- 3. Updates `bootstrap_default_property_flow` and existing
--    `Property Inquiry & Site Visit` flows to include the
--    `forward_conversation` node before `end`.
-- ============================================================

-- 1. Add phone and forward_interval_minutes to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS forward_interval_minutes INTEGER NOT NULL DEFAULT 60;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_forward_interval_minutes_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_forward_interval_minutes_check
  CHECK (forward_interval_minutes IN (30, 60, 120));

-- 2. Update flow_nodes.node_type CHECK constraint to include 'forward_conversation'
ALTER TABLE public.flow_nodes
  DROP CONSTRAINT IF EXISTS flow_nodes_node_type_check;

ALTER TABLE public.flow_nodes
  ADD CONSTRAINT flow_nodes_node_type_check
  CHECK (node_type IN (
    'start',
    'send_buttons',
    'send_list',
    'send_message',
    'send_media',
    'collect_input',
    'condition',
    'set_tag',
    'forward_conversation',
    'handoff',
    'http_fetch',
    'end'
  ));

-- Convert any fallback-stored forward_conversation nodes to native 'forward_conversation'
UPDATE public.flow_nodes
SET
  node_type = 'forward_conversation',
  config = config - '__node_type'
WHERE node_type = 'http_fetch'
  AND config->>'__node_type' = 'forward_conversation';

-- 3. Update bootstrap_default_property_flow function to include forward_conversation node
CREATE OR REPLACE FUNCTION public.bootstrap_default_property_flow(p_account_id UUID, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow_id UUID;
BEGIN
  SELECT id INTO v_flow_id
  FROM flows
  WHERE account_id = p_account_id
    AND name = 'Property Inquiry & Site Visit'
  LIMIT 1;

  IF v_flow_id IS NOT NULL THEN
    UPDATE flows SET status = 'active' WHERE id = v_flow_id;

    -- Ensure forward_conversation node exists on the existing flow
    IF NOT EXISTS (
      SELECT 1 FROM flow_nodes
      WHERE flow_id = v_flow_id
        AND node_key = 'forward_conversation'
    ) THEN
      INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
      VALUES (
        v_flow_id,
        'forward_conversation',
        'forward_conversation',
        '{
          "interval_mode": "profile_default",
          "recipient_phone": "",
          "custom_note": "Property Inquiry & Site Visit Lead Summary",
          "next_node_key": "end"
        }'::jsonb,
        1600, 200
      );

      UPDATE flow_nodes
      SET config = jsonb_set(config, '{next_node_key}', '"forward_conversation"')
      WHERE flow_id = v_flow_id
        AND node_key = 'confirm_site_visit';

      UPDATE flow_nodes
      SET position_x = 1880, position_y = 200
      WHERE flow_id = v_flow_id
        AND node_key = 'end';
    END IF;

    RETURN v_flow_id;
  END IF;

  -- Create the flow
  INSERT INTO flows (
    account_id,
    user_id,
    name,
    description,
    status,
    trigger_type,
    trigger_config,
    entry_node_id,
    fallback_policy
  ) VALUES (
    p_account_id,
    p_user_id,
    'Property Inquiry & Site Visit',
    'Automated 1/2/3 BHK configuration, budget filtering, site visit calendar booking, and conversation forwarding to profile number',
    'active',
    'first_inbound_message',
    '{}'::jsonb,
    'start',
    '{"on_unknown_reply":"reprompt","max_reprompts":2,"on_timeout_hours":24,"on_exhaust":"handoff"}'::jsonb
  )
  RETURNING id INTO v_flow_id;

  -- 1. Start node
  INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
  VALUES (
    v_flow_id,
    'start',
    'start',
    '{"next_node_key":"ask_configuration"}'::jsonb,
    100, 200
  );

  -- 2. Ask Configuration (Send Buttons)
  INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
  VALUES (
    v_flow_id,
    'ask_configuration',
    'send_buttons',
    '{
      "text": "Are you looking for Which configuration?",
      "footer_text": "Select an option below",
      "buttons": [
        { "reply_id": "btn_1bhk", "title": "1 BHK", "next_node_key": "ask_budget_1bhk" },
        { "reply_id": "btn_2bhk", "title": "2 BHK", "next_node_key": "ask_budget_2bhk" },
        { "reply_id": "btn_3bhk", "title": "3 BHK", "next_node_key": "ask_budget_3bhk" }
      ]
    }'::jsonb,
    380, 200
  );

  -- 3. Ask Budget 1 BHK (Send Buttons)
  INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
  VALUES (
    v_flow_id,
    'ask_budget_1bhk',
    'send_buttons',
    '{
      "text": "Great! For 1 BHK, what is your budget range?",
      "footer_text": "Select your budget",
      "buttons": [
        { "reply_id": "b1_below_65", "title": "65 L Below", "next_node_key": "ask_site_visit" },
        { "reply_id": "b1_65_75", "title": "65L to 75 L", "next_node_key": "ask_site_visit" },
        { "reply_id": "b1_premium", "title": "Bigger Carpet 1BHK", "next_node_key": "ask_site_visit" }
      ]
    }'::jsonb,
    700, 50
  );

  -- 4. Ask Budget 2 BHK (Send Buttons)
  INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
  VALUES (
    v_flow_id,
    'ask_budget_2bhk',
    'send_buttons',
    '{
      "text": "Great! For 2 BHK, what is your budget range?",
      "footer_text": "Select your budget",
      "buttons": [
        { "reply_id": "b2_below_90", "title": "90 L Below", "next_node_key": "ask_site_visit" },
        { "reply_id": "b2_90_105", "title": "90L to 1.05 cr", "next_node_key": "ask_site_visit" },
        { "reply_id": "b2_premium", "title": "Bigger Carpet 2BHK", "next_node_key": "ask_site_visit" }
      ]
    }'::jsonb,
    700, 200
  );

  -- 5. Ask Budget 3 BHK (Send Buttons)
  INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
  VALUES (
    v_flow_id,
    'ask_budget_3bhk',
    'send_buttons',
    '{
      "text": "Great! For 3 BHK, what is your budget range?",
      "footer_text": "Select your budget",
      "buttons": [
        { "reply_id": "b3_below_110", "title": "1.10 CR Below", "next_node_key": "ask_site_visit" },
        { "reply_id": "b3_110_130", "title": "1.1 CR to 1.3 cr", "next_node_key": "ask_site_visit" },
        { "reply_id": "b3_premium", "title": "Bigger Carpet 3BHK", "next_node_key": "ask_site_visit" }
      ]
    }'::jsonb,
    700, 350
  );

  -- 6. Ask Site Visit (Collect Input with Calendar prompt)
  INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
  VALUES (
    v_flow_id,
    'ask_site_visit',
    'collect_input',
    '{
      "prompt_text": "Thanks for inquiring properties , kindly let me know your availability for site visit.\n\n📅 You can reply with your preferred Date & Time (e.g., Tomorrow at 4 PM) or pick a slot directly on our online Calendar:\n{{vars.calendar_link}}",
      "var_key": "site_visit_availability",
      "next_node_key": "confirm_site_visit"
    }'::jsonb,
    1020, 200
  );

  -- 7. Confirm Site Visit (Send Message)
  INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
  VALUES (
    v_flow_id,
    'confirm_site_visit',
    'send_message',
    '{
      "text": "Thank you! We have received your availability: \"{{vars.site_visit_availability}}\". Our property executive will connect with you shortly to confirm the site visit.",
      "next_node_key": "forward_conversation"
    }'::jsonb,
    1340, 200
  );

  -- 8. Forward Conversation to Profile Number (30m / 1h / 2h interval)
  INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
  VALUES (
    v_flow_id,
    'forward_conversation',
    'forward_conversation',
    '{
      "interval_mode": "profile_default",
      "recipient_phone": "",
      "custom_note": "Property Inquiry & Site Visit Lead Summary",
      "next_node_key": "end"
    }'::jsonb,
    1600, 200
  );

  -- 9. End
  INSERT INTO flow_nodes (flow_id, node_key, node_type, config, position_x, position_y)
  VALUES (
    v_flow_id,
    'end',
    'end',
    '{}'::jsonb,
    1880, 200
  );

  RETURN v_flow_id;
END;
$$;

ALTER FUNCTION public.bootstrap_default_property_flow(UUID, UUID) OWNER TO postgres;

-- 4. Upgrade all existing accounts' Property Inquiry & Site Visit flow
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id, owner_user_id FROM public.accounts LOOP
    PERFORM public.bootstrap_default_property_flow(rec.id, rec.owner_user_id);
  END LOOP;
END;
$$;

