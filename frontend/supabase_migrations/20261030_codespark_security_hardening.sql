-- CodeSpark protected configuration and Round 2 workstation boundary.
-- Existing candidate station IDs remain compatible; protected config and Round 2
-- records are no longer directly readable/writable by anonymous browser clients.

DROP POLICY IF EXISTS "Allow public read-write for candidate_stations" ON public.candidate_stations;
DROP POLICY IF EXISTS "CodeSpark public workstation access" ON public.candidate_stations;
DROP POLICY IF EXISTS "CodeSpark trusted admin access" ON public.candidate_stations;

ALTER TABLE public.candidate_stations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_stations TO anon, authenticated;

CREATE POLICY "CodeSpark public workstation access"
  ON public.candidate_stations
  FOR ALL
  TO anon
  USING (
    id NOT IN ('codespark_system_config', 'codespark_round2_questions')
    AND id NOT LIKE 'r2_station_%'
    AND id NOT LIKE 'r2_sub_%'
  )
  WITH CHECK (
    id NOT IN ('codespark_system_config', 'codespark_round2_questions')
    AND id NOT LIKE 'r2_station_%'
    AND id NOT LIKE 'r2_sub_%'
  );

CREATE POLICY "CodeSpark trusted admin access"
  ON public.candidate_stations
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.jwt()->'app_metadata'->>'role' = 'admin')
  WITH CHECK (auth.uid() IS NOT NULL AND auth.jwt()->'app_metadata'->>'role' = 'admin');

-- Remove permissive public policies left by the original schema and the MCQ hardening migration.
-- Candidate MCQ operations continue through the token-validated SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Allow public read-write for mcq_exams" ON public.mcq_exams;
DROP POLICY IF EXISTS "Allow public read-write for mcq_questions" ON public.mcq_questions;
DROP POLICY IF EXISTS "Allow public read-write for mcq_attempts" ON public.mcq_attempts;

-- Lab metadata remains publicly readable for station discovery, but only admins may mutate it.
DROP POLICY IF EXISTS "Allow public read-write for college_labs" ON public.college_labs;
DROP POLICY IF EXISTS "Public can read college labs" ON public.college_labs;
DROP POLICY IF EXISTS "Trusted admin manages college labs" ON public.college_labs;
ALTER TABLE public.college_labs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.college_labs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.college_labs TO authenticated;
CREATE POLICY "Public can read college labs"
  ON public.college_labs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Trusted admin manages college labs"
  ON public.college_labs FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.jwt()->'app_metadata'->>'role' = 'admin')
  WITH CHECK (auth.uid() IS NOT NULL AND auth.jwt()->'app_metadata'->>'role' = 'admin');

-- Keep code submissions visible to trusted administrators only.
DROP POLICY IF EXISTS "Allow public read-write for code_submissions" ON public.code_submissions;
DROP POLICY IF EXISTS "Code submissions admin access" ON public.code_submissions;
ALTER TABLE public.code_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.code_submissions TO authenticated;
CREATE POLICY "Code submissions admin access"
  ON public.code_submissions
  FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.jwt()->'app_metadata'->>'role' = 'admin')
  WITH CHECK (auth.uid() IS NOT NULL AND auth.jwt()->'app_metadata'->>'role' = 'admin');

-- Service-role API routes are the only candidate-facing access path to protected
-- CodeSpark configuration, Round 2 problem sets, live code and submissions.

-- Persistent failed-key-attempt tracking. Only the server service-role API can access it.
CREATE TABLE IF NOT EXISTS public.codespark_key_lookup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_codespark_key_lookup_attempts_ip_time
  ON public.codespark_key_lookup_attempts(ip_hash, attempted_at DESC);
ALTER TABLE public.codespark_key_lookup_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.codespark_key_lookup_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.codespark_key_lookup_attempts TO service_role;

