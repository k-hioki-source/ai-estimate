-- Test-only base schema for the existing project detail/login screens.
-- This is NOT a production schema dump and does not implement billing/AI/calendar workflows.
grant usage on schema public to authenticated,service_role;
create table public.csworks_annotation_test_environment (
  id boolean primary key default true check(id),
  project_ref text not null check(project_ref='jjiebuuasaimaqemhiua'),
  created_at timestamptz not null default now()
);
insert into public.csworks_annotation_test_environment(project_ref) values('jjiebuuasaimaqemhiua');
alter table public.csworks_annotation_test_environment enable row level security;
revoke all on public.csworks_annotation_test_environment from public,anon,authenticated,service_role;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 company_name text, department_name text, contact_name text, email text,
 phone text, postal_code text, address text,
 newsletter_enabled boolean not null default false,
 role text not null default 'customer' check(role in ('customer','admin')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.csworks_test_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and role='admin')
$$;
revoke all on function public.csworks_test_admin() from public,anon,service_role;
grant execute on function public.csworks_test_admin() to authenticated;
create function public.csworks_test_user_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,email,company_name,contact_name)
 values(new.id,new.email,'CS Works テスト企業','テスト担当者');
 return new;
end $$;
revoke all on function public.csworks_test_user_profile() from public,anon,authenticated,service_role;
create trigger csworks_test_user_profile after insert on auth.users for each row execute function public.csworks_test_user_profile();
alter table public.profiles enable row level security;
revoke all on public.profiles from public,anon,authenticated,service_role;
grant select on public.profiles to authenticated,service_role;
grant update(company_name,department_name,contact_name,phone,postal_code,address,newsletter_enabled) on public.profiles to authenticated;
create policy csworks_test_profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.csworks_test_admin());
create policy csworks_test_profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

create table public.estimates (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 estimate_code text not null,production_method text,usage text,expression text,
 quantity integer not null default 1, estimated_hours numeric,estimated_amount integer,
 complexity_score integer,image_path text,confidence numeric,ai_comment text,customer_notes text,
 input_data jsonb not null default '{}',analysis_data jsonb not null default '{}',
 status text not null default 'estimated',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.estimates enable row level security;
revoke all on public.estimates from public,anon,authenticated,service_role;
grant select on public.estimates to authenticated,service_role;
create policy csworks_test_estimates_read on public.estimates for select to authenticated using(user_id=auth.uid() or public.csworks_test_admin());
