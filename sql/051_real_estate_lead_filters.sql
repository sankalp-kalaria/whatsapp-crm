-- ============================================================
-- 051_real_estate_lead_filters.sql
--
-- Real Estate Broker Lead Filtering & Intelligence:
-- 1. Ensures standard real estate custom fields exist for every account
--    (Configuration, Budget Range, Lead Stage, Inquiry Type,
--     Carpet Preference, Preferred Location, Possession Timeline,
--     Follow-up Date, Broker Notes).
-- 2. Adds indexes on messages and flow_runs for fast inbox lead
--    filtering by configuration (1 BHK / 2 BHK / 3 BHK) and budget.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_flow_runs_account_contact
  ON public.flow_runs(account_id, contact_id, started_at DESC);

-- Seed standard Real Estate Broker custom fields for all existing accounts
DO $$
DECLARE
  acc RECORD;
  v_fields TEXT[][] := ARRAY[
    ARRAY['lead_configuration', 'select'],
    ARRAY['lead_budget_range', 'select'],
    ARRAY['lead_stage', 'select'],
    ARRAY['lead_inquiry_type', 'select'],
    ARRAY['lead_carpet_preference', 'select'],
    ARRAY['lead_preferred_location', 'text'],
    ARRAY['lead_possession_timeline', 'select'],
    ARRAY['lead_follow_up_date', 'text'],
    ARRAY['lead_broker_notes', 'text']
  ];
  f TEXT[];
BEGIN
  FOR acc IN SELECT id, owner_user_id FROM public.accounts LOOP
    FOREACH f SLICE 1 IN ARRAY v_fields LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.custom_fields
        WHERE account_id = acc.id AND field_name = f[1]
      ) THEN
        INSERT INTO public.custom_fields (account_id, user_id, field_name, field_type)
        VALUES (acc.id, acc.owner_user_id, f[1], f[2]);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

