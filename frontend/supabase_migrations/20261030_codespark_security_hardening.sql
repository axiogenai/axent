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
