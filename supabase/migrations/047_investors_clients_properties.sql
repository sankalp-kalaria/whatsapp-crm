-- ============================================================
-- 047_investors_clients_properties.sql
--
-- Real Estate Extension:
--   1. `investors` table: Flat owners with purchase flat details,
--      rental status, rent start/end dates, agreement details, and
--      agreement expiry tracking.
--   2. `clients` table: Customers/tenants with Aadhar/PAN ID proofs,
--      agreement details, linked investor, rent/deposit details.
--   3. `properties` table: Property listings with interest status
--      (interested, buy, sell, already visited, not interested, etc.),
--      linked investor and client, media links, and Google Drive folder info.
--   4. `google_drive_configs` table: Account-scoped Google Drive OAuth
--      and storage settings for automatic folder and media uploads.
--   5. Updates `notifications` table check constraint to support
--      agreement & rent expiry notifications.
--   6. Supabase Storage bucket `property-media` for media storage.
-- ============================================================

-- ============================================================
-- 1. INVESTORS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS investors (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  phone                TEXT NOT NULL,
  email                TEXT,
  address              TEXT,                       -- Investor's personal address
  purchase_flat_details TEXT,                      -- Details of flat purchased (unit/tower/project)
  rental_status        TEXT NOT NULL DEFAULT 'pending_for_rent'
                       CHECK (rental_status IN ('rented', 'pending_for_rent', 'vacant', 'self_occupied')),
  rent_amount          NUMERIC(14, 2),
  rent_start_date      DATE,
  rent_end_date        DATE,
  agreement_details    TEXT,
  agreement_start_date DATE,
  agreement_end_date   DATE,
  notes                TEXT,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investors_account_id ON investors(account_id);
CREATE INDEX IF NOT EXISTS idx_investors_phone ON investors(phone);
CREATE INDEX IF NOT EXISTS idx_investors_agreement_end ON investors(agreement_end_date);
CREATE INDEX IF NOT EXISTS idx_investors_rent_end ON investors(rent_end_date);
CREATE INDEX IF NOT EXISTS idx_investors_rental_status ON investors(rental_status);

ALTER TABLE investors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS investors_select ON investors;
CREATE POLICY investors_select ON investors FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS investors_insert ON investors;
CREATE POLICY investors_insert ON investors FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS investors_update ON investors;
CREATE POLICY investors_update ON investors FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS investors_delete ON investors;
CREATE POLICY investors_delete ON investors FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- ============================================================
-- 2. CLIENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  phone                TEXT NOT NULL,
  email                TEXT,
  id_proof_type        TEXT DEFAULT 'Aadhar Card', -- Aadhar Card, PAN Card, Passport, etc.
  id_proof_number      TEXT,
  id_proof_details     TEXT,                       -- Additional proof details or document remarks
  investor_id          UUID REFERENCES investors(id) ON DELETE SET NULL, -- Linked investor (flat owner)
  agreement_details    TEXT,
  agreement_start_date DATE,
  agreement_end_date   DATE,
  rent_amount          NUMERIC(14, 2),
  deposit_amount       NUMERIC(14, 2),
  status               TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'in_process', 'agreement_signed', 'expired', 'closed')),
  address              TEXT,
  notes                TEXT,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_account_id ON clients(account_id);
