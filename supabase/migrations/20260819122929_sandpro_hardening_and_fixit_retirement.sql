-- SandPro OMP production hardening and Fix-It Feed retirement.
-- Historical Fix-It rows and storage objects are intentionally preserved.

-- A signed-in user may read the company directory and change only their own
-- avatar. Org roles, reporting lines, identity fields, and signup rows remain
-- server-managed.
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.profiles FROM authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (avatar_url) ON TABLE public.profiles TO authenticated;

DROP POLICY IF EXISTS "Allow insert during signup" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own avatar"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- Retire the Fix-It application surface without deleting its audit history.
REVOKE ALL ON TABLE public.fix_it_posts FROM anon, authenticated;
REVOKE ALL ON TABLE public.fix_it_comments FROM anon, authenticated;
REVOKE ALL ON TABLE public.fix_it_attachments FROM anon, authenticated;

DROP POLICY IF EXISTS "Fix-It attachments visible to moderators" ON public.fix_it_attachments;
DROP POLICY IF EXISTS "Moderators create Fix-It attachments" ON public.fix_it_attachments;
DROP POLICY IF EXISTS "Fix-It comments visible to moderators" ON public.fix_it_comments;
DROP POLICY IF EXISTS "Moderators create Fix-It comments" ON public.fix_it_comments;
DROP POLICY IF EXISTS "Moderators delete Fix-It comments" ON public.fix_it_comments;
DROP POLICY IF EXISTS "Moderators update Fix-It comments" ON public.fix_it_comments;
DROP POLICY IF EXISTS "Fix-It posts visible to moderators" ON public.fix_it_posts;
DROP POLICY IF EXISTS "Moderators create Fix-It posts" ON public.fix_it_posts;
DROP POLICY IF EXISTS "Moderators delete Fix-It posts" ON public.fix_it_posts;
DROP POLICY IF EXISTS "Moderators update Fix-It posts" ON public.fix_it_posts;

DROP POLICY IF EXISTS "Moderators read Fix-It file objects" ON storage.objects;
DROP POLICY IF EXISTS "Moderators upload Fix-It file objects" ON storage.objects;
DROP POLICY IF EXISTS "Moderators delete Fix-It file objects" ON storage.objects;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'fix_it_posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.fix_it_posts;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'fix_it_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.fix_it_comments;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'fix_it_attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.fix_it_attachments;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.is_fix_it_moderator() FROM PUBLIC, anon, authenticated;

-- Client telemetry and paid/compute-backed APIs go through bounded server
-- endpoints. The service role is the only database writer.
DROP POLICY IF EXISTS "Anyone can file a client error report" ON public.client_errors;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.client_errors FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.client_errors TO service_role;

CREATE TABLE IF NOT EXISTS public.api_rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_key TEXT NOT NULL CHECK (char_length(actor_key) BETWEEN 1 AND 180),
  scope TEXT NOT NULL CHECK (char_length(scope) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.api_rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.api_rate_limit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.api_rate_limit_events TO service_role;
CREATE INDEX IF NOT EXISTS api_rate_limit_events_actor_scope_created_idx
  ON public.api_rate_limit_events (actor_key, scope, created_at DESC);
CREATE INDEX IF NOT EXISTS api_rate_limit_events_created_idx
  ON public.api_rate_limit_events (created_at);

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_actor_key TEXT,
  p_scope TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  used_count INTEGER;
  oldest_event TIMESTAMPTZ;
  safe_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 1), 1000));
  safe_window INTEGER := GREATEST(1, LEAST(COALESCE(p_window_seconds, 60), 86400));
BEGIN
  IF p_actor_key IS NULL OR btrim(p_actor_key) = '' OR p_scope IS NULL OR btrim(p_scope) = '' THEN
    RAISE EXCEPTION 'actor key and scope are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_key || ':' || p_scope, 0));

  SELECT count(*), min(created_at)
    INTO used_count, oldest_event
  FROM public.api_rate_limit_events
  WHERE actor_key = p_actor_key
    AND scope = p_scope
    AND created_at >= NOW() - make_interval(secs => safe_window);

  IF used_count >= safe_limit THEN
    RETURN QUERY SELECT
      false,
      0,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
        oldest_event + make_interval(secs => safe_window) - NOW()
      )))::INTEGER);
    RETURN;
  END IF;

  INSERT INTO public.api_rate_limit_events (actor_key, scope)
  VALUES (p_actor_key, p_scope);

  RETURN QUERY SELECT true, GREATEST(0, safe_limit - used_count - 1), 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;

-- Lock down trigger helpers: fixed search paths prevent object-shadowing, and
-- trigger-only functions are not callable through the public Data API.
ALTER FUNCTION public.handle_new_user()
  SET search_path = pg_catalog, public, auth;
ALTER FUNCTION public.update_updated_at()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_updated_at()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.create_default_objective_workflow()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.create_default_project_assessment_artifacts()
  SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_default_objective_workflow() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_default_project_assessment_artifacts() FROM PUBLIC, anon, authenticated;

-- Supabase recommends init-plan caching for stable auth helpers in RLS. Apply
-- the mechanical rewrite to app-owned public/storage policies only.
DO $$
DECLARE
  policy_row RECORD;
  next_qual TEXT;
  next_check TEXT;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (
        COALESCE(qual, '') LIKE '%auth.uid()%'
        OR COALESCE(qual, '') LIKE '%auth.jwt()%'
        OR COALESCE(with_check, '') LIKE '%auth.uid()%'
        OR COALESCE(with_check, '') LIKE '%auth.jwt()%'
      )
  LOOP
    IF policy_row.qual IS NOT NULL THEN
      next_qual := replace(replace(policy_row.qual, 'auth.uid()', '(SELECT auth.uid())'), 'auth.jwt()', '(SELECT auth.jwt())');
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I USING (%s)',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        next_qual
      );
    END IF;
    IF policy_row.with_check IS NOT NULL THEN
      next_check := replace(replace(policy_row.with_check, 'auth.uid()', '(SELECT auth.uid())'), 'auth.jwt()', '(SELECT auth.jwt())');
      EXECUTE format(
        'ALTER POLICY %I ON %I.%I WITH CHECK (%s)',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        next_check
      );
    END IF;
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
