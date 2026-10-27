-- PRODUCTION: cs-works / tnswnyegvepundtepfqn. Reviewed metadata 2026-10-27.
-- Run the complete script once in that project's SQL Editor. Never remove a failed guard.
-- Adds formal quote items, per-illustration reviews and final-delivery mapping.
-- Preserves existing customer/project/document/file rows. No test seeds or invoice-RPC replacement.
-- Fingerprints normalize CRLF to LF; all other source content must match.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $$
declare name text; item record;
begin
 if to_regclass('public.csworks_annotation_test_environment') is not null then raise exception 'STOP: this is a marked test database; use the test setup instead'; end if;
 foreach name in array array['project_quotes','project_quote_items','project_illustrations','project_illustration_versions','project_illustration_operations','project_delivery_assets'] loop
  if to_regclass('public.'||name) is not null then raise exception 'STOP: % already exists; inspect applied migrations rather than repeat',name; end if;
 end loop;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name in ('formal_quote_id','illustration_workflow')) then raise exception 'STOP: partial installation; inspect first'; end if;
 foreach name in array array['projects','profiles','project_orders','project_deliveries','project_invoices','project_messages','project_files','project_review_batches','project_review_batch_files','project_file_annotations'] loop
  if to_regclass('public.'||name) is null then raise exception 'STOP: required table % is missing',name; end if;
 end loop;
 if to_regclass('storage.objects') is null or to_regclass('public.project_review_one_open') is null or not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.project_review_batches'::regclass and conname='project_review_batches_message_id_key' and contype='u') then raise exception 'STOP: annotation schema differs from reviewed prerequisites'; end if;
 for item in select * from jsonb_to_recordset($fingerprints$[{"signature":"public.order_project(uuid)","source_md5":"c919c39cde06a5ab2726200b056d4d0d"},{"signature":"public.deliver_project(uuid)","source_md5":"69186528ef8cde7ef7637261359d7318"},{"signature":"public.complete_project(uuid)","source_md5":"334705de0b9d11d71715c8f495246f70"},{"signature":"public.confirm_project_payment(uuid)","source_md5":"65f55c4ba9cf8c2843e6b277e49b165b"},{"signature":"public.request_project_invoice(uuid)","source_md5":"5106f97f24b589e781d5cf53ec7de2d1"},{"signature":"public.approve_project(uuid)","source_md5":"93a4eea334ece415ac729daa96d63132"},{"signature":"public.request_project_revision(uuid)","source_md5":"407411f5ed4c7422f0c67fa25e803cb2"},{"signature":"public.is_admin()","source_md5":"6bb67c176d2c5f42f2cd630cc251556b"},{"signature":"public.csworks_can_read_review(uuid)","source_md5":"75894066613527767b67831e4f93c584"},{"signature":"public.csworks_track_review_status()","source_md5":"f628415105f18108fe9680987b768a78"}]$fingerprints$::jsonb) as x(signature text,source_md5 text) loop
  if to_regprocedure(item.signature) is null then raise exception 'STOP: required function % is missing',item.signature; end if;
  if (select md5(replace(p.prosrc,E'\r\n',E'\n')) from pg_catalog.pg_proc p where p.oid=to_regprocedure(item.signature)) is distinct from item.source_md5 then raise exception 'STOP: definition of % changed; repeat metadata review',item.signature; end if;
 end loop;
 if not has_function_privilege('authenticated','public.request_project_invoice(uuid)','EXECUTE') or has_function_privilege('anon','public.request_project_invoice(uuid)','EXECUTE') then raise exception 'STOP: invoice request privileges differ from reviewed configuration'; end if;
end $$;

-- Stage 1: 20261026140000_formal_quote_items.sql
-- No existing customer rows are backfilled. Existing order/delivery/invoice functions retained.

do $$ begin
 if to_regprocedure('public.order_project(uuid)') is null or to_regclass('public.project_orders') is null or to_regclass('public.project_deliveries') is null or to_regclass('public.project_invoices') is null then raise exception 'Review existing document schema/functions first'; end if;
