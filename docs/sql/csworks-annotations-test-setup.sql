-- CS Works IMAGE ANNOTATIONS TEST SETUP ONLY (2026-10-26)
-- Dashboard must show cs-works-test / jjiebuuasaimaqemhiua.
-- Target URL: https://jjiebuuasaimaqemhiua.supabase.co
-- This script cannot infer the dashboard project from SQL. Verify the dashboard before Run.
-- Empty-public-schema / empty-auth guards reject the populated production project and repeat runs.
-- No customer data is copied. Test accounts and projects are created separately after this script.
begin;
do $$ begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')) or
    exists(select 1 from auth.users) or exists(select 1 from storage.buckets) then
  raise exception 'STOP: dedicated EMPTY test project required. Do not run against cs-works or repeat this setup.';
 end if;
end $$;

-- Source: scripts/fixtures/csworks-annotation-test-base.sql
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


-- Source: scripts/fixtures/csworks-existing-review-schema.sql
-- Local test fixture from user-supplied column/trigger metadata (2026-10-26).

-- No customer rows. Not a migration; does not claim to reproduce unexported constraints/RLS.

create table public.projects (
  "id" uuid not null default gen_random_uuid() primary key,
  "project_code" text not null,
  "user_id" uuid not null,
  "estimate_id" uuid,
  "title" text not null,
  "description" text,
  "status" text not null default 'quote_requested'::text,
  "quoted_amount" int4,
  "quoted_hours" numeric,
  "desired_deadline" date,
  "confirmed_deadline" date,
  "ordered_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "archived_at" timestamptz,
  "quote_presented_at" timestamptz
);

create table public.project_files (
  "id" uuid not null default gen_random_uuid() primary key,
  "project_id" uuid not null,
  "uploaded_by" uuid not null,
  "file_name" text not null,
  "storage_path" text not null,
  "mime_type" text,
  "file_size" int8,
  "file_type" text not null default 'reference'::text,
  "created_at" timestamptz not null default now()
);

