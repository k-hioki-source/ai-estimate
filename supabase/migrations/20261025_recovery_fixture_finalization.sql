-- One-off recovery fixture finalization. NOT a production file deletion facility.
-- Apply manually only after the dedicated Storage deletion test is reviewed.
-- SECURITY DEFINER executes with the function owner's permissions.
create table if not exists public.csw_recovery_fixture_finalization_audit (\n  file_id uuid primary key,\n  project_id uuid not null,\n  storage_path text not null,\n  claim_token uuid not null,\n  finalized_at timestamptz not null default now()\n);\nalter table public.csw_recovery_fixture_finalization_audit enable row level security;\nrevoke all on public.csw_recovery_fixture_finalization_audit from public, anon, authenticated;\ngrant select, insert on public.csw_recovery_fixture_finalization_audit to service_role;\n\ncreate or replace function public.finalize_csw_recovery_test_fixture(
  p_file_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid := 'c5723ed4-bdbe-439d-88a1-f1d7213f654f'::uuid;
  v_file uuid := '2b3abd29-fd48-416c-8a9d-64882e4798d4'::uuid;
  v_name text := 'csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
  v_path text := 'c5723ed4-bdbe-439d-88a1-f1d7213f654f/csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
  v_count integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required';
  end if;
  if p_file_id is distinct from v_file or p_claim_token is null then
    raise exception 'fixture identity mismatch';
  end if;

  -- Row locks serialize concurrent finalization attempts.
  perform 1 from public.project_files
    where id = v_file and project_id = v_project
      and file_name = v_name and storage_path = v_path
    for update;
  if not found then raise exception 'fixture record mismatch'; end if;

  perform 1 from public.project_file_retention_jobs
    where file_id = v_file and project_id = v_project
      and status = 'storage_removed' and claim_token::text = p_claim_token::text
    for update;
  if not found then raise exception 'fixture job mismatch'; end if;

  select count(*) into v_count from public.project_files where storage_path = v_path;
  if v_count <> 1 then raise exception 'storage path shared'; end if;

  if exists (select 1 from public.csw_recovery_fixture_finalization_audit where file_id = v_file) then\n    raise exception 'fixture already finalized';\n  end if;\n  -- Recheck Storage metadata within this DB transaction.\n  -- The API also checks Storage using the Storage service before invoking this RPC.\n  if exists (select 1 from storage.objects where bucket_id = 'project-files' and name = v_path) then\n    raise exception 'storage object still present';\n  end if;\n\n  if exists (select 1 from public.project_file_shares where file_id = v_file) then
    raise exception 'share references remain';
  end if;
  if exists (select 1 from public.project_file_retention_holds
    where project_id = v_project and is_held = true) then
    raise exception 'retention hold active';
  end if;

  -- Storage absence must be checked separately by the authenticated API.
  -- Both database deletions below commit or roll back together.
  delete from public.project_file_retention_jobs
    where file_id = v_file and project_id = v_project
      and status = 'storage_removed' and claim_token::text = p_claim_token::text;
  if not found then raise exception 'job deletion failed'; end if;
  delete from public.project_files
    where id = v_file and project_id = v_project
      and file_name = v_name and storage_path = v_path;
  if not found then raise exception 'file deletion failed'; end if;
  return true;
end;
$$;

revoke all on function public.finalize_csw_recovery_test_fixture(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_csw_recovery_test_fixture(uuid, uuid)
  to service_role;