end $$;
create table public.project_quotes (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete restrict,
 revision integer not null check(revision>0), edit_version integer not null default 1 check(edit_version>0),
 state text not null check(state in ('draft','presented','superseded','accepted')),
 title text not null, description text, deadline date not null,
 customer jsonb not null default '{}'::jsonb check(jsonb_typeof(customer)='object'),
 subtotal integer not null check(subtotal between 0 and 1800000000), hours numeric not null check(hours between 0 and 1000000),
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
 presented_at timestamptz, accepted_at timestamptz, request_id uuid unique, accepted_request_id uuid unique,
 unique(project_id,revision), unique(id,project_id),
 check ((state='draft' and presented_at is null) or (state<>'draft' and presented_at is not null)),
 check ((state='accepted')=(accepted_at is not null))
);
create unique index project_quotes_one_draft on public.project_quotes(project_id) where state='draft';
create unique index project_quotes_one_presented on public.project_quotes(project_id) where state='presented';
create table public.project_quote_items (
 quote_id uuid not null references public.project_quotes(id) on delete restrict,
 item_key uuid not null, position integer not null check(position between 1 and 200),
 number text not null check(length(btrim(number)) between 1 and 40), name text not null check(length(btrim(name)) between 1 and 200),
 description text not null default '' check(length(description)<=2000),
 amount integer not null check(amount between 0 and 1800000000), hours numeric not null check(hours between 0 and 100000 and hours=round(hours,2)),
 primary key(quote_id,item_key), unique(quote_id,position), unique(quote_id,number)
);
alter table public.projects add column formal_quote_id uuid;
alter table public.projects add constraint projects_formal_quote_fk foreign key(formal_quote_id,id) references public.project_quotes(id,project_id) on delete restrict;
alter table public.project_orders add column formal_quote_id uuid;
alter table public.project_orders add constraint orders_formal_quote_fk foreign key(formal_quote_id,project_id) references public.project_quotes(id,project_id) on delete restrict;
alter table public.project_deliveries add column formal_quote_id uuid;
alter table public.project_deliveries add constraint deliveries_formal_quote_fk foreign key(formal_quote_id,project_id) references public.project_quotes(id,project_id) on delete restrict;
alter table public.project_invoices add column formal_quote_id uuid;
alter table public.project_invoices add constraint invoices_formal_quote_fk foreign key(formal_quote_id,project_id) references public.project_quotes(id,project_id) on delete restrict;
alter table public.project_quotes enable row level security;
alter table public.project_quote_items enable row level security;
revoke all on public.project_quotes,public.project_quote_items from public,anon,authenticated,service_role;
grant select on public.project_quotes,public.project_quote_items to authenticated;
create policy quotes_read on public.project_quotes for select to authenticated using (
 exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.role='admin') or
 (state<>'draft' and exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid()))
);
create policy quote_items_read on public.project_quote_items for select to authenticated using(exists(select 1 from public.project_quotes q where q.id=quote_id));

