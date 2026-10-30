-- ============================================================
-- 048_property_inquiry_flow_and_site_visits.sql
--
-- 1. `site_visits` table: Stores client site visit availability,
--    selected configuration (1/2/3 BHK), budget range, date/time,
--    status, and notes. Linked to account, contact, conversation,
--    and optionally client/property.
-- 2. `bootstrap_default_property_flow`: Function that sets up
--    the automated Property Inquiry & Site Visit flow for any account.
-- 3. Bootstraps this flow for all existing accounts.
-- 4. Updates `handle_new_user()` so any newly created account
--    receives this default active flow automatically.
-- ============================================================

-- ============================================================
-- 1. SITE_VISITS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS site_visits (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id             UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id        UUID REFERENCES conversations(id) ON DELETE SET NULL,
  client_id              UUID REFERENCES clients(id) ON DELETE SET NULL,
  property_id            UUID REFERENCES properties(id) ON DELETE SET NULL,
  flow_run_id            UUID REFERENCES flow_runs(id) ON DELETE SET NULL,
  visit_date             DATE NOT NULL,
  visit_time             TEXT NOT NULL,
  configuration          TEXT,                             -- e.g. '1 BHK', '2 BHK', '3 BHK'
  budget_range           TEXT,                             -- e.g. '65L to 75 L', '90 L Below'
  client_name            TEXT,
  client_phone           TEXT,
  status                 TEXT NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled')),
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_visits_account ON site_visits(account_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_conversation ON site_visits(conversation_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_contact ON site_visits(contact_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_date ON site_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_site_visits_status ON site_visits(status);

ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_visits_select ON site_visits;
CREATE POLICY site_visits_select ON site_visits FOR SELECT
  USING (
    is_account_member(account_id)
    OR auth.role() = 'anon'
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS site_visits_insert ON site_visits;
CREATE POLICY site_visits_insert ON site_visits FOR INSERT
  WITH CHECK (
    is_account_member(account_id, 'agent')
    OR auth.role() = 'anon'
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS site_visits_update ON site_visits;
CREATE POLICY site_visits_update ON site_visits FOR UPDATE
  USING (
    is_account_member(account_id, 'agent')
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS site_visits_delete ON site_visits;
CREATE POLICY site_visits_delete ON site_visits FOR DELETE
  USING (
    is_account_member(account_id, 'agent')
    OR auth.role() = 'service_role'
  );

-- ============================================================
-- 2. BOOTSTRAP DEFAULT PROPERTY INQUIRY FLOW FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.bootstrap_default_property_flow(p_account_id UUID, p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow_id UUID;
BEGIN
  -- If account already has this flow, ensure it's active
  SELECT id INTO v_flow_id
  FROM flows
  WHERE account_id = p_account_id
    AND name = 'Property Inquiry & Site Visit'
  LIMIT 1;

  IF v_flow_id IS NOT NULL THEN
    UPDATE flows SET status = 'active' WHERE id = v_flow_id;
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
    'Automated 1/2/3 BHK configuration, budget filtering, and site visit calendar booking',
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

-- ============================================================
-- 3. BOOTSTRAP FOR ALL EXISTING ACCOUNTS
-- ============================================================
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id, owner_user_id FROM public.accounts LOOP
    PERFORM public.bootstrap_default_property_flow(rec.id, rec.owner_user_id);
  END LOOP;
END;
$$;

-- ============================================================
-- 4. UPDATE handle_new_user TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id)
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  -- Automatically bootstrap the default Property Inquiry & Site Visit flow for new user
  PERFORM public.bootstrap_default_property_flow(v_account_id, NEW.id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
