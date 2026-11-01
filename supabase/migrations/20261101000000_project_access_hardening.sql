-- H-01/H-03/H-04. Isolated test DB first; production requires separate approval.
begin;
-- Invoker trigger distinguishes direct REST writes from narrowly authorized definer RPCs.
create function public.csworks_guard_direct_project() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') then
  if tg_op='INSERT' then
   if auth.uid() is null or new.user_id is distinct from auth.uid() or new.status<>'quote_requested' or
    new.quoted_amount is not null or new.quoted_hours is not null or new.confirmed_deadline is not null or new.quote_presented_at is not null or new.ordered_at is not null or new.formal_quote_id is not null or new.completed_at is not null or new.archived_at is not null or coalesce(to_jsonb(new)->>'illustration_workflow','false')<>'false' then raise exception 'Use authorized project creation' using errcode='42501'; end if;
   if new.estimate_id is not null and not exists(select 1 from public.estimates e where e.id=new.estimate_id and e.user_id=auth.uid()) then raise exception 'Wrong estimate owner' using errcode='42501'; end if;
  elsif new.user_id is distinct from old.user_id or new.id is distinct from old.id or new.project_code is distinct from old.project_code or new.estimate_id is distinct from old.estimate_id then raise exception 'Frozen project identity' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger csworks_guard_direct_project before insert or update on public.projects for each row execute function public.csworks_guard_direct_project();

-- Legacy quotes need an admin-authored, immutable terms record. No unverified backfill.
create table public.project_legacy_quote_authorizations(project_id uuid primary key references public.projects(id),terms jsonb not null,approved_by uuid not null references auth.users(id),approved_at timestamptz not null default now());
alter table public.project_legacy_quote_authorizations enable row level security;
revoke all on public.project_legacy_quote_authorizations from public,anon,authenticated,service_role;
create function public.csworks_record_legacy_quote() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if public.is_admin() and new.formal_quote_id is null and new.status='quote_presented' and new.quoted_amount is not null and new.confirmed_deadline is not null then
  insert into public.project_legacy_quote_authorizations(project_id,terms,approved_by)
  values(new.id,jsonb_build_object('owner',new.user_id,'title',new.title,'description',new.description,'amount',new.quoted_amount,'hours',new.quoted_hours,'deadline',new.confirmed_deadline),auth.uid())
  on conflict(project_id) do update set terms=excluded.terms,approved_by=excluded.approved_by,approved_at=now();
 end if;
 return new;
end $$;
create trigger csworks_record_legacy_quote after update of quoted_amount,quoted_hours,confirmed_deadline,quote_presented_at,status on public.projects for each row execute function public.csworks_record_legacy_quote();
alter function public.order_project(uuid) rename to csworks_order_project_internal;
revoke all on function public.csworks_order_project_internal(uuid) from public,anon,authenticated,service_role;
create function public.order_project(p_project_id uuid) returns public.projects language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype;
begin
 select * into p from public.projects where id=p_project_id for update;
 if auth.uid() is null or not found or p.user_id is distinct from auth.uid() then raise exception 'Not authorized' using errcode='42501'; end if;
 if p.formal_quote_id is null and not exists(select 1 from public.project_legacy_quote_authorizations a where a.project_id=p.id and a.terms=jsonb_build_object('owner',p.user_id,'title',p.title,'description',p.description,'amount',p.quoted_amount,'hours',p.quoted_hours,'deadline',p.confirmed_deadline)) then raise exception 'Admin must re-confirm legacy quote' using errcode='42501'; end if;
 return public.csworks_order_project_internal(p_project_id);
end $$;
revoke all on function public.order_project(uuid) from public,anon,authenticated,service_role;
grant execute on function public.order_project(uuid) to authenticated;

-- H-03: no client UPDATE to message records. Read markers have a dedicated RPC.
revoke update on public.project_messages from authenticated;
create function public.csworks_guard_message_update() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') then raise exception 'Use read marker RPC' using errcode='42501'; end if;
 return new;
end $$;
create trigger csworks_guard_message_update before update on public.project_messages for each row execute function public.csworks_guard_message_update();
revoke all on function public.csworks_guard_message_update() from public,anon,authenticated,service_role;
create function public.csworks_guard_message_sender() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') then
  if auth.uid() is null or new.user_id is distinct from auth.uid() or new.message_type<>'message' then raise exception 'Use review RPC' using errcode='42501'; end if;
  new.sender_type:=case when public.is_admin() then 'admin' else 'customer' end;
  new.read_by_admin_at:=null; new.read_by_customer_at:=null; new.created_at:=now();
 end if;
 return new;
