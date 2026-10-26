-- TEST ONLY: cs-works-test / jjiebuuasaimaqemhiua. Not Production.
-- Preserves existing accepted quotes, orders, projects, images and annotation history.
-- Does not initialize existing projects; admin explicitly prepares the selected accepted project in the UI.
-- Run the complete script once. Never remove guards to work around an error.
begin;
do $$ begin
 if to_regclass('public.csworks_annotation_test_environment') is null then raise exception 'STOP: dedicated test marker required'; end if;
 if not exists(select 1 from public.csworks_annotation_test_environment where project_ref='jjiebuuasaimaqemhiua') then raise exception 'STOP: wrong test marker'; end if;
 if (select count(*) from auth.users)<>3 or exists(select 1 from auth.users where email is null or email not in ('csworks-admin@example.com','csworks-customer@example.com','csworks-other@example.com')) then raise exception 'STOP: only the three dedicated test users are allowed'; end if;
 if exists(select 1 from public.projects where project_code not like 'TEST-%') then raise exception 'STOP: unexpected project data'; end if;
 if to_regclass('public.project_quotes') is null then raise exception 'STOP: formal quote test setup required first'; end if;
 if to_regclass('public.project_illustrations') is not null then raise exception 'STOP: workflow migration already applied; do not repeat'; end if;
end $$;

-- DRAFT: additional migration, not applied remotely. Test DB first; separate Production approval.