create table public.project_messages (
  "id" uuid not null default gen_random_uuid() primary key,
  "project_id" uuid not null,
  "user_id" uuid not null,
  "message" text not null,
  "message_type" text not null default 'message'::text,
  "created_at" timestamptz not null default now(),
  "read_by_admin_at" timestamptz,
  "sender_type" text not null default 'system'::text,
  "read_by_customer_at" timestamptz
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- Source: scripts/fixtures/csworks-existing-review-functions.sql
-- Test fixture only: existing RPC definitions supplied by the user on 2026-10-26.
-- Used only in a synthetic local database. Never apply as a production migration.

CREATE OR REPLACE FUNCTION public.approve_project(p_project_id uuid)
 RETURNS projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects;
begin
  select * into v_project
  from public.projects
  where id = p_project_id
    and user_id = auth.uid()
  for update;

  if v_project.id is null then
    raise exception 'Project not found';
  end if;

  if v_project.status <> 'customer_review' then
    raise exception 'Only projects under customer review can be approved';
  end if;

  update public.projects
  set status = 'approved'
  where id = v_project.id
  returning * into v_project;

  return v_project;
end;
$function$;

CREATE OR REPLACE FUNCTION public.request_project_revision(p_project_id uuid)
 RETURNS projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects;
begin
  update public.projects
  set
    status = 'revision',
    updated_at = now()
  where id = p_project_id
    and user_id = auth.uid()
    and status = 'customer_review'
  returning * into v_project;

  if v_project.id is null then
    raise exception 'Project cannot be moved to revision';
  end if;

  return v_project;
end;
$function$;


-- Source: scripts/fixtures/csworks-annotation-test-access.sql
-- Test-only policies: explicit grants because automatic exposure was disabled at project creation.
alter table public.projects add foreign key(user_id) references auth.users(id);
alter table public.project_files add foreign key(project_id) references public.projects(id);
alter table public.project_files add foreign key(uploaded_by) references auth.users(id);
alter table public.project_files add unique(storage_path);
alter table public.project_messages add foreign key(project_id) references public.projects(id);
alter table public.project_messages add foreign key(user_id) references auth.users(id);
alter table public.projects enable row level security;
alter table public.project_files enable row level security;
alter table public.project_messages enable row level security;
revoke all on public.projects,public.project_files,public.project_messages from public,anon,authenticated,service_role;
grant select on public.projects,public.project_files,public.project_messages to authenticated,service_role;
grant update on public.projects to authenticated;
grant insert,delete on public.project_files to authenticated;
grant insert on public.project_messages to authenticated;
grant update(read_by_admin_at,read_by_customer_at) on public.project_messages to authenticated;
create policy csworks_test_projects_read on public.projects for select to authenticated using(user_id=auth.uid() or public.csworks_test_admin());
create policy csworks_test_projects_admin_update on public.projects for update to authenticated using(public.csworks_test_admin()) with check(public.csworks_test_admin());
create policy csworks_test_files_read on public.project_files for select to authenticated using(exists(select 1 from public.projects where id=project_id and (user_id=auth.uid() or public.csworks_test_admin())));
create policy csworks_test_files_insert on public.project_files for insert to authenticated with check(uploaded_by=auth.uid() and exists(select 1 from public.projects p where p.id=project_id and (public.csworks_test_admin() or (p.user_id=auth.uid() and file_type='reference'))));
create policy csworks_test_files_delete on public.project_files for delete to authenticated using(public.csworks_test_admin() or (file_type='reference' and uploaded_by=auth.uid() and exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid())));
create policy csworks_test_messages_read on public.project_messages for select to authenticated using(exists(select 1 from public.projects where id=project_id and (user_id=auth.uid() or public.csworks_test_admin())));
create policy csworks_test_messages_insert on public.project_messages for insert to authenticated with check(user_id=auth.uid() and message_type='message' and ((public.csworks_test_admin() and sender_type='admin') or (not public.csworks_test_admin() and sender_type='customer')) and exists(select 1 from public.projects where id=project_id and (user_id=auth.uid() or public.csworks_test_admin())));
create policy csworks_test_messages_read_mark on public.project_messages for update to authenticated using(exists(select 1 from public.projects where id=project_id and (user_id=auth.uid() or public.csworks_test_admin()))) with check(exists(select 1 from public.projects where id=project_id and (user_id=auth.uid() or public.csworks_test_admin())));
create function public.csworks_test_read_mark() returns trigger language plpgsql set search_path='' as $$
begin
 if public.csworks_test_admin() then
  if new.read_by_customer_at is distinct from old.read_by_customer_at then raise exception 'Customer read mark cannot be changed' using errcode='42501'; end if;
 else
  if new.read_by_admin_at is distinct from old.read_by_admin_at then raise exception 'Admin read mark cannot be changed' using errcode='42501'; end if;
 end if;
 return new;
end $$;
revoke all on function public.csworks_test_read_mark() from public,anon,authenticated,service_role;
create trigger csworks_test_read_mark before update on public.project_messages for each row execute function public.csworks_test_read_mark();

-- Empty read-only supporting tables keep existing dashboard/detail queries working.
create table public.project_orders(id uuid primary key default gen_random_uuid(),project_id uuid references public.projects(id),order_code text);
create table public.project_deliveries(id uuid primary key default gen_random_uuid(),project_id uuid references public.projects(id),delivery_code text);
create table public.project_invoices(id uuid primary key default gen_random_uuid(),project_id uuid references public.projects(id),invoice_code text,invoice_date date,payment_due_date date,total_amount integer);
do $$ declare t text; begin
 foreach t in array array['project_orders','project_deliveries','project_invoices'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated,service_role',t);
  execute format('create policy csworks_test_documents_read on public.%I for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id and (p.user_id=auth.uid() or public.csworks_test_admin())))',t);
 end loop;
end $$;
create table public.support_threads(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),subject text);
create table public.support_messages(id uuid primary key default gen_random_uuid(),thread_id uuid references public.support_threads(id),sender_type text,created_at timestamptz default now(),read_by_customer_at timestamptz,read_by_admin_at timestamptz);
create table public.consultation_bookings(id uuid primary key default gen_random_uuid(),customer_id uuid references auth.users(id),project_id uuid references public.projects(id),title text,notes text,starts_at timestamptz,ends_at timestamptz,status text,google_meet_url text,created_at timestamptz default now());
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
alter table public.consultation_bookings enable row level security;
revoke all on public.support_threads,public.support_messages,public.consultation_bookings from public,anon,authenticated,service_role;
grant select on public.support_threads,public.support_messages,public.consultation_bookings to authenticated,service_role;
create policy csworks_test_threads_read on public.support_threads for select to authenticated using(user_id=auth.uid() or public.csworks_test_admin());
create policy csworks_test_support_read on public.support_messages for select to authenticated using(public.csworks_test_admin() or exists(select 1 from public.support_threads t where t.id=thread_id and t.user_id=auth.uid()));
create policy csworks_test_consultations_read on public.consultation_bookings for select to authenticated using(customer_id=auth.uid() or public.csworks_test_admin());

