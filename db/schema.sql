-- Phantasm 2026 backend schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  reset_token_hash      TEXT,
  reset_token_expires   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phantasm_id           TEXT UNIQUE,
  college_name          TEXT NOT NULL,
  department            TEXT,
  year                  TEXT,
  contact_name          TEXT NOT NULL,
  contact_email         TEXT NOT NULL,
  contact_phone         TEXT NOT NULL,
  is_pass               BOOLEAN NOT NULL DEFAULT false,
  needs_accommodation   TEXT NOT NULL DEFAULT 'no' CHECK (needs_accommodation IN ('yes', 'no')),
  total_amount          INTEGER NOT NULL DEFAULT 0,
  payment_status        TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
  cashfree_order_id     TEXT UNIQUE,
  confirmation_email_sent_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registrations_contact_email ON registrations (lower(contact_email));
CREATE INDEX IF NOT EXISTS idx_registrations_payment_status ON registrations (payment_status);

CREATE TABLE IF NOT EXISTS event_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id   UUID NOT NULL REFERENCES registrations (id) ON DELETE CASCADE,
  event_id          TEXT NOT NULL,
  event_name        TEXT NOT NULL,
  event_type        TEXT NOT NULL CHECK (event_type IN ('solo', 'team')),
  event_category    TEXT NOT NULL,
  team_name         TEXT,
  amount            INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_entries_registration ON event_entries (registration_id);
CREATE INDEX IF NOT EXISTS idx_event_entries_lookup ON event_entries (event_id, lower(team_name));

CREATE TABLE IF NOT EXISTS participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_entry_id    UUID NOT NULL REFERENCES event_entries (id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participants_entry ON participants (event_entry_id);
CREATE INDEX IF NOT EXISTS idx_participants_email ON participants (lower(email));

-- Session store for express-session (connect-pg-simple creates/uses this
-- automatically, declared here too so a fresh migrate sets it up).
CREATE TABLE IF NOT EXISTS "session" (
  "sid"     VARCHAR NOT NULL COLLATE "default",
  "sess"    JSON NOT NULL,
  "expire"  TIMESTAMPTZ NOT NULL
)
WITH (OIDS=FALSE);

ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_pkey";
ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
