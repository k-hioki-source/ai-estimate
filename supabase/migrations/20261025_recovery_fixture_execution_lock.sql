-- Test fixture only: permanent one-shot execution latch.
-- Applying this migration does not delete files or activate any endpoint.
-- Only the exact test file may be inserted by the guarded API.
CREATE TABLE IF NOT EXISTS public.csw_recovery_fixture_execution_locks (
  file_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  claim_token uuid NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT csw_fixture_only_file CHECK (file_id = '2b3abd29-fd48-416c-8a9d-64882e4798d4'::uuid),
  CONSTRAINT csw_fixture_only_project CHECK (project_id = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f'::uuid)
);
ALTER TABLE public.csw_recovery_fixture_execution_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.csw_recovery_fixture_execution_locks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.csw_recovery_fixture_execution_locks TO service_role;
-- Do not automatically clear this latch, even on errors. A human must investigate
-- whether Storage deletion occurred before considering a second execution.
