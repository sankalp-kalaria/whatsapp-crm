-- ============================================================
-- 052_notification_status_and_deleted_view.sql
--
-- Soft-Delete Status for Notifications:
-- 1. Adds `status` ('active' | 'deleted') and `deleted_at` columns
--    to `public.notifications` without affecting existing data
--    (all existing rows default to `status = 'active'`).
-- 2. Grants `UPDATE (read_at, status, deleted_at)` on `notifications`
--    to `authenticated` and adds a DELETE/UPDATE policy for account
--    members so deleted notifications persist across browser refreshes
--    and can be viewed/restored in the "Deleted Notifications" tab.
-- ============================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_status_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('active', 'deleted'));

-- Ensure all existing rows have status = 'active'
UPDATE public.notifications
SET status = 'active'
WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_account_status
  ON public.notifications(account_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_account_entity
  ON public.notifications(account_id, entity_type, entity_id);

-- Allow account members to select, update (read_at, status, deleted_at), and insert notifications
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT
  USING (auth.uid() = user_id OR is_account_member(account_id));

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id OR is_account_member(account_id, 'agent'))
  WITH CHECK (auth.uid() = user_id OR is_account_member(account_id, 'agent'));

GRANT UPDATE (read_at, status, deleted_at) ON public.notifications TO authenticated;

