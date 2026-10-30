-- ============================================================
-- 049_delete_contact_918169787644.sql
--
-- Deletes all records associated with phone number 918169787644
-- (and variations: +918169787644, 8169787644) and all its references
-- across contacts, conversations, messages, flow runs, site visits,
-- clients, investors, tags, broadcasts, deals, and automations.
-- ============================================================

DO $$
DECLARE
  v_contact_ids UUID[];
  v_conversation_ids UUID[];
  v_flow_run_ids UUID[];
  v_client_ids UUID[];
  v_investor_ids UUID[];
BEGIN
  -- 1. Identify all matching contacts
  SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[]) INTO v_contact_ids
  FROM public.contacts
  WHERE phone ILIKE '%8169787644%'
     OR wa_user_id ILIKE '%8169787644%';

  -- 2. Identify all matching conversations
  SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[]) INTO v_conversation_ids
  FROM public.conversations
  WHERE (CARDINALITY(v_contact_ids) > 0 AND contact_id = ANY(v_contact_ids));

  -- 3. Identify all matching flow runs
  SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[]) INTO v_flow_run_ids
  FROM public.flow_runs
  WHERE (CARDINALITY(v_contact_ids) > 0 AND contact_id = ANY(v_contact_ids))
     OR (CARDINALITY(v_conversation_ids) > 0 AND conversation_id = ANY(v_conversation_ids));

  -- 4. Identify matching clients
  SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[]) INTO v_client_ids
  FROM public.clients
  WHERE phone ILIKE '%8169787644%';

  -- 5. Identify matching investors
  SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[]) INTO v_investor_ids
  FROM public.investors
  WHERE phone ILIKE '%8169787644%';

  -- DELETE flow_run_events & flow_runs
  IF CARDINALITY(v_flow_run_ids) > 0 THEN
    DELETE FROM public.flow_run_events WHERE flow_run_id = ANY(v_flow_run_ids);
    DELETE FROM public.flow_runs WHERE id = ANY(v_flow_run_ids);
  END IF;

  -- DELETE site_visits
  DELETE FROM public.site_visits
  WHERE client_phone ILIKE '%8169787644%'
     OR (CARDINALITY(v_contact_ids) > 0 AND contact_id = ANY(v_contact_ids))
     OR (CARDINALITY(v_conversation_ids) > 0 AND conversation_id = ANY(v_conversation_ids));

  -- DELETE deals referencing these contacts or conversations
  IF CARDINALITY(v_contact_ids) > 0 OR CARDINALITY(v_conversation_ids) > 0 THEN
    DELETE FROM public.deals
    WHERE (CARDINALITY(v_contact_ids) > 0 AND contact_id = ANY(v_contact_ids))
       OR (CARDINALITY(v_conversation_ids) > 0 AND conversation_id = ANY(v_conversation_ids));
  END IF;

  -- DELETE broadcast_recipients referencing these contacts
  IF CARDINALITY(v_contact_ids) > 0 THEN
    DELETE FROM public.broadcast_recipients WHERE contact_id = ANY(v_contact_ids);
  END IF;

  -- DELETE messages in these conversations
  IF CARDINALITY(v_conversation_ids) > 0 THEN
    DELETE FROM public.messages WHERE conversation_id = ANY(v_conversation_ids);
  END IF;

  -- DELETE conversations
  IF CARDINALITY(v_conversation_ids) > 0 THEN
    DELETE FROM public.conversations WHERE id = ANY(v_conversation_ids);
  END IF;

  -- DELETE contact_tags
  IF CARDINALITY(v_contact_ids) > 0 THEN
    DELETE FROM public.contact_tags WHERE contact_id = ANY(v_contact_ids);
  END IF;

  -- DELETE contact_notes
  IF CARDINALITY(v_contact_ids) > 0 THEN
    DELETE FROM public.contact_notes WHERE contact_id = ANY(v_contact_ids);
  END IF;

  -- DELETE automation_pending_executions
  IF CARDINALITY(v_contact_ids) > 0 THEN
    DELETE FROM public.automation_pending_executions WHERE contact_id = ANY(v_contact_ids);
  END IF;

  -- DELETE automation_logs
  IF CARDINALITY(v_contact_ids) > 0 THEN
    DELETE FROM public.automation_logs WHERE contact_id = ANY(v_contact_ids);
  END IF;

  -- DELETE notifications
  IF CARDINALITY(v_contact_ids) > 0 THEN
    DELETE FROM public.notifications WHERE contact_id = ANY(v_contact_ids);
  END IF;

  -- UNLINK properties & delete clients
  IF CARDINALITY(v_client_ids) > 0 THEN
    UPDATE public.properties SET client_id = NULL WHERE client_id = ANY(v_client_ids);
    DELETE FROM public.clients WHERE id = ANY(v_client_ids);
  END IF;

  -- UNLINK properties & delete investors
  IF CARDINALITY(v_investor_ids) > 0 THEN
    UPDATE public.properties SET investor_id = NULL WHERE investor_id = ANY(v_investor_ids);
    DELETE FROM public.investors WHERE id = ANY(v_investor_ids);
  END IF;

  -- FINALLY DELETE contacts
  IF CARDINALITY(v_contact_ids) > 0 THEN
    DELETE FROM public.contacts WHERE id = ANY(v_contact_ids);
  END IF;

  RAISE NOTICE 'Successfully removed records for 918169787644 and all related references.';
END;
$$;
