-- CS Works retention hold flags; no storage objects are deleted by this migration.
create table if not exists public.project_file_retention_holds (
  project_id uuid primary key references public.projects(id) on delete cascade,
  is_held boolean not null default true,
  reason text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.project_file_retention_holds enable row level security;
revoke all on public.project_file_retention_holds from anon, authenticated;
grant select, insert, update, delete on public.project_file_retention_holds to service_role;
