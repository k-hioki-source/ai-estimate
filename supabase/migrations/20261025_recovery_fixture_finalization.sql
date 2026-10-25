-- CS Works: one-off recovery test fixture finalization.
-- REVIEW ONLY: Do not execute until schema, authorization and deletion behavior are reviewed.
-- This migration registers a function. It does NOT call the function or delete any files.

CREATE TABLE IF NOT EXISTS public.csw_recovery_fixture_finalization_audit (
  file_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  storage_path text NOT NULL,
  claim_token uuid NOT NULL,
  finalized_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.csw_recovery_fixture_finalization_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.csw_recovery_fixture_finalization_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.csw_recovery_fixture_finalization_audit TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_csw_recovery_test_fixture(
  p_file_id uuid,
  p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project constant uuid := 'c5723ed4-bdbe-439d-88a1-f1d7213f654f'::uuid;
  v_file constant uuid := '2b3abd29-fd48-416c-8a9d-64882e4798d4'::uuid;
  v_name constant text := 'csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
  v_path constant text := 'c5723ed4-bdbe-439d-88a1-f1d7213f654f/csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
  v_count integer;
BEGIN
  -- auth.role() evaluates the request JWT role, not the function owner's SQL role.
  -- Revoke EXECUTE from all non-service roles below as an additional boundary.
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF p_file_id IS DISTINCT FROM v_file OR p_claim_token IS NULL THEN
    RAISE EXCEPTION 'fixture identity mismatch';
  END IF;

  -- Lock exact rows. A mismatch aborts the transaction.
  PERFORM 1 FROM public.project_files
    WHERE id = v_file AND project_id = v_project
      AND file_name = v_name AND storage_path = v_path
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fixture record mismatch'; END IF;

  PERFORM 1 FROM public.project_file_retention_jobs
    WHERE file_id = v_file AND project_id = v_project
      AND status = 'storage_removed' AND claim_token = p_claim_token
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'fixture job mismatch'; END IF;

  SELECT count(*) INTO v_count FROM public.project_files WHERE storage_path = v_path;
  IF v_count <> 1 THEN RAISE EXCEPTION 'storage path shared'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.csw_recovery_fixture_finalization_audit WHERE file_id = v_file
  ) THEN
    RAISE EXCEPTION 'fixture already finalized';
  END IF;

  -- Second-level Storage metadata guard; the API independently checks Storage first.
  IF EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'project-files' AND name = v_path
  ) THEN
    RAISE EXCEPTION 'storage object still present';
  END IF;

  IF EXISTS (SELECT 1 FROM public.project_file_shares WHERE file_id = v_file) THEN
    RAISE EXCEPTION 'share references remain';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.project_file_retention_holds
    WHERE project_id = v_project AND is_held = true
  ) THEN
    RAISE EXCEPTION 'retention hold active';
  END IF;

  -- Audit and both deletions form a single database transaction.
  INSERT INTO public.csw_recovery_fixture_finalization_audit
    (file_id, project_id, storage_path, claim_token)
  VALUES (v_file, v_project, v_path, p_claim_token);

  DELETE FROM public.project_file_retention_jobs
    WHERE file_id = v_file AND project_id = v_project
      AND status = 'storage_removed' AND claim_token = p_claim_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'job deletion failed'; END IF;

  DELETE FROM public.project_files
    WHERE id = v_file AND project_id = v_project
      AND file_name = v_name AND storage_path = v_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'file deletion failed'; END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_csw_recovery_test_fixture(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_csw_recovery_test_fixture(uuid, uuid)
  TO service_role;
