-- Retention notifications are tracked separately from the project files.
create table if not exists public.project_file_retention_notifications (
  project_id uuid primary key references public.projects(id) on delete cascade,
  completed_at timestamptz not null,
  warned_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.project_file_retention_notifications enable row level security;
revoke all on public.project_file_retention_notifications from anon, authenticated;
grant select, insert, update, delete on public.project_file_retention_notifications to service_role;
