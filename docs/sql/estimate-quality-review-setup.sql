-- Dedicated opt-in temporary data only. Does not modify estimates/projects/files.
create table public.estimate_quality_reviews (
  id uuid primary key default gen_random_uuid(),
  estimate_id text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '168 hours'),
  consent_version text not null check (consent_version = 'quality-review-7d-v1'),
  engine_version text not null,
  source_type text not null, usage text not null, style text not null,
  quantity integer not null check (quantity between 1 and 1000),
  notes text not null check (length(notes) <= 10000),
  image_mime text not null check (image_mime in ('image/jpeg','image/png','image/webp')),
  image_base64 text not null check (length(image_base64) between 1 and 4194304),
  snapshot jsonb not null,
  ai_hours numeric not null check (ai_hours > 0),
  ai_price numeric not null check (ai_price >= 0),
  status text not null default 'pending' check (status in ('pending','ok','corrected')),
  review_hours numeric check (review_hours > 0 and review_hours <= 1000),
  review_line_hours numeric check (review_line_hours >= 0),
  review_color_hours numeric check (review_color_hours >= 0),
  review_reason text not null default '' check (length(review_reason) <= 2000),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  revision integer not null default 0,
  check (status != 'corrected' or (review_hours is not null and length(trim(review_reason)) > 0))
);
create index estimate_quality_reviews_expiry on public.estimate_quality_reviews(expires_at);
create index estimate_quality_reviews_status_created on public.estimate_quality_reviews(status,created_at desc);
alter table public.estimate_quality_reviews enable row level security;
revoke all on public.estimate_quality_reviews from public,anon,authenticated;
grant select,insert,update,delete on public.estimate_quality_reviews to service_role;
-- No browser role can access rows. Server APIs additionally require profiles.role=admin.
-- Use trigger for a UTC-duration expiry: timestamptz + interval is not immutable.

create function public.enforce_quality_review_expiry() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.expires_at := now() + interval '168 hours';
  else
    new.created_at := old.created_at; new.expires_at := old.expires_at;
  end if;
  return new;
end $$;
revoke all on function public.enforce_quality_review_expiry() from public,anon,authenticated;
create trigger estimate_quality_expiry before insert or update on public.estimate_quality_reviews
for each row execute function public.enforce_quality_review_expiry();
create extension if not exists pg_cron;
select cron.schedule('csworks-quality-review-expiry','*/15 * * * *',
  $job$delete from public.estimate_quality_reviews where expires_at <= now()$job$);
