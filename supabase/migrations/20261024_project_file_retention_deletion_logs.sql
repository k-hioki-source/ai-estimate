create table if not exists public.project_file_retention_deletion_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_id uuid not null,
  storage_path text not null,
  outcome text not null check (outcome in ('deleted', 'failed', 'skipped')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists retention_deletion_logs_created_idx on public.project_file_retention_deletion_logs(created_at desc);
alter table public.project_file_retention_deletion_logs enable row level security;
revoke all on public.project_file_retention_deletion_logs from anon, authenticated;
grant select, insert on public.project_file_retention_deletion_logs to service_role;