create table public.project_file_shares (
 id uuid primary key default gen_random_uuid(),file_id uuid not null references public.project_files(id),
 project_id uuid not null references public.projects(id),created_by uuid not null references auth.users(id),
 token_hash text not null unique,created_at timestamptz not null default now(),expires_at timestamptz not null,
 revoked_at timestamptz,check(expires_at>created_at)
);
alter table public.project_file_shares enable row level security;
revoke all on public.project_file_shares from public,anon,authenticated,service_role;
grant select,insert,update on public.project_file_shares to service_role;

-- Existing workflow function bodies are the supplied definitions; restrict invocation explicitly.
revoke all on function public.request_project_revision(uuid),public.approve_project(uuid) from public,anon,service_role;
grant execute on function public.request_project_revision(uuid),public.approve_project(uuid) to authenticated;

-- Private bucket. These policies affect only project-files within this dedicated test project.
insert into storage.buckets(id,name,public) values('project-files','project-files',false);
create policy csworks_test_storage_read on storage.objects for select to authenticated using(bucket_id='project-files' and exists(select 1 from public.projects p where p.id::text=split_part(name,'/',1) and (p.user_id=auth.uid() or public.csworks_test_admin())));
create policy csworks_test_storage_insert on storage.objects for insert to authenticated with check(bucket_id='project-files' and exists(select 1 from public.projects p where p.id::text=split_part(name,'/',1) and (p.user_id=auth.uid() or public.csworks_test_admin())));
create policy csworks_test_storage_delete on storage.objects for delete to authenticated using(bucket_id='project-files' and (public.csworks_test_admin() or exists(select 1 from public.project_files f join public.projects p on p.id=f.project_id where f.storage_path=name and f.file_type='reference' and f.uploaded_by=auth.uid() and p.user_id=auth.uid())));

-- Source: supabase/migrations/20261026_image_annotations.sql (same body, enclosed in outer transaction)
-- DRAFT: DO NOT APPLY to Production without explicit DB approval and preflight review.
-- Additive schema. Calls existing approval/revision RPCs; never replaces their bodies.
do $$
begin
  if to_regprocedure('public.request_project_revision(uuid)') is null or to_regprocedure('public.approve_project(uuid)') is null then
    raise exception 'Review existing workflow RPC definitions before applying this migration';
  end if;
  if (select atttypid from pg_attribute where attrelid='public.project_messages'::regclass and attname='id') is distinct from 'uuid'::regtype then
    raise exception 'project_messages.id must be uuid; review schema before applying';
  end if;
  if (select atttypid from pg_attribute where attrelid='public.project_messages'::regclass and attname='sender_type') is distinct from 'text'::regtype then
    raise exception 'project_messages.sender_type must be text; review schema before applying';
  end if;
end $$;
create table public.project_review_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  round_number integer not null check (round_number > 0),
  state text not null default 'open' check (state in ('open','revision_request','approval','closed')),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  message_id uuid unique references public.project_messages(id) on delete restrict,
  request_id uuid unique,
  unique(project_id,round_number), unique(id,project_id),
  check ((state='open' and finalized_at is null) or (state<>'open' and finalized_at is not null))
);
create unique index project_review_one_open on public.project_review_batches(project_id) where state='open';
create table public.project_review_batch_files (
  batch_id uuid not null references public.project_review_batches(id) on delete restrict,
  file_id uuid not null references public.project_files(id) on delete restrict,
  primary key(batch_id,file_id)
);
create index project_review_batch_files_file on public.project_review_batch_files(file_id);
create table public.project_file_annotations (
  batch_id uuid not null,
  file_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  document jsonb not null,
  version integer not null check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  primary key(batch_id,file_id),
  foreign key(batch_id,file_id) references public.project_review_batch_files(batch_id,file_id) on delete restrict
);