create function public.csworks_quote_json(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(q)||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i) order by i.position) from public.project_quote_items i where i.quote_id=q.id),'[]'::jsonb)) from public.project_quotes q where q.id=p_id
$$;
revoke all on function public.csworks_quote_json(uuid) from public,anon,authenticated,service_role;
create function public.csworks_get_quotes(p_project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; admin boolean; d uuid;
begin
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin') into admin;
 select * into p from public.projects where id=p_project_id;
 if auth.uid() is null or not found or (not admin and p.user_id is distinct from auth.uid()) then raise exception 'Not authorized' using errcode='42501'; end if;
 if admin then select id into d from public.project_quotes where project_id=p_project_id and state='draft'; end if;
 return jsonb_build_object('current',public.csworks_quote_json(p.formal_quote_id),'draft',public.csworks_quote_json(d),'history',coalesce((select jsonb_agg(public.csworks_quote_json(id) order by revision desc) from public.project_quotes where project_id=p_project_id and state<>'draft'),'[]'::jsonb));
end $$;

-- Once in the new mode, legacy direct updates cannot rewrite commercial terms or bypass ordering.
create function public.csworks_guard_quote_project() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.project_quotes%rowtype;
begin
 if old.formal_quote_id is null and new.formal_quote_id is null then return new; end if;
 if new.user_id is distinct from old.user_id or new.project_code is distinct from old.project_code then raise exception 'Frozen project identity' using errcode='42501'; end if;
 if new.formal_quote_id is null then raise exception 'Cannot remove formal quote' using errcode='42501'; end if;
 if old.formal_quote_id is distinct from new.formal_quote_id and old.status not in ('quote_requested','quote_reviewing','quote_presented') then raise exception 'Order terms are frozen' using errcode='40001'; end if;
 select * into q from public.project_quotes where id=new.formal_quote_id and project_id=new.id;
 if not found or q.state not in ('presented','accepted') or new.quoted_amount is distinct from q.subtotal or new.quoted_hours is distinct from q.hours or new.confirmed_deadline is distinct from q.deadline or new.quote_presented_at is distinct from q.presented_at or new.title is distinct from q.title or new.description is distinct from q.description then raise exception 'Quote terms mismatch' using errcode='42501'; end if;
 if new.status not in ('quote_presented','cancelled') and (q.state<>'accepted' or not exists(select 1 from public.project_orders o where o.project_id=new.id and o.formal_quote_id=q.id)) then raise exception 'Use versioned order RPC' using errcode='42501'; end if;
 if q.state='accepted' and (new.formal_quote_id is distinct from old.formal_quote_id or new.status in ('quote_requested','quote_reviewing','quote_presented','cancelled')) then raise exception 'Order already accepted' using errcode='40001'; end if;
 return new;
end $$;
create trigger csworks_guard_quote_project before update on public.projects for each row execute function public.csworks_guard_quote_project();

-- Attach the accepted quote to existing document snapshots, preserving their original numbering/tax.
create function public.csworks_guard_quote_document() returns trigger language plpgsql security definer set search_path='' as $$
declare q public.project_quotes%rowtype; qid uuid; owner_id uuid; code text;
begin
 select formal_quote_id,user_id,project_code into qid,owner_id,code from public.projects where id=new.project_id;
 if qid is null then
   if new.formal_quote_id is not null then raise exception 'Unexpected quote' using errcode='42501'; end if;
   return new;
 end if;
 select * into q from public.project_quotes where id=qid and project_id=new.project_id;
 if new.user_id is distinct from owner_id or new.project_code is distinct from code then raise exception 'Wrong document project identity' using errcode='42501'; end if;
 if q.state<>'accepted' then raise exception 'Use versioned order RPC' using errcode='42501'; end if;
 if tg_op='UPDATE' and (old.formal_quote_id is distinct from qid or new.formal_quote_id is distinct from old.formal_quote_id) then raise exception 'Frozen document' using errcode='42501'; end if;
 if new.formal_quote_id is not null and new.formal_quote_id<>qid then raise exception 'Wrong quote' using errcode='42501'; end if;
 new.formal_quote_id:=qid;
 if new.subtotal_amount<>q.subtotal or new.tax_rate<>10 or new.tax_amount<>floor(q.subtotal::numeric/10) or new.total_amount<>q.subtotal+floor(q.subtotal::numeric/10) or new.quoted_hours is distinct from q.hours or new.confirmed_deadline is distinct from q.deadline or new.project_title is distinct from q.title or new.project_description is distinct from q.description then raise exception 'Frozen document terms mismatch' using errcode='42501'; end if;
 return new;
end $$;
create trigger csworks_guard_quote_order before insert or update on public.project_orders for each row execute function public.csworks_guard_quote_document();
create trigger csworks_guard_quote_delivery before insert or update on public.project_deliveries for each row execute function public.csworks_guard_quote_document();
create trigger csworks_guard_quote_invoice before insert or update on public.project_invoices for each row execute function public.csworks_guard_quote_document();
revoke all on function public.csworks_guard_quote_project(),public.csworks_guard_quote_document() from public,anon,authenticated,service_role;

create function public.csworks_save_quote(p_project_id uuid,p_expected_quote_id uuid,p_draft_id uuid,p_edit_version integer,p_deadline date,p_items jsonb,p_present boolean,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; q public.project_quotes%rowtype; x jsonb; amount numeric:=0; hrs numeric:=0; pos integer:=0; keys uuid[]:='{}'; nums text[]:='{}'; k uuid; customer_snapshot jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found then raise exception 'Project not found' using errcode='42501'; end if;
 if p_request_id is null or p_present is null or p_edit_version is null or p_edit_version<0 then raise exception 'Invalid operation' using errcode='22023'; end if;
 -- A successful presentation may be replayed after a lost response without another revision/email.
 select * into q from public.project_quotes where request_id=p_request_id;
 if found then
  if q.project_id<>p_project_id then raise exception 'Wrong request' using errcode='42501'; end if;
  if (p_present and q.state='draft') or (not p_present and q.state<>'draft') then raise exception 'Operation changed' using errcode='40001'; end if;
  return jsonb_build_object('quote',public.csworks_quote_json(q.id),'project',to_jsonb(p),'replayed',true);
 end if;
 if p.status not in ('quote_requested','quote_reviewing','quote_presented') or exists(select 1 from public.project_orders where project_id=p_project_id) then raise exception 'Quote frozen' using errcode='40001'; end if;
 if p.formal_quote_id is distinct from p_expected_quote_id then raise exception 'Quote changed' using errcode='40001'; end if;
 if p_deadline is null or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 200 or octet_length(p_items::text)>600000 then raise exception 'Invalid items' using errcode='22023'; end if;
 for x in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(x)<>'object' or jsonb_typeof(x->'item_key') is distinct from 'string' or jsonb_typeof(x->'number') is distinct from 'string' or jsonb_typeof(x->'name') is distinct from 'string' or jsonb_typeof(x->'description') is distinct from 'string' or jsonb_typeof(x->'amount') is distinct from 'number' or jsonb_typeof(x->'hours') is distinct from 'number' then raise exception 'Invalid item' using errcode='22023'; end if;
  begin k:=(x->>'item_key')::uuid; exception when invalid_text_representation then raise exception 'Invalid item key' using errcode='22023'; end;
  if k=any(keys) or length(btrim(x->>'number')) not between 1 and 40 or btrim(x->>'number')=any(nums) or length(btrim(x->>'name')) not between 1 and 200 or length(x->>'description')>2000 or (x->>'amount')::numeric not between 0 and 1800000000 or (x->>'amount')::numeric<>trunc((x->>'amount')::numeric) or (x->>'hours')::numeric not between 0 and 100000 or (x->>'hours')::numeric<>round((x->>'hours')::numeric,2) then raise exception 'Invalid item fields' using errcode='22023'; end if;
  keys:=array_append(keys,k); nums:=array_append(nums,btrim(x->>'number')); amount:=amount+(x->>'amount')::numeric; hrs:=hrs+(x->>'hours')::numeric;
 end loop;
 if amount>1800000000 or hrs>1000000 then raise exception 'Total too large' using errcode='22023'; end if;
 if p_draft_id is null then
  if p_edit_version<>0 or exists(select 1 from public.project_quotes where project_id=p_project_id and state='draft') then raise exception 'Draft changed' using errcode='40001'; end if;
  insert into public.project_quotes(project_id,revision,state,title,description,deadline,subtotal,hours,created_by)
   select p_project_id,coalesce(max(revision),0)+1,'draft',p.title,p.description,p_deadline,amount,hrs,auth.uid() from public.project_quotes where project_id=p_project_id returning * into q;
 else
  select * into q from public.project_quotes where id=p_draft_id and project_id=p_project_id for update;
  if not found or q.state<>'draft' or p_edit_version is distinct from q.edit_version then raise exception 'Draft changed' using errcode='40001'; end if;
  update public.project_quotes set edit_version=edit_version+1,title=p.title,description=p.description,deadline=p_deadline,subtotal=amount,hours=hrs where id=q.id returning * into q;
  delete from public.project_quote_items where quote_id=q.id;
 end if;
 for x in select value from jsonb_array_elements(p_items) loop
  pos:=pos+1;
  insert into public.project_quote_items(quote_id,item_key,position,number,name,description,amount,hours)
   values(q.id,(x->>'item_key')::uuid,pos,btrim(x->>'number'),btrim(x->>'name'),x->>'description',(x->>'amount')::integer,(x->>'hours')::numeric);
 end loop;
 select jsonb_build_object('company_name',pr.company_name,'department_name',pr.department_name,'contact_name',pr.contact_name,'email',pr.email,'phone',pr.phone,'postal_code',pr.postal_code,'address',pr.address) into customer_snapshot from public.profiles pr where pr.id=p.user_id;
 update public.project_quotes set request_id=p_request_id,customer=coalesce(customer_snapshot,'{}'::jsonb) where id=q.id returning * into q;
 if p_present then
  update public.project_quotes set state='superseded' where project_id=p_project_id and state='presented';
  update public.project_quotes set state='presented',presented_at=now(),request_id=p_request_id where id=q.id returning * into q;
  update public.projects set formal_quote_id=q.id,quoted_amount=q.subtotal,quoted_hours=q.hours,confirmed_deadline=q.deadline,quote_presented_at=q.presented_at,status='quote_presented' where id=p_project_id returning * into p;
 end if;
 return jsonb_build_object('quote',public.csworks_quote_json(q.id),'project',to_jsonb(p),'replayed',false);
end $$;

create function public.csworks_order_quote(p_project_id uuid,p_quote_id uuid,p_request_id uuid) returns jsonb
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
 return jsonb_build_object('project',to_jsonb(p),'replayed',false);
end $$;
revoke all on function public.csworks_get_quotes(uuid),public.csworks_save_quote(uuid,uuid,uuid,integer,date,jsonb,boolean,uuid),public.csworks_order_quote(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.csworks_get_quotes(uuid),public.csworks_save_quote(uuid,uuid,uuid,integer,date,jsonb,boolean,uuid),public.csworks_order_quote(uuid,uuid,uuid) to authenticated;



-- Stage 2: 20261027010000_illustration_workflow.sql

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



-- Stage 3: 20261027020000_illustration_delivery.sql

create table public.project_delivery_assets (
 file_id uuid primary key,project_id uuid not null,illustration_id uuid,
 created_by uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 foreign key(file_id,project_id) references public.project_files(id,project_id) on delete restrict,
 foreign key(illustration_id,project_id) references public.project_illustrations(id,project_id) on delete restrict
);
create index delivery_assets_project on public.project_delivery_assets(project_id);
alter table public.project_delivery_assets enable row level security;
revoke all on public.project_delivery_assets from public,anon,authenticated,service_role;
grant select on public.project_delivery_assets to authenticated;
create policy delivery_assets_read on public.project_delivery_assets for select to authenticated using (
 public.csworks_can_read_review(project_id) and (public.is_admin() or exists(select 1 from public.projects p where p.id=project_id and p.status in ('delivered','invoice_requested','invoiced','completed')))
);
create function public.csworks_delivery_file_readable(p_project_id uuid,p_file_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() or exists(select 1 from public.projects p where p.id=p_project_id and p.user_id=auth.uid() and (not p.illustration_workflow or (p.status in ('delivered','invoice_requested','invoiced','completed') and (exists(select 1 from public.project_delivery_assets a where a.project_id=p.id and a.file_id=p_file_id) or not exists(select 1 from public.project_delivery_assets a where a.project_id=p.id)))))
$$;
create policy illustration_delivery_file_visibility on public.project_files as restrictive for select to authenticated using(file_type::text<>'delivery' or public.csworks_delivery_file_readable(project_id,id));
create function public.csworks_delivery_path_readable(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() or exists(select 1 from public.project_delivery_assets a join public.project_files f on f.id=a.file_id join public.projects p on p.id=a.project_id where f.storage_path=p_path and p.user_id=auth.uid() and p.status in ('delivered','invoice_requested','invoiced','completed'))
$$;
-- Existing bucket policies continue to authorize normal files. This restriction applies only to the new prefix.
create policy illustration_delivery_storage_visibility on storage.objects as restrictive for select to authenticated using(bucket_id<>'project-files' or name not like '%/delivery-final/%' or public.csworks_delivery_path_readable(name));
create function public.csworks_guard_delivery_asset() returns trigger language plpgsql security definer set search_path='' as $$
declare pid uuid;
begin
 pid:=case when tg_op='DELETE' then old.project_id else new.project_id end;
 perform 1 from public.projects where id=pid and status='approved' and illustration_workflow for update;
 if not found then raise exception 'Delivery list is frozen or not ready' using errcode='40001'; end if;
 if tg_op='UPDATE' then raise exception 'Replace via delivery operations' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if;
 if not exists(select 1 from public.project_files where id=new.file_id and project_id=pid and file_type::text='delivery') then raise exception 'Invalid delivery file' using errcode='22023'; end if;
 return new;
end $$;
create trigger csworks_guard_delivery_asset before insert or update or delete on public.project_delivery_assets for each row execute function public.csworks_guard_delivery_asset();
create function public.csworks_guard_delivery_file() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.project_delivery_assets where file_id=old.id) then raise exception 'Registered delivery file is immutable' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger csworks_guard_delivery_file before update or delete on public.project_files for each row execute function public.csworks_guard_delivery_file();
create function public.csworks_guard_delivery_complete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.illustration_workflow and old.status in ('delivered','invoice_requested','invoiced','completed') and new.status not in ('delivered','invoice_requested','invoiced','completed') then raise exception 'Delivered project cannot reopen delivery preparation' using errcode='42501'; end if;
 if new.illustration_workflow and old.status not in ('delivered','invoice_requested','invoiced','completed') and new.status in ('delivered','invoice_requested','invoiced','completed') then
  if exists(select 1 from public.project_delivery_assets a join public.project_files f on f.id=a.file_id where a.project_id=new.id and not exists(select 1 from storage.objects o where o.bucket_id='project-files' and o.name=f.storage_path)) then raise exception 'Delivery object missing' using errcode='40001'; end if;
  if new.status<>'delivered' or not exists(select 1 from public.project_deliveries where project_id=new.id) or not exists(select 1 from public.project_illustrations where project_id=new.id) or exists(select 1 from public.project_illustrations i where i.project_id=new.id and (i.state<>'approved' or not exists(select 1 from public.project_delivery_assets a where a.illustration_id=i.id and a.project_id=new.id))) then raise exception 'Every illustration requires final delivery files' using errcode='40001'; end if;
 end if;
 return new;
end $$;
create trigger csworks_guard_delivery_complete before update on public.projects for each row execute function public.csworks_guard_delivery_complete();
create function public.csworks_get_delivery_manifest(p_project_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; published boolean;
begin
 if not public.csworks_can_read_review(p_project_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id;
 if not p.illustration_workflow then raise exception 'Illustration workflow required' using errcode='22023'; end if;
 published:=p.status in ('delivered','invoice_requested','invoiced','completed');
 if published and not exists(select 1 from public.project_delivery_assets where project_id=p.id) then
  return jsonb_build_object('project',jsonb_build_object('id',p.id,'project_code',p.project_code,'status',p.status),'published',true,'items','[]'::jsonb,'assets',coalesce((select jsonb_agg(jsonb_build_object('illustration_id',null,'file',to_jsonb(f)) order by f.created_at,f.id) from public.project_files f where f.project_id=p.id and f.file_type::text='delivery'),'[]'::jsonb));
 end if;
 return jsonb_build_object('project',jsonb_build_object('id',p.id,'project_code',p.project_code,'status',p.status),'published',published,
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'number',i.number,'name',i.name,'state',i.state) order by i.position) from public.project_illustrations i where i.project_id=p.id),'[]'::jsonb),
 'assets',case when public.is_admin() or published then coalesce((select jsonb_agg(jsonb_build_object('illustration_id',a.illustration_id,'file',to_jsonb(f)) order by a.created_at,a.file_id) from public.project_delivery_assets a join public.project_files f on f.id=a.file_id where a.project_id=p.id),'[]'::jsonb) else '[]'::jsonb end);
end $$;
create function public.csworks_register_delivery_file(p_project_id uuid,p_illustration_id uuid,p_request_id uuid,p_name text,p_path text,p_mime text,p_size bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; a public.project_delivery_assets%rowtype; f public.project_files%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 select * into p from public.projects where id=p_project_id for update;
 if not found or not p.illustration_workflow then raise exception 'Wrong project' using errcode='42501'; end if;
 select * into a from public.project_delivery_assets where file_id=p_request_id;
 if found then
  select * into f from public.project_files where id=a.file_id;
  if a.project_id<>p.id or a.illustration_id is distinct from p_illustration_id or f.file_name is distinct from p_name or f.storage_path is distinct from p_path or f.mime_type is distinct from p_mime or f.file_size is distinct from p_size then raise exception 'Request changed' using errcode='40001'; end if;
  return to_jsonb(a);
 end if;
 if p.status<>'approved' then raise exception 'Delivery list is frozen or not ready' using errcode='40001'; end if;
 if p_illustration_id is not null and not exists(select 1 from public.project_illustrations where id=p_illustration_id and project_id=p.id and state='approved') then raise exception 'Wrong illustration' using errcode='42501'; end if;
 if p_request_id is null or p_name is null or length(trim(p_name)) not between 1 and 255 or p_name ~ '[[:cntrl:]]' or p_size is null or p_size not between 1 and 52428800 or p_mime is null or length(p_mime) not between 1 and 150 or p_path is distinct from p.id::text||'/delivery-final/'||p_request_id::text then raise exception 'Invalid file' using errcode='22023'; end if;
 if (select count(*) from public.project_delivery_assets where project_id=p.id)>=1000 then raise exception 'Too many delivery files' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id='project-files' and name=p_path) then raise exception 'Uploaded object not found' using errcode='22023'; end if;
 insert into public.project_files(id,project_id,uploaded_by,file_name,storage_path,file_type,mime_type,file_size) values(p_request_id,p.id,auth.uid(),p_name,p_path,'delivery',p_mime,p_size);
 insert into public.project_delivery_assets(file_id,project_id,illustration_id,created_by) values(p_request_id,p.id,p_illustration_id,auth.uid()) returning * into a;
 return to_jsonb(a);
end $$;
create function public.csworks_remove_delivery_file(p_project_id uuid,p_file_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 perform 1 from public.projects where id=p_project_id and status='approved' and illustration_workflow for update;
 if not found then raise exception 'Delivery list is frozen or not ready' using errcode='40001'; end if;
 delete from public.project_delivery_assets where file_id=p_file_id and project_id=p_project_id;
 -- Original bytes and metadata are retained privately; never automatically delete Storage.
end $$;
revoke all on function public.csworks_guard_delivery_asset(),public.csworks_guard_delivery_file(),public.csworks_guard_delivery_complete(),public.csworks_delivery_file_readable(uuid,uuid),public.csworks_delivery_path_readable(text),public.csworks_get_delivery_manifest(uuid),public.csworks_register_delivery_file(uuid,uuid,uuid,text,text,text,bigint),public.csworks_remove_delivery_file(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.csworks_delivery_file_readable(uuid,uuid),public.csworks_delivery_path_readable(text),public.csworks_get_delivery_manifest(uuid),public.csworks_register_delivery_file(uuid,uuid,uuid,text,text,text,bigint),public.csworks_remove_delivery_file(uuid,uuid) to authenticated;

create function public.csworks_delivery_path_mutable(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.project_delivery_assets a join public.project_files f on f.id=a.file_id where f.storage_path=p_path)
$$;
create policy illustration_delivery_storage_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'project-files' or name not like '%/delivery-final/%' or public.csworks_delivery_path_mutable(name)) with check(bucket_id<>'project-files' or name not like '%/delivery-final/%' or public.csworks_delivery_path_mutable(name));
create policy illustration_delivery_storage_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'project-files' or name not like '%/delivery-final/%' or public.csworks_delivery_path_mutable(name));
revoke all on function public.csworks_delivery_path_mutable(text) from public,anon,authenticated,service_role;
grant execute on function public.csworks_delivery_path_mutable(text) to authenticated;



-- Refresh PostgREST after all schema changes commit together.
notify pgrst, 'reload schema';
commit;
select 'MULTI_ILLUSTRATION_PRODUCTION_READY' as result;