end $$;
create trigger csworks_guard_message_sender before insert on public.project_messages for each row execute function public.csworks_guard_message_sender();
create function public.csworks_mark_messages_read(p_project_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or cardinality(p_project_ids)>100 then raise exception 'Not authorized' using errcode='42501'; end if;
 if public.is_admin() then
  update public.project_messages set read_by_admin_at=now() where project_id=any(p_project_ids) and message_type='message' and sender_type='customer' and read_by_admin_at is null;
 else
  update public.project_messages m set read_by_customer_at=now() where project_id=any(p_project_ids) and message_type='message' and sender_type='admin' and read_by_customer_at is null and exists(select 1 from public.projects p where p.id=m.project_id and p.user_id=auth.uid());
 end if;
end $$;
create function public.csworks_submit_legacy_review(p_project_id uuid,p_action text,p_comment text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; m public.project_messages%rowtype;
begin
 select * into p from public.projects where id=p_project_id for update;
 if auth.uid() is null or not found or p.user_id is distinct from auth.uid() or public.is_admin() or p.status<>'customer_review' then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_action not in ('approval','revision_request') or p_action is null or length(coalesce(p_comment,''))>10000 or (p_action='revision_request' and length(btrim(coalesce(p_comment,'')))=0) then raise exception 'Invalid review' using errcode='22023'; end if;
 -- Do not bypass newer review-batch or illustration workflows.
 if exists(select 1 from public.project_review_batches where project_id=p.id) or coalesce(to_jsonb(p)->>'illustration_workflow','false')='true' then raise exception 'Use current review workflow' using errcode='42501'; end if;
 if p_action='approval' then p:=public.approve_project(p.id); else p:=public.request_project_revision(p.id); end if;
 insert into public.project_messages(project_id,user_id,message,message_type,sender_type) values(p.id,auth.uid(),coalesce(nullif(btrim(p_comment),''),'確認内容を承認しました。'),p_action,'customer') returning * into m;
 return jsonb_build_object('project',to_jsonb(p),'message',to_jsonb(m));
end $$;

-- H-01: a file row cannot point outside its own project, including admin-written rows.
create function public.csworks_guard_file_path() returns trigger language plpgsql set search_path='' as $$
begin
 if split_part(new.storage_path,'/',1) is distinct from new.project_id::text or new.storage_path ~ '(^|/)\.\.?(/|$)|\\|//' or position('/' in new.storage_path)=0 or right(new.storage_path,1)='/' then raise exception 'Invalid project storage path' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.project_id is distinct from old.project_id or new.storage_path is distinct from old.storage_path or new.uploaded_by is distinct from old.uploaded_by) then raise exception 'Frozen file identity' using errcode='42501'; end if;
 return new;
end $$;
create trigger csworks_guard_file_path before insert or update on public.project_files for each row execute function public.csworks_guard_file_path();
drop policy if exists "Users can delete own project reference files" on public.project_files;
create policy "Users can delete own project reference files" on public.project_files for delete to authenticated using(uploaded_by=auth.uid() and file_type='reference' and split_part(storage_path,'/',1)=project_id::text and exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid() and p.status in ('ordered','in_production','customer_review','revision')));
-- Existing installation must include storage.objects; test harness supplies the real policy fixture.
drop policy if exists "Users can delete own project reference storage files" on storage.objects;
create policy "Users can delete own project reference storage files" on storage.objects for delete to authenticated using(bucket_id='project-files' and exists(select 1 from public.project_files f join public.projects p on p.id=f.project_id where f.storage_path=name and split_part(name,'/',1)=p.id::text and f.uploaded_by=auth.uid() and f.file_type='reference' and p.user_id=auth.uid() and p.status in ('ordered','in_production','customer_review','revision')));
revoke all on function public.csworks_guard_direct_project(),public.csworks_record_legacy_quote(),public.csworks_guard_message_sender(),public.csworks_mark_messages_read(uuid[]),public.csworks_submit_legacy_review(uuid,text,text),public.csworks_guard_file_path() from public,anon,authenticated,service_role;
grant execute on function public.csworks_mark_messages_read(uuid[]),public.csworks_submit_legacy_review(uuid,text,text) to authenticated;
commit;