-- Every callable definer function pins search_path and verifies auth.uid().
create function public.csworks_can_read_review(p_project_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.projects p where p.id=p_project_id and
   (p.user_id=auth.uid() or exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.role='admin')))
$$;
revoke all on function public.csworks_can_read_review(uuid) from public,anon;
grant execute on function public.csworks_can_read_review(uuid) to authenticated;

alter table public.project_review_batches enable row level security;
alter table public.project_review_batch_files enable row level security;
alter table public.project_file_annotations enable row level security;
revoke all on public.project_review_batches,public.project_review_batch_files,public.project_file_annotations from public,anon,authenticated,service_role;
grant select on public.project_review_batches,public.project_review_batch_files,public.project_file_annotations to authenticated;
create policy review_batches_read on public.project_review_batches for select to authenticated
 using(public.csworks_can_read_review(project_id));
create policy review_files_read on public.project_review_batch_files for select to authenticated
 using(exists(select 1 from public.project_review_batches b where b.id=batch_id and public.csworks_can_read_review(b.project_id)));
create policy annotations_read on public.project_file_annotations for select to authenticated
 using(exists(select 1 from public.project_review_batches b where b.id=batch_id and public.csworks_can_read_review(b.project_id)));

-- Database-side validation also protects direct RPC callers bypassing the API.
create function public.csworks_valid_annotation_document(d jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; pt jsonb; ids text[] := '{}'; nums integer[] := '{}'; total integer:=0; n integer;
begin
 if d is null or jsonb_typeof(d)<>'object' or d->'schemaVersion' is distinct from '1'::jsonb or
    jsonb_typeof(d->'pins') is distinct from 'array' or jsonb_typeof(d->'strokes') is distinct from 'array' or
    octet_length(d::text)>2000000 then return false; end if;
 if jsonb_array_length(d->'pins')>100 or jsonb_array_length(d->'strokes')>200 then return false; end if;
 for item in select value from jsonb_array_elements(d->'pins') loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'id') is distinct from 'string' or
     not (item->>'id' ~ '^[a-zA-Z0-9-]{1,64}$') or item->>'id'=any(ids) then return false; end if;
  ids:=array_append(ids,item->>'id');
  if jsonb_typeof(item->'number') is distinct from 'number' or (item->>'number')::numeric<>trunc((item->>'number')::numeric) then return false; end if;
  n:=(item->>'number')::integer;
  if n<1 or n>10000 or n=any(nums) or jsonb_typeof(item->'comment') is distinct from 'string' or
     length(btrim(item->>'comment'))=0 or length(item->>'comment')>2000 then return false; end if;
  nums:=array_append(nums,n);
  if jsonb_typeof(item->'x') is distinct from 'number' or jsonb_typeof(item->'y') is distinct from 'number' or
     (item->>'x')::numeric not between 0 and 1 or (item->>'y')::numeric not between 0 and 1 then return false; end if;
 end loop;
 for item in select value from jsonb_array_elements(d->'strokes') loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'id') is distinct from 'string' or
     not (item->>'id' ~ '^[a-zA-Z0-9-]{1,64}$') or item->>'id'=any(ids) or jsonb_typeof(item->'points') is distinct from 'array' then return false; end if;
  ids:=array_append(ids,item->>'id');
  n:=jsonb_array_length(item->'points'); total:=total+n;
  if n<2 or n>2000 or total>20000 then return false; end if;
  for pt in select value from jsonb_array_elements(item->'points') loop
   if jsonb_typeof(pt->'x') is distinct from 'number' or jsonb_typeof(pt->'y') is distinct from 'number' or
      (pt->>'x')::numeric not between 0 and 1 or (pt->>'y')::numeric not between 0 and 1 then return false; end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function public.csworks_valid_annotation_document(jsonb) from public,anon,authenticated;
alter table public.project_file_annotations add constraint annotations_valid_document check(public.csworks_valid_annotation_document(document));

