-- ============================================================================
-- DataMind BI — API Keys Manager
-- Migration 0001: Schema additions (PostgreSQL / Supabase)
-- ============================================================================
-- This migration creates the tables that back the DataMind BI API Keys
-- Manager. It is designed to coexist with the existing BIweb schema in the
-- same Supabase project: it does NOT touch any existing table, it only adds
-- new ones plus a lightweight `user_profiles` extension table that is joined
-- 1:1 with `auth.users`.
--
-- Run order:
--   0001_schema_additions.sql   (this file)
--   0002_rls_policies.sql       (RLS policies on the tables below)
--
-- Notes:
--   * Primary keys are UUIDs to match Supabase `auth.users.id`.
--   * `user_id` columns are FK'd to `auth.users(id) ON DELETE CASCADE` so
--     deleting a user from Supabase Auth automatically cleans up their keys,
--     logs and audit trail.
--   * `scopes` and `allowed_ips` are stored as JSONB (not TEXT) so we can
--     use Postgres JSON operators if needed later.
--   * API key hashes are SHA-256 hex strings (64 chars). The raw key is NEVER
--     stored. See `hash_api_key()` in 0002.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Required extensions
-- ----------------------------------------------------------------------------
-- pgcrypto is already enabled on every Supabase project, but we make it
-- idempotent just in case.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. user_profiles — per-tenant metadata joined 1:1 with auth.users
-- ----------------------------------------------------------------------------
-- In production this replaces the sandbox `User` model. We do NOT modify
-- `auth.users` directly (Supabase owns that table); instead we store the
-- DataMind-specific fields here.
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid        NOT NULL UNIQUE
                              REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_name   text        NOT NULL DEFAULT 'Personal',
    avatar_color  text        NOT NULL DEFAULT 'from-emerald-500 to-teal-600',
    -- "owner" | "admin" | "viewer" — drives what the portal shows.
    role          text        NOT NULL DEFAULT 'owner'
                              CHECK (role IN ('owner', 'admin', 'viewer')),
    last_login_at timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id
    ON public.user_profiles(user_id);

-- Auto-update updated_at on every row change.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_touch ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_touch
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. api_keys — hashed API keys for third-party integrations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_keys (
    id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               uuid        NOT NULL
                                      REFERENCES auth.users(id) ON DELETE CASCADE,
    -- SHA-256 hex of the raw key. UNIQUE so we can look up by hash.
    key_hash              text        NOT NULL UNIQUE,
    -- First 12 chars of the raw key, e.g. "dm_live_aD3f". Safe to display.
    key_prefix            text        NOT NULL,
    label                 text        NOT NULL,
    -- JSON array of scopes, e.g. ["read","execute"]. Default: [].
    scopes                jsonb       NOT NULL DEFAULT '[]'::jsonb,
    -- JSON array of allowed IPs/CIDRs. Empty = allow all.
    allowed_ips           jsonb       NOT NULL DEFAULT '[]'::jsonb,
    -- Per-key rate limit (requests per minute). NULL = global default (60).
    rate_limit_per_minute integer,
    revoked_at            timestamptz,
    last_used_at          timestamptz,
    last_used_ip          inet,
    expires_at            timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id
    ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
    ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_active
    ON public.api_keys(user_id)
    WHERE revoked_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3. api_request_logs — per-call observability for the public API
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.api_request_logs (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id   uuid        NOT NULL
                             REFERENCES public.api_keys(id) ON DELETE CASCADE,
    endpoint     text        NOT NULL,
    method       text        NOT NULL,
    status_code  integer     NOT NULL,
    duration_ms  integer     NOT NULL,
    row_count    integer,
    ip           inet,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_key_created
    ON public.api_request_logs(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created
    ON public.api_request_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. settings_audit_logs — compliance trail for management actions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings_audit_logs (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid        NOT NULL
                               REFERENCES auth.users(id) ON DELETE CASCADE,
    -- "api_key.create" | "api_key.update" | "api_key.revoke"
    action         text        NOT NULL,
    api_key_id     uuid,
    api_key_label  text,
    -- JSON snapshot: full new record (minus hash) for create,
    -- { before, after } for update, { revokedAt } for revoke.
    diff           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    ip             inet,
    user_agent     text,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settings_audit_logs_user_created
    ON public.settings_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_settings_audit_logs_api_key
    ON public.settings_audit_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_settings_audit_logs_action
    ON public.settings_audit_logs(action);

-- ----------------------------------------------------------------------------
-- 5. Helper: hash_api_key(raw text) -> text
-- ----------------------------------------------------------------------------
-- Mirrors the Node `sha256(raw).digest('hex')` used by the app so the DB
-- can be used to look up a key by hash if ever needed (e.g. for ops
-- debugging). The application is the source of truth for hashing at
-- request time; this function is provided for convenience.
CREATE OR REPLACE FUNCTION public.hash_api_key(raw_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT encode(digest(raw_key, 'sha256'), 'hex');
$$;

-- ----------------------------------------------------------------------------
-- 6. Comments (show up in Supabase Studio / psql \d+)
-- ----------------------------------------------------------------------------
COMMENT ON TABLE  public.user_profiles        IS 'Per-tenant metadata joined 1:1 with auth.users for the DataMind BI API Keys Manager.';
COMMENT ON TABLE  public.api_keys             IS 'Hashed API keys issued to third-party integrations (OpenFN, N8N, etc.).';
COMMENT ON TABLE  public.api_request_logs     IS 'Per-call observability log for the public API (/api/public/v1/*).';
COMMENT ON TABLE  public.settings_audit_logs  IS 'Compliance trail for management actions on API keys (create/update/revoke).';
COMMENT ON COLUMN public.api_keys.key_hash    IS 'SHA-256 hex of the raw key. The raw key is NEVER stored.';
COMMENT ON COLUMN public.api_keys.key_prefix  IS 'First 12 chars of the raw key (e.g. dm_live_aD3f). Safe to display.';
COMMENT ON COLUMN public.api_keys.scopes      IS 'JSON array of scopes: ["read","execute","admin"].';
COMMENT ON COLUMN public.api_keys.allowed_ips IS 'JSON array of allowed IPs/CIDRs. Empty array = allow all.';

-- End of 0001_schema_additions.sql
