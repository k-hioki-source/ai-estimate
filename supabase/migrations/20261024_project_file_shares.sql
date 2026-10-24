-- CS Works: time-limited file sharing. Run in Supabase SQL Editor before enabling the UI.
create table if not exists public.project_file_shares (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.project_files(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint share_expiry_after_creation check (expires_at > created_at)
);
create index if not exists project_file_shares_file_id_idx on public.project_file_shares(file_id);
create index if not exists project_file_shares_expiry_idx on public.project_file_shares(expires_at) where revoked_at is null;
alter table public.project_file_shares enable row level security;
-- All operations on this table use server-side service role after explicit project ownership/admin checks.
revoke all on public.project_file_shares from anon, authenticated;
comment on table public.project_file_shares is 'Temporary access tokens for approved CS Works project files. Never store raw tokens.';