-- One-time, atomic final submission seal for each candidate.
CREATE TABLE IF NOT EXISTS public.codespark_round2_finalizations (
  candidate_hash text PRIMARY KEY,
  station_id text NOT NULL UNIQUE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  result jsonb NOT NULL
);
ALTER TABLE public.codespark_round2_finalizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.codespark_round2_finalizations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.codespark_round2_finalizations TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_codespark_round2_submission(
  p_candidate_hash text,
  p_station_id text,
  p_submission jsonb,
  p_student jsonb,
  p_station_number text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing jsonb;
  v_now bigint;
BEGIN
  IF p_candidate_hash IS NULL OR length(p_candidate_hash) <> 64
     OR p_station_id IS NULL OR p_station_id !~ '^r2_sub_[A-Z0-9_-]{1,80}$'
     OR p_submission IS NULL OR jsonb_typeof(p_submission) <> 'object'
     OR COALESCE((p_submission->>'isSubmitted')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'invalid Round 2 finalization payload' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_candidate_hash));

  SELECT result INTO v_existing
    FROM public.codespark_round2_finalizations
    WHERE candidate_hash = p_candidate_hash
    FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object('created', false, 'submission', v_existing);
  END IF;

  v_now := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;

  INSERT INTO public.codespark_round2_finalizations(candidate_hash, station_id, submitted_at, result)
  VALUES (p_candidate_hash, p_station_id, now(), p_submission);

  INSERT INTO public.candidate_stations(
    id, lab_id, station_number, status, code, student, last_updated_timestamp
  ) VALUES (
    p_station_id, 'ROUND_2_ARENA', COALESCE(NULLIF(p_station_number,''),'Station #01'),
    'SUBMITTED', p_submission::text, COALESCE(p_student,'{}'::jsonb), v_now
  )
  ON CONFLICT (id) DO UPDATE SET
    lab_id = EXCLUDED.lab_id,
    station_number = EXCLUDED.station_number,
    status = 'SUBMITTED',
    code = EXCLUDED.code,
    student = EXCLUDED.student,
    last_updated_timestamp = EXCLUDED.last_updated_timestamp
  WHERE public.candidate_stations.status <> 'SUBMITTED';

  RETURN jsonb_build_object('created', true, 'submission', p_submission);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_codespark_round2_submission(text,text,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_codespark_round2_submission(text,text,jsonb,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.save_codespark_round2_progress(
  p_candidate_hash text,
  p_station_id text,
  p_submission jsonb,
  p_student jsonb,
  p_station_number text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now bigint;
  v_status text;
BEGIN
  IF p_candidate_hash IS NULL OR length(p_candidate_hash) <> 64
     OR p_station_id IS NULL OR p_station_id !~ '^r2_sub_[A-Z0-9_-]{1,80}$'
     OR p_submission IS NULL OR jsonb_typeof(p_submission) <> 'object'
     OR COALESCE((p_submission->>'isSubmitted')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'invalid Round 2 progress payload' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_candidate_hash));

  IF EXISTS (SELECT 1 FROM public.codespark_round2_finalizations WHERE candidate_hash=p_candidate_hash) THEN
    RETURN false;
  END IF;

  SELECT status INTO v_status
    FROM public.candidate_stations
    WHERE id=p_station_id
    FOR UPDATE;
  IF v_status='SUBMITTED' THEN RETURN false; END IF;

  v_now := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  INSERT INTO public.candidate_stations(
    id, lab_id, station_number, status, code, student, last_updated_timestamp
  ) VALUES (
    p_station_id, 'ROUND_2_ARENA', COALESCE(NULLIF(p_station_number,''),'Station #01'),
    'IN_PROGRESS', p_submission::text, COALESCE(p_student,'{}'::jsonb), v_now
  )
  ON CONFLICT (id) DO UPDATE SET
    lab_id=EXCLUDED.lab_id,
    station_number=EXCLUDED.station_number,
    status='IN_PROGRESS',
    code=EXCLUDED.code,
    student=EXCLUDED.student,
    last_updated_timestamp=EXCLUDED.last_updated_timestamp
  WHERE public.candidate_stations.status <> 'SUBMITTED';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.save_codespark_round2_progress(text,text,jsonb,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_codespark_round2_progress(text,text,jsonb,jsonb,text) TO service_role;

-- Per-candidate Round 2 evaluation throttling to prevent hidden-test probing and compiler abuse.
CREATE TABLE IF NOT EXISTS public.codespark_round2_eval_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_hash text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_codespark_round2_eval_attempts_candidate_time
  ON public.codespark_round2_eval_attempts(candidate_hash, attempted_at DESC);
ALTER TABLE public.codespark_round2_eval_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.codespark_round2_eval_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.codespark_round2_eval_attempts TO service_role;

-- Rate-limit the server-side AI proxy so the secret provider key cannot be abused.
CREATE TABLE IF NOT EXISTS public.axent_ai_request_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_axent_ai_request_attempts_ip_time
  ON public.axent_ai_request_attempts(ip_hash, attempted_at DESC);
ALTER TABLE public.axent_ai_request_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.axent_ai_request_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.axent_ai_request_attempts TO service_role;