-- Row lock ordering is always projects -> batch -> annotation, including status changes.
-- Legacy status changes are tracked too; they cannot silently reopen an old annotation.
create function public.csworks_track_review_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare bid uuid;
begin
 if new.status::text='customer_review' and old.status::text is distinct from 'customer_review' then
  select id into bid from public.project_review_batches where project_id=new.id and state='open';
  if bid is null then
   insert into public.project_review_batches(project_id,round_number,created_by)
   select new.id,coalesce(max(round_number),0)+1,auth.uid() from public.project_review_batches where project_id=new.id returning id into bid;
   -- Legacy callers only include previously unassigned review/revision files.
   insert into public.project_review_batch_files(batch_id,file_id)
   select bid,f.id from public.project_files f where f.project_id=new.id and f.file_type::text in ('review','revision')
    and not exists(select 1 from public.project_review_batch_files bf where bf.file_id=f.id);
  end if;
 elsif new.status::text<>'customer_review' and old.status::text='customer_review' then
  update public.project_file_annotations a set finalized_at=now() from public.project_review_batches b
   where a.batch_id=b.id and b.project_id=new.id and b.state='open';
  update public.project_review_batches set state=case when new.status::text='approved' then 'approval'
    when new.status::text='revision' then 'revision_request' else 'closed' end,finalized_at=now()
   where project_id=new.id and state='open';
 end if;
 return new;
end $$;
revoke all on function public.csworks_track_review_status() from public,anon,authenticated,service_role;
create trigger csworks_track_review_status after update of status on public.projects for each row
 when (old.status is distinct from new.status) execute function public.csworks_track_review_status();