alter table public.projects add column illustration_workflow boolean not null default false;
create table public.project_illustrations (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete restrict,
 quote_id uuid not null,item_key uuid not null,number text not null,name text not null,position integer not null,
 state text not null default 'in_production' check(state in ('in_production','customer_review','revision','approved')),
 current_version_id uuid,created_at timestamptz not null default now(),approved_at timestamptz,
 unique(project_id,item_key),unique(id,project_id),
 foreign key(quote_id,project_id) references public.project_quotes(id,project_id) on delete restrict,
 foreign key(quote_id,item_key) references public.project_quote_items(quote_id,item_key) on delete restrict,
 check((state='approved')=(approved_at is not null))
);
alter table public.project_files add constraint project_files_id_project_unique unique(id,project_id);
create table public.project_illustration_versions (
 id uuid primary key default gen_random_uuid(),illustration_id uuid not null,project_id uuid not null,
 revision integer not null check(revision>0),file_id uuid not null unique,
 review_batch_id uuid unique references public.project_review_batches(id) on delete restrict,
 created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 unique(illustration_id,revision),unique(id,illustration_id,project_id),
 foreign key(illustration_id,project_id) references public.project_illustrations(id,project_id) on delete restrict,
 foreign key(file_id,project_id) references public.project_files(id,project_id) on delete restrict
);
alter table public.project_illustrations add constraint illustration_current_version_fk foreign key(current_version_id,id,project_id) references public.project_illustration_versions(id,illustration_id,project_id) on delete restrict;
alter table public.project_review_batches add column illustration_id uuid;
alter table public.project_review_batches add column illustration_revision integer;
alter table public.project_review_batches add column illustration_label text;
alter table public.project_review_batches add constraint review_illustration_project_fk foreign key(illustration_id,project_id) references public.project_illustrations(id,project_id) on delete restrict;
alter table public.project_review_batches add constraint review_illustration_fields check((illustration_id is null and illustration_revision is null and illustration_label is null) or (illustration_id is not null and illustration_revision is not null and illustration_revision>0 and illustration_label is not null));
drop index public.project_review_one_open;
create unique index project_review_one_open on public.project_review_batches(project_id) where state='open' and illustration_id is null;
create unique index illustration_review_one_open on public.project_review_batches(illustration_id) where state='open' and illustration_id is not null;
alter table public.project_review_batches drop constraint project_review_batches_message_id_key;
create index project_review_batches_message on public.project_review_batches(message_id);
create table public.project_illustration_operations (
 id uuid primary key,project_id uuid not null references public.projects(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,kind text not null check(kind in ('start','submit')),
 payload jsonb not null,message_id uuid not null unique references public.project_messages(id) on delete restrict,
 notification_type text not null check(notification_type in ('review_requested','revision_requested','approved','customer_message')),
 created_at timestamptz not null default now()
);
alter table public.project_illustrations enable row level security;
alter table public.project_illustration_versions enable row level security;
alter table public.project_illustration_operations enable row level security;
revoke all on public.project_illustrations,public.project_illustration_versions,public.project_illustration_operations from public,anon,authenticated,service_role;
grant select on public.project_illustrations,public.project_illustration_versions,public.project_illustration_operations to authenticated;
create policy illustrations_read on public.project_illustrations for select to authenticated using(public.csworks_can_read_review(project_id));
create policy illustration_versions_read on public.project_illustration_versions for select to authenticated using(public.csworks_can_read_review(project_id));
create policy illustration_operations_read on public.project_illustration_operations for select to authenticated using(public.csworks_can_read_review(project_id));

create function public.csworks_materialize_illustrations(p_project_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; q public.project_quotes%rowtype;
begin
 select * into p from public.projects where id=p_project_id for update;
 if p.illustration_workflow then return; end if;
 select * into q from public.project_quotes where id=p.formal_quote_id and project_id=p.id and state='accepted';
 if not found or p.status not in ('ordered','in_production') or not exists(select 1 from public.project_orders where project_id=p.id and formal_quote_id=q.id) or exists(select 1 from public.project_review_batches where project_id=p.id) then raise exception 'Cannot initialize workflow' using errcode='40001'; end if;
 insert into public.project_illustrations(project_id,quote_id,item_key,number,name,position)
 select p.id,q.id,item_key,number,name,position from public.project_quote_items where quote_id=q.id;
 if not found then raise exception 'No accepted items' using errcode='40001'; end if;
 update public.projects set illustration_workflow=true where id=p.id;
end $$;
create function public.csworks_prepare_illustrations(p_project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 perform public.csworks_materialize_illustrations(p_project_id);
 return (select to_jsonb(p) from public.projects p where p.id=p_project_id);
end $$;
create function public.csworks_illustration_state(p_project_id uuid) returns text language sql stable security definer set search_path='' as $$
 select case when count(*)=0 then null when bool_and(state='approved') then 'approved' when bool_or(state='customer_review') then 'customer_review' when bool_or(state='revision') then 'revision' else 'in_production' end from public.project_illustrations where project_id=p_project_id
$$;
create function public.csworks_guard_illustration_project() returns trigger language plpgsql security definer set search_path='' as $$
declare derived text;
begin
 if not old.illustration_workflow and not new.illustration_workflow then return new; end if;
 if not new.illustration_workflow then raise exception 'Cannot disable workflow' using errcode='42501'; end if;
 derived:=public.csworks_illustration_state(new.id);
 if derived is null then raise exception 'Missing illustrations' using errcode='40001'; end if;
 if new.status='ordered' and old.status='ordered' and derived='in_production' then return new; end if;
 if new.status in ('delivered','invoice_requested','invoiced','completed') and derived='approved' then return new; end if;
 if new.status is distinct from derived then raise exception 'Use illustration review operations' using errcode='42501'; end if;
 return new;
end $$;
create trigger csworks_guard_illustration_project before update on public.projects for each row execute function public.csworks_guard_illustration_project();
create function public.csworks_guard_illustration_batch() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.projects where id=new.project_id and illustration_workflow) then
  if new.illustration_id is null or not exists(select 1 from public.project_illustrations i join public.project_illustration_versions v on v.id=i.current_version_id where i.id=new.illustration_id and i.project_id=new.project_id and v.revision=new.illustration_revision) then raise exception 'Use illustration review operations' using errcode='42501'; end if;
 elsif new.illustration_id is not null then raise exception 'Not an illustration project' using errcode='42501'; end if;
 return new;
end $$;
create trigger csworks_guard_illustration_batch before insert on public.project_review_batches for each row execute function public.csworks_guard_illustration_batch();

create function public.csworks_get_illustrations(p_project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.csworks_can_read_review(p_project_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 return jsonb_build_object('project',(select to_jsonb(p) from public.projects p where p.id=p_project_id),'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('versions',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('file',to_jsonb(f),'review',to_jsonb(b)) order by v.revision desc) from public.project_illustration_versions v join public.project_files f on f.id=v.file_id left join public.project_review_batches b on b.id=v.review_batch_id where v.illustration_id=i.id),'[]'::jsonb)) order by i.position) from public.project_illustrations i where i.project_id=p_project_id),'[]'::jsonb));
end $$;
create function public.csworks_begin_illustrations(p_project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found or not p.illustration_workflow or p.status<>'ordered' then raise exception 'State changed' using errcode='40001'; end if;
 update public.projects set status='in_production' where id=p_project_id returning * into p; return to_jsonb(p);
end $$;

create function public.csworks_attach_illustration_file(p_project_id uuid,p_illustration_id uuid,p_request_id uuid,p_name text,p_path text,p_mime text,p_size bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; i public.project_illustrations%rowtype; v public.project_illustration_versions%rowtype; f public.project_files%rowtype; rev integer; ext text;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found or not p.illustration_workflow or p.status not in ('in_production','revision','customer_review') then raise exception 'State changed' using errcode='40001'; end if;
 select * into i from public.project_illustrations where id=p_illustration_id and project_id=p_project_id for update;
 if not found then raise exception 'Wrong illustration' using errcode='42501'; end if;
 select * into v from public.project_illustration_versions where file_id=p_request_id;
 if found then
  select * into f from public.project_files where id=v.file_id;
  if v.illustration_id<>i.id or f.file_name is distinct from p_name or f.storage_path is distinct from p_path or f.mime_type is distinct from p_mime or f.file_size is distinct from p_size then raise exception 'Request changed' using errcode='40001'; end if;
  return to_jsonb(v);
 end if;
 if i.state not in ('in_production','revision') then raise exception 'Illustration is read only' using errcode='40001'; end if;
 ext:=case p_mime when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'application/pdf' then 'pdf' else null end;
 if p_request_id is null or ext is null or p_size is null or p_size not between 1 and 52428800 or p_name is null or length(p_name) not between 1 and 255 or p_path is distinct from p.id::text||'/illustrations/'||i.id::text||'/'||p_request_id::text||'.'||ext then raise exception 'Invalid file' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id='project-files' and name=p_path) then raise exception 'Uploaded object not found' using errcode='22023'; end if;
 select coalesce(max(revision),0)+1 into rev from public.project_illustration_versions where illustration_id=i.id;
 insert into public.project_files(id,project_id,uploaded_by,file_name,storage_path,mime_type,file_size,file_type) values(p_request_id,p.id,auth.uid(),p_name,p_path,p_mime,p_size,case when rev=1 then 'review' else 'revision' end);
 insert into public.project_illustration_versions(illustration_id,project_id,revision,file_id,created_by) values(i.id,p.id,rev,p_request_id,auth.uid()) returning * into v;
 update public.project_illustrations set current_version_id=v.id where id=i.id; return to_jsonb(v);
end $$;

create function public.csworks_start_illustration_review(p_project_id uuid,p_ids uuid[],p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; i public.project_illustrations%rowtype; v public.project_illustration_versions%rowtype; op public.project_illustration_operations%rowtype; bid uuid; mid uuid; n integer; names text:='';
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found or not p.illustration_workflow then raise exception 'Wrong project' using errcode='42501'; end if;
 if p_request_id is null or coalesce(cardinality(p_ids),0) not between 1 and 200 or array_position(p_ids,null) is not null or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception 'Invalid selection' using errcode='22023'; end if;
 select * into op from public.project_illustration_operations where id=p_request_id;
 if found then
  if op.project_id<>p.id or op.actor_id<>auth.uid() or op.kind<>'start' or op.payload is distinct from to_jsonb(p_ids) then raise exception 'Request changed' using errcode='40001'; end if;
  return jsonb_build_object('project',to_jsonb(p),'operationId',op.id,'notificationType',op.notification_type,'replayed',true);
 end if;
 if p.status not in ('in_production','revision','customer_review') then raise exception 'State changed' using errcode='40001'; end if;
 if (select count(*) from public.project_illustrations where project_id=p.id and id=any(p_ids))<>cardinality(p_ids) then raise exception 'Files outside project' using errcode='42501'; end if;
 for i in select * from public.project_illustrations where project_id=p.id and id=any(p_ids) order by id for update loop
  select * into v from public.project_illustration_versions where id=i.current_version_id;
  if not found or v.review_batch_id is not null or i.state not in ('in_production','revision') then raise exception 'Upload next version first' using errcode='40001'; end if;
  select coalesce(max(round_number),0)+1 into n from public.project_review_batches where project_id=p.id;
  insert into public.project_review_batches(project_id,round_number,created_by,illustration_id,illustration_revision,illustration_label) values(p.id,n,auth.uid(),i.id,v.revision,i.number||' '||i.name) returning id into bid;
  insert into public.project_review_batch_files(batch_id,file_id) values(bid,v.file_id);
  update public.project_illustration_versions set review_batch_id=bid where id=v.id;
  update public.project_illustrations set state='customer_review' where id=i.id;
  names:=names||case when names='' then '' else E'\n' end||i.number||' '||i.name||' 第'||v.revision||'稿';
 end loop;
 insert into public.project_messages(project_id,user_id,message,message_type,sender_type) values(p.id,auth.uid(),'次のイラストをご確認ください。'||E'\n'||names,'system','admin') returning id into mid;
 insert into public.project_illustration_operations(id,project_id,actor_id,kind,payload,message_id,notification_type) values(p_request_id,p.id,auth.uid(),'start',to_jsonb(p_ids),mid,'review_requested');
 update public.projects set status=public.csworks_illustration_state(p.id) where id=p.id returning * into p;
 return jsonb_build_object('project',to_jsonb(p),'operationId',p_request_id,'notificationType','review_requested','replayed',false);
end $$;

create function public.csworks_submit_illustration_review(p_project_id uuid,p_items jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; i public.project_illustrations%rowtype; v public.project_illustration_versions%rowtype; b public.project_review_batches%rowtype; op public.project_illustration_operations%rowtype; x jsonb; ids uuid[]:='{}'; iid uuid; mid uuid; msg text:=''; action text; comment text; has_revision boolean:=false; notif text;
begin
 select * into p from public.projects where id=p_project_id for update;
 if auth.uid() is null or not found or p.user_id is distinct from auth.uid() or not p.illustration_workflow or exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Customer required' using errcode='42501'; end if;
 if p_request_id is null or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 200 or octet_length(p_items::text)>100000 then raise exception 'Invalid review' using errcode='22023'; end if;
 select * into op from public.project_illustration_operations where id=p_request_id;
 if found then
  if op.project_id<>p.id or op.actor_id<>auth.uid() or op.kind<>'submit' or op.payload is distinct from p_items then raise exception 'Request changed' using errcode='40001'; end if;
  return jsonb_build_object('project',to_jsonb(p),'operationId',op.id,'notificationType',op.notification_type,'replayed',true);
 end if;
 if p.status<>'customer_review' then raise exception 'Review closed' using errcode='40001'; end if;
 -- Lock project first; every item/batch operation serializes behind the same project row.
 for x in select value from jsonb_array_elements(p_items) loop
  begin iid:=(x->>'illustrationId')::uuid; exception when invalid_text_representation then raise exception 'Invalid item' using errcode='22023'; end;
  action:=x->>'action'; comment:=x->>'comment';
  if iid is null or iid=any(ids) or action is null or action not in ('approval','revision_request') or jsonb_typeof(x->'comment') is distinct from 'string' or length(comment)>2000 or (action='revision_request' and length(btrim(comment))=0) then raise exception 'Invalid review fields' using errcode='22023'; end if;
  ids:=array_append(ids,iid);
  select * into i from public.project_illustrations where id=iid and project_id=p.id for update;
  if not found then raise exception 'Wrong illustration' using errcode='42501'; end if;
  select * into v from public.project_illustration_versions where id=i.current_version_id;
  select * into b from public.project_review_batches where id=v.review_batch_id for update;
  if not found or b.id::text is distinct from x->>'batchId' or b.state<>'open' or i.state<>'customer_review' then raise exception 'Review changed' using errcode='40001'; end if;
  if action='approval' and exists(select 1 from public.project_file_annotations where batch_id=b.id and (jsonb_array_length(document->'pins')>0 or jsonb_array_length(document->'strokes')>0)) then raise exception 'Clear annotation drafts before approval' using errcode='22023'; end if;
  if action='revision_request' then has_revision:=true; end if;
  update public.project_file_annotations set finalized_at=now() where batch_id=b.id;
  update public.project_review_batches set state=action,finalized_at=now() where id=b.id;
  update public.project_illustrations set state=case when action='approval' then 'approved' else 'revision' end,approved_at=case when action='approval' then now() else null end where id=i.id;
  msg:=msg||case when msg='' then '' else E'\n\n' end||i.number||' '||i.name||' 第'||v.revision||'稿：'||case when action='approval' then '承認' else '修正依頼' end||case when btrim(comment)='' then '' else E'\n'||btrim(comment) end;
 end loop;
 if length(msg)>10000 then raise exception 'Review text too large' using errcode='22023'; end if;
 insert into public.project_messages(project_id,user_id,message,message_type,sender_type) values(p.id,auth.uid(),msg,case when has_revision then 'revision_request' else 'approval' end,'customer') returning id into mid;
 update public.project_review_batches set message_id=mid where illustration_id=any(ids) and project_id=p.id and id in (select review_batch_id from public.project_illustration_versions where id in (select current_version_id from public.project_illustrations where id=any(ids)));
 update public.projects set status=public.csworks_illustration_state(p.id) where id=p.id returning * into p;
 notif:=case when has_revision then 'revision_requested' when p.status='approved' then 'approved' else 'customer_message' end;
 insert into public.project_illustration_operations(id,project_id,actor_id,kind,payload,message_id,notification_type) values(p_request_id,p.id,auth.uid(),'submit',p_items,mid,notif);
 return jsonb_build_object('project',to_jsonb(p),'operationId',p_request_id,'notificationType',notif,'replayed',false);
end $$;

-- RPC exports: no direct table writes, no anonymous or service-key calls.
revoke all on function public.csworks_materialize_illustrations(uuid),public.csworks_illustration_state(uuid),public.csworks_guard_illustration_project(),public.csworks_guard_illustration_batch() from public,anon,authenticated,service_role;
revoke all on function public.csworks_prepare_illustrations(uuid),public.csworks_get_illustrations(uuid),public.csworks_begin_illustrations(uuid),public.csworks_attach_illustration_file(uuid,uuid,uuid,text,text,text,bigint),public.csworks_start_illustration_review(uuid,uuid[],uuid),public.csworks_submit_illustration_review(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.csworks_prepare_illustrations(uuid),public.csworks_get_illustrations(uuid),public.csworks_begin_illustrations(uuid),public.csworks_attach_illustration_file(uuid,uuid,uuid,text,text,text,bigint),public.csworks_start_illustration_review(uuid,uuid[],uuid),public.csworks_submit_illustration_review(uuid,jsonb,uuid) to authenticated;
-- Existing function replacements are appended by the build script before COMMIT.

create or replace function public.csworks_track_review_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare bid uuid;
begin
 if new.illustration_workflow then return new; end if;
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

create or replace function public.csworks_order_quote(p_project_id uuid,p_quote_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; q public.project_quotes%rowtype;
begin
 select * into p from public.projects where id=p_project_id for update;
 if auth.uid() is null or not found or p.user_id is distinct from auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Customer required' using errcode='42501'; end if;
 select * into q from public.project_quotes where id=p_quote_id and project_id=p_project_id for update;
 if not found or p_request_id is null then raise exception 'Invalid quote' using errcode='22023'; end if;
 if q.state='accepted' and q.accepted_request_id=p_request_id and p.formal_quote_id=q.id and exists(select 1 from public.project_orders where project_id=p_project_id and formal_quote_id=q.id) then return jsonb_build_object('project',to_jsonb(p),'replayed',true); end if;
 if p.formal_quote_id is distinct from q.id or p.status<>'quote_presented' or q.state<>'presented' then raise exception 'Quote changed' using errcode='40001'; end if;
 update public.project_quotes set state='accepted',accepted_at=now(),accepted_request_id=p_request_id where id=q.id;
 -- Unchanged existing function owns ORD numbering, profile snapshot, 10% floor tax, and project ordering.
 perform public.order_project(p_project_id);
 select * into p from public.projects where id=p_project_id;
 if p.status<>'ordered' or not exists(select 1 from public.project_orders where project_id=p_project_id and formal_quote_id=q.id) then raise exception 'Unexpected order result' using errcode='40001'; end if;
 perform public.csworks_materialize_illustrations(p_project_id);
 select * into p from public.projects where id=p_project_id;
 return jsonb_build_object('project',to_jsonb(p),'replayed',false);
end $$;


commit;
select 'ILLUSTRATION_WORKFLOW_TEST_READY' as result;
