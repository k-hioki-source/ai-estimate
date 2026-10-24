-- One active claim per file. Used for preventing concurrent retention workers.
-- Creating this table does not enable file deletion.
create table if not exists public.project_file_retention_jobs (
  file_id uuid primary key references public.project_files(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'claimed'
    check (status in ('claimed', 'storage_removed', 'failed')),
  claim_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  last_error text
);
create index if not exists project_file_retention_jobs_status_idx
  on public.project_file_retention_jobs(status, updated_at);
alter table public.project_file_retention_jobs enable row level security;
revoke all on public.project_file_retention_jobs from anon, authenticated;
grant select, insert, update, delete on public.project_file_retention_jobs to service_role;

-- Atomic claim: concurrent requests for the same file cannot both acquire a job.
-- Expired claims are not automatically stolen; an operator must inspect and reset them.
create or replace function public.claim_project_file_retention_job(
  p_file_id uuid,
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  insert into public.project_file_retention_jobs
    (file_id, project_id, status, claim_token)
  values
    (p_file_id, p_project_id, 'claimed', v_token)
  on conflict (file_id) do nothing;
  if found then
    return v_token;
  end if;
  return null;
end;
$$;
revoke all on function public.claim_project_file_retention_job(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_project_file_retention_job(uuid, uuid)
  to service_role;