CREATE INDEX IF NOT EXISTS idx_clients_investor_id ON clients(investor_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_agreement_end ON clients(agreement_end_date);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clients_select ON clients;
CREATE POLICY clients_select ON clients FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS clients_insert ON clients;
CREATE POLICY clients_insert ON clients FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS clients_update ON clients;
CREATE POLICY clients_update ON clients FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS clients_delete ON clients;
CREATE POLICY clients_delete ON clients FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- ============================================================
-- 3. PROPERTIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS properties (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,            -- Property name / title (also folder name in Drive)
  property_type          TEXT NOT NULL DEFAULT 'flat', -- flat, apartment, villa, commercial, shop, plot, office
  address                TEXT,
  city                   TEXT,
  price                  NUMERIC(14, 2),
  listing_type           TEXT NOT NULL DEFAULT 'rent'
                         CHECK (listing_type IN ('rent', 'sell', 'buy', 'lease')),
  status                 TEXT NOT NULL DEFAULT 'interested'
                         CHECK (status IN ('interested', 'buy', 'sell', 'already_visited', 'not_interested', 'available', 'under_negotiation', 'sold', 'rented')),
  interest_status        TEXT DEFAULT 'interested'
                         CHECK (interest_status IN ('interested', 'buy', 'sell', 'already_visited', 'not_interested')),
  investor_id            UUID REFERENCES investors(id) ON DELETE SET NULL, -- Linked owner/investor
  client_id              UUID REFERENCES clients(id) ON DELETE SET NULL,   -- Interested/renting client
  bedrooms               INT,
  bathrooms              INT,
  area_sqft              NUMERIC(10, 2),
  description            TEXT,
  media_urls             JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { id, name, type, url, thumbnail, driveFileId }
  google_drive_folder_id TEXT,                     -- Folder ID on Google Drive
  google_drive_folder_url TEXT,                    -- Web view URL on Google Drive
  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_account_id ON properties(account_id);
CREATE INDEX IF NOT EXISTS idx_properties_investor_id ON properties(investor_id);
CREATE INDEX IF NOT EXISTS idx_properties_client_id ON properties(client_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_interest_status ON properties(interest_status);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS properties_select ON properties;
CREATE POLICY properties_select ON properties FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS properties_insert ON properties;
CREATE POLICY properties_insert ON properties FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS properties_update ON properties;
CREATE POLICY properties_update ON properties FOR UPDATE
  USING (is_account_member(account_id, 'agent'));

DROP POLICY IF EXISTS properties_delete ON properties;
CREATE POLICY properties_delete ON properties FOR DELETE
  USING (is_account_member(account_id, 'agent'));

-- ============================================================
-- 4. GOOGLE DRIVE CONFIGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS google_drive_configs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id              TEXT,
  client_secret          TEXT,
  refresh_token          TEXT,
  access_token           TEXT,
  access_token_expires_at TIMESTAMPTZ,
  root_folder_id         TEXT,
  root_folder_name       TEXT NOT NULL DEFAULT 'WACRM Properties',
  is_connected           BOOLEAN NOT NULL DEFAULT FALSE,
  connected_email        TEXT,
  api_key                TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id)
);

CREATE INDEX IF NOT EXISTS idx_google_drive_configs_account ON google_drive_configs(account_id);

ALTER TABLE google_drive_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS google_drive_configs_select ON google_drive_configs;
CREATE POLICY google_drive_configs_select ON google_drive_configs FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS google_drive_configs_insert ON google_drive_configs;
CREATE POLICY google_drive_configs_insert ON google_drive_configs FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS google_drive_configs_update ON google_drive_configs;
CREATE POLICY google_drive_configs_update ON google_drive_configs FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS google_drive_configs_delete ON google_drive_configs;
CREATE POLICY google_drive_configs_delete ON google_drive_configs FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- 5. NOTIFICATIONS EXTENSION
-- ============================================================
-- Expand notifications type CHECK to allow agreement notifications
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('conversation_assigned', 'agreement_expiring', 'agreement_expired', 'rent_expiring'));

-- Add entity references and soft-delete status to notifications
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Grant authenticated users capability to insert system agreement notifications
DROP POLICY IF EXISTS notifications_insert_system ON notifications;
CREATE POLICY notifications_insert_system ON notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_account_member(account_id, 'agent'));

-- ============================================================
-- 6. STORAGE BUCKET FOR PROPERTY MEDIA
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-media',
  'property-media',
  TRUE,
  104857600, -- 100 MB limit per video/image
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Property media is publicly readable" ON storage.objects;
CREATE POLICY "Property media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'property-media');

DROP POLICY IF EXISTS "Authenticated users can upload property media" ON storage.objects;
CREATE POLICY "Authenticated users can upload property media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'property-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can update property media" ON storage.objects;
CREATE POLICY "Authenticated users can update property media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'property-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete property media" ON storage.objects;
CREATE POLICY "Authenticated users can delete property media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'property-media' AND auth.role() = 'authenticated');

-- ============================================================
-- 7. ENABLE REALTIME
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'investors'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE investors;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'clients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE clients;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'properties'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE properties;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'google_drive_configs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE google_drive_configs;
  END IF;
END $$;