create function public.csworks_start_review(p_project_id uuid,p_file_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; bid uuid; n integer;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found or p.status::text not in ('in_production','revision','customer_review') then raise exception 'Review state changed' using errcode='40001'; end if;
 if exists(select 1 from public.project_review_batches where project_id=p_project_id and state='open') then raise exception 'Review already open' using errcode='40001'; end if;
 if coalesce(cardinality(p_file_ids),0) not between 1 and 100 or array_position(p_file_ids,null) is not null or
   cardinality(p_file_ids)<>(select count(distinct x) from unnest(p_file_ids) x) then raise exception 'Invalid files' using errcode='22023'; end if;
 select count(*) into n from public.project_files where id=any(p_file_ids) and project_id=p_project_id and file_type::text in ('review','revision');
 if n<>cardinality(p_file_ids) then raise exception 'Files outside project' using errcode='42501'; end if;
 insert into public.project_review_batches(project_id,round_number,created_by)
 select p_project_id,coalesce(max(round_number),0)+1,auth.uid() from public.project_review_batches where project_id=p_project_id returning id into bid;
 insert into public.project_review_batch_files(batch_id,file_id) select bid,unnest(p_file_ids);
 update public.projects set status='customer_review' where id=p_project_id;
 select * into p from public.projects where id=p_project_id;
 return jsonb_build_object('batchId',bid,'project',to_jsonb(p));
end $$;

create function public.csworks_save_annotations(p_project_id uuid,p_batch_id uuid,p_file_id uuid,p_expected_version integer,p_document jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; b public.project_review_batches%rowtype; a public.project_file_annotations%rowtype; f public.project_files%rowtype;
begin
 select * into p from public.projects where id=p_project_id for update;
 if auth.uid() is null or not found or p.user_id is distinct from auth.uid() then raise exception 'Owner required' using errcode='42501'; end if;
 if exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Customer editor only' using errcode='42501'; end if;
 select * into b from public.project_review_batches where id=p_batch_id and project_id=p_project_id for update;
 if not found or b.state<>'open' or p.status::text<>'customer_review' then raise exception 'Review is read only' using errcode='40001'; end if;
 select f0.* into f from public.project_files f0 join public.project_review_batch_files bf on bf.file_id=f0.id
  where bf.batch_id=p_batch_id and bf.file_id=p_file_id and f0.project_id=p_project_id;
 if not found or f.file_type::text not in ('review','revision') or not
  (lower(coalesce(split_part(f.mime_type,';',1),'')) in ('image/png','image/jpeg') or
   (coalesce(f.mime_type,'')='' and f.file_name ~* '\.(png|jpe?g)$')) then raise exception 'Not an editable image' using errcode='42501'; end if;
 if p_expected_version is null or p_expected_version<0 or not public.csworks_valid_annotation_document(p_document) then raise exception 'Invalid document' using errcode='22023'; end if;
 select * into a from public.project_file_annotations where batch_id=p_batch_id and file_id=p_file_id for update;
 if coalesce(a.version,0)<>p_expected_version or a.finalized_at is not null then raise exception 'Version changed' using errcode='40001'; end if;
 insert into public.project_file_annotations(batch_id,file_id,created_by,document,version)
 values(p_batch_id,p_file_id,auth.uid(),p_document,p_expected_version+1)
 on conflict(batch_id,file_id) do update set document=excluded.document,version=excluded.version,updated_at=now()
 returning * into a;
 return to_jsonb(a);
end $$;

create function public.csworks_submit_review(p_project_id uuid,p_batch_id uuid,p_request_id uuid,p_action text,p_comment text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; b public.project_review_batches%rowtype; msg public.project_messages%rowtype;
begin
 select * into p from public.projects where id=p_project_id for update;
 if auth.uid() is null or not found or p.user_id is distinct from auth.uid() then raise exception 'Owner required' using errcode='42501'; end if;
 select * into b from public.project_review_batches where id=p_batch_id and project_id=p_project_id for update;
 if not found then raise exception 'No review batch' using errcode='42501'; end if;
 -- Replay after a lost response returns the same result without another message.
 if b.request_id=p_request_id and b.message_id is not null and b.state=p_action then
  select * into msg from public.project_messages where id=b.message_id;
  return jsonb_build_object('project',to_jsonb(p),'message',to_jsonb(msg),'replayed',true);
 end if;
 if p_request_id is null or p_action is null or p_action not in ('approval','revision_request') or p_comment is null or length(p_comment)>10000 or
   (p_action='revision_request' and length(btrim(p_comment))=0) then raise exception 'Invalid review' using errcode='22023'; end if;
 if p.status::text<>'customer_review' or b.state<>'open' then raise exception 'Review closed' using errcode='40001'; end if;
 if p_action='approval' and exists(select 1 from public.project_file_annotations where batch_id=p_batch_id and
  (jsonb_array_length(document->'pins')>0 or jsonb_array_length(document->'strokes')>0)) then raise exception 'Clear annotation drafts before approval' using errcode='22023'; end if;
 select * into msg from jsonb_populate_record(null::public.project_messages,jsonb_build_object(
  'project_id',p_project_id,'user_id',auth.uid(),'message',case when p_action='approval' then coalesce(nullif(btrim(p_comment),''),'確認内容を承認しました。') else btrim(p_comment) end,'message_type',p_action));
 insert into public.project_messages(project_id,user_id,message,message_type,sender_type)
 values(msg.project_id,msg.user_id,msg.message,msg.message_type,'customer') returning * into msg;
 -- Calls run in this transaction, with the original user's JWT/auth.uid().
 if p_action='revision_request' then perform public.request_project_revision(p_project_id);
 else perform public.approve_project(p_project_id); end if;
 select * into p from public.projects where id=p_project_id;
 if (p_action='revision_request' and p.status::text<>'revision') or (p_action='approval' and p.status::text<>'approved') then
  raise exception 'Unexpected workflow RPC outcome' using errcode='40001';
 end if;
 update public.project_review_batches set message_id=msg.id,request_id=p_request_id where id=p_batch_id;
 return jsonb_build_object('project',to_jsonb(p),'message',to_jsonb(msg),'replayed',false);
end $$;
revoke all on function public.csworks_start_review(uuid,uuid[]),public.csworks_save_annotations(uuid,uuid,uuid,integer,jsonb),public.csworks_submit_review(uuid,uuid,uuid,text,text) from public,anon,service_role;
grant execute on function public.csworks_start_review(uuid,uuid[]),public.csworks_save_annotations(uuid,uuid,uuid,integer,jsonb),public.csworks_submit_review(uuid,uuid,uuid,text,text) to authenticated;
comment on table public.project_file_annotations is 'Original files remain untouched; submitted review batches are immutable through application RPCs.';

commit;
select project_ref,'TEST_SETUP_READY' as result from public.csworks_annotation_test_environment;
