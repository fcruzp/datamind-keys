-- ============================================================================
-- DataMind BI — API Keys Manager
-- Migration 0002: Row Level Security policies (PostgreSQL / Supabase)
-- ============================================================================
-- Enables RLS on every table created in 0001 and installs policies so that:
--
--   * An authenticated user can only see / modify rows that belong to THEM.
--   * `user_profiles` is owner-only (read + write).
--   * `api_keys` is owner-only (read + write + delete).
--   * `api_request_logs` is owner-only read; writes happen via the service
--     role (server-side) so the policy only needs SELECT for users.
--   * `settings_audit_logs` is owner-only read; same reason as above.
--
-- The "owner" is always resolved via `auth.uid()` (Supabase built-in) which
-- returns the JWT `sub` of the currently authenticated user.
--
-- IMPORTANT: the public API gateway (`/api/public/v1/*`) authenticates with a
-- Bearer API key (NOT a Supabase JWT), so those requests run through the
-- service role client (which bypasses RLS). The policies below therefore only
-- govern the *management* surface (the portal UI + `/api/settings/*`), where
-- the user is logged in via Supabase Auth and their JWT is forwarded.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Sanity: make sure RLS is enabled on every table
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_request_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings_audit_logs ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners, so a misconfigured service-role call
-- cannot accidentally leak data. The service role bypasses RLS by default
-- (that's the contract), but table owners do NOT bypass when FORCE is set.
-- This is the safest posture for a multi-tenant table.
ALTER TABLE public.user_profiles       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_request_logs    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settings_audit_logs FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1. user_profiles
-- ----------------------------------------------------------------------------
-- A user can read + update their own profile row. We do not allow DELETE
-- from the client (cascading delete happens automatically when the auth.users
-- row is removed).
DROP POLICY IF EXISTS user_profiles_select_own ON public.user_profiles;
CREATE POLICY user_profiles_select_own
    ON public.user_profiles
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_profiles_insert_own ON public.user_profiles;
CREATE POLICY user_profiles_insert_own
    ON public.user_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_profiles_update_own ON public.user_profiles;
CREATE POLICY user_profiles_update_own
    ON public.user_profiles
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. api_keys
-- ----------------------------------------------------------------------------
-- Owner can read, insert, update (e.g. revoke), and delete their own keys.
DROP POLICY IF EXISTS api_keys_select_own ON public.api_keys;
CREATE POLICY api_keys_select_own
    ON public.api_keys
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS api_keys_insert_own ON public.api_keys;
CREATE POLICY api_keys_insert_own
    ON public.api_keys
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS api_keys_update_own ON public.api_keys;
CREATE POLICY api_keys_update_own
    ON public.api_keys
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS api_keys_delete_own ON public.api_keys;
CREATE POLICY api_keys_delete_own
    ON public.api_keys
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. api_request_logs
-- ----------------------------------------------------------------------------
-- Owner can read their own logs (joined transitively via api_keys.user_id).
-- Inserts happen server-side via the service role (RLS bypass), so we don't
-- need an INSERT policy for end users.
DROP POLICY IF EXISTS api_request_logs_select_own ON public.api_request_logs;
CREATE POLICY api_request_logs_select_own
    ON public.api_request_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.api_keys k
            WHERE k.id = api_request_logs.api_key_id
              AND k.user_id = auth.uid()
        )
    );

-- ----------------------------------------------------------------------------
-- 4. settings_audit_logs
-- ----------------------------------------------------------------------------
-- Owner can read their own audit entries. Inserts happen server-side.
DROP POLICY IF EXISTS settings_audit_logs_select_own ON public.settings_audit_logs;
CREATE POLICY settings_audit_logs_select_own
    ON public.settings_audit_logs
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5. Auto-provision user_profiles on first login
-- ----------------------------------------------------------------------------
-- When a new user signs up via Supabase Auth, we want a user_profiles row
-- to exist automatically so the portal can render without a separate
-- provisioning step. The default tenant_name is 'Personal' and role 'owner'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id, tenant_name, role)
    VALUES (NEW.id, 'Personal', 'owner')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 6. Verify
-- ----------------------------------------------------------------------------
-- Quick sanity check (run manually in Supabase Studio after applying):
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class
--   WHERE relname IN ('user_profiles','api_keys','api_request_logs','settings_audit_logs');
-- All three columns should be TRUE.

-- End of 0002_rls_policies.sql
