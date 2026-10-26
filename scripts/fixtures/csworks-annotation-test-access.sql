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
