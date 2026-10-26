-- DRAFT: DO NOT APPLY to Production without explicit DB approval and preflight review.
-- Additive schema. Calls existing approval/revision RPCs; never replaces their bodies.
begin;
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
