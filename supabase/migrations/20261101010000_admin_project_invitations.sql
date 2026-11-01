-- Apply to isolated test DB first. Production SQL requires separate approval.
-- No authentication accounts are created; existing project ownership remains NOT NULL.
begin;
do $$ begin
 if to_regprocedure('public.csworks_guard_direct_project()') is null or to_regprocedure('public.csworks_guard_message_update()') is null or to_regprocedure('public.csworks_guard_file_path()') is null then raise exception 'Apply and verify project access hardening first'; end if;
end $$;
create table public.project_intakes (
 id uuid primary key default gen_random_uuid(), project_id uuid not null unique default gen_random_uuid(),
 company_name text not null, contact_name text not null, email text not null,
 title text not null, description text not null default '', production_category text not null,
 desired_deadline date, quote_items jsonb, quote_deadline date,
 version integer not null default 1, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 accepted_at timestamptz, accepted_by uuid references auth.users(id),
 check ((accepted_at is null) = (accepted_by is null)),
 check(length(title) between 1 and 200), check(length(description)<=10000)
);
create table public.project_invitations (
 id uuid primary key default gen_random_uuid(), intake_id uuid not null references public.project_intakes(id),
 intake_version integer not null, email text not null, token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 expires_at timestamptz not null, revoked_at timestamptz, accepted_at timestamptz, accepted_by uuid references auth.users(id),
 send_state text not null default 'processing' check(send_state in ('processing','captured','sent','failed','unknown')),
 provider_id text, check(expires_at>created_at), check((accepted_at is null)=(accepted_by is null))
);
create unique index project_invitation_one_active on public.project_invitations(intake_id) where revoked_at is null and accepted_at is null;
create table public.project_intake_files (
 id uuid primary key default gen_random_uuid(), intake_id uuid not null references public.project_intakes(id),
 file_name text not null check(length(file_name) between 1 and 255), storage_path text not null unique,
 file_size bigint not null check(file_size between 1 and 52428800), mime_type text,
 uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
alter table public.project_intake_files enable row level security;
revoke all on public.project_intake_files from public,anon,authenticated,service_role;
create function public.csworks_register_intake_file(p_intake_id uuid,p_name text,p_path text,p_size bigint,p_mime text) returns void language plpgsql security definer set search_path='' as $$
declare i public.project_intakes%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 select * into i from public.project_intakes where id=p_intake_id for update;
 if not found or i.accepted_at is not null then raise exception 'Intake changed' using errcode='40001'; end if;
 if split_part(p_path,'/',1)<>i.project_id::text or p_path ~ '(^|/)\.\.?(/|$)|\\|//' or right(p_path,1)='/' or
 not exists(select 1 from storage.objects where bucket_id='project-files' and name=p_path) then raise exception 'Invalid storage path' using errcode='42501'; end if;
 if (select count(*) from public.project_intake_files where intake_id=i.id)>=30 then raise exception 'File limit' using errcode='54000'; end if;
 insert into public.project_intake_files(intake_id,file_name,storage_path,file_size,mime_type,uploaded_by) values(i.id,p_name,p_path,p_size,left(p_mime,200),auth.uid());
 update public.project_intakes set version=version+1,updated_at=now() where id=i.id;
 update public.project_invitations set revoked_at=now() where intake_id=i.id and revoked_at is null and accepted_at is null;
end $$;
revoke all on function public.csworks_register_intake_file(uuid,text,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.csworks_register_intake_file(uuid,text,text,bigint,text) to authenticated;
create table public.project_invitation_attempts (user_id uuid primary key references auth.users(id), window_start timestamptz not null, attempts integer not null);
alter table public.project_intakes enable row level security;
alter table public.project_invitations enable row level security;
alter table public.project_invitation_attempts enable row level security;
revoke all on public.project_intakes, public.project_invitations, public.project_invitation_attempts from public,anon,authenticated,service_role;
grant select on public.project_intakes to authenticated;
create policy intake_admin_read on public.project_intakes for select to authenticated using(public.is_admin());

-- Shared validation for preparation AND acceptance. Never trust a client total.
create function public.csworks_intake_totals(items jsonb) returns jsonb language plpgsql set search_path='' as $$
declare x jsonb; amount numeric:=0; hrs numeric:=0; keys uuid[]:='{}'; nums text[]:='{}'; k uuid;
begin
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 200 or octet_length(items::text)>600000 then raise exception 'Invalid items' using errcode='22023'; end if;
 for x in select value from jsonb_array_elements(items) loop
  if jsonb_typeof(x)<>'object' or jsonb_typeof(x->'item_key') is distinct from 'string' or jsonb_typeof(x->'number') is distinct from 'string' or jsonb_typeof(x->'name') is distinct from 'string' or jsonb_typeof(x->'description') is distinct from 'string' or jsonb_typeof(x->'amount') is distinct from 'number' or jsonb_typeof(x->'hours') is distinct from 'number' then raise exception 'Invalid item' using errcode='22023'; end if;
  k:=(x->>'item_key')::uuid;
  if k=any(keys) or btrim(x->>'number')=any(nums) or length(btrim(x->>'number')) not between 1 and 40 or length(btrim(x->>'name')) not between 1 and 200 or length(x->>'description')>2000 or (x->>'amount')::numeric not between 0 and 1800000000 or (x->>'amount')::numeric<>trunc((x->>'amount')::numeric) or (x->>'hours')::numeric not between 0 and 100000 or (x->>'hours')::numeric<>round((x->>'hours')::numeric,2) then raise exception 'Invalid item' using errcode='22023'; end if;
  keys:=array_append(keys,k); nums:=array_append(nums,btrim(x->>'number')); amount:=amount+(x->>'amount')::numeric; hrs:=hrs+(x->>'hours')::numeric;
 end loop;
 if amount>1800000000 or hrs>1000000 then raise exception 'Total too large' using errcode='22023'; end if;
 return jsonb_build_object('subtotal',amount,'hours',hrs);
end $$;

create function public.csworks_save_intake(p_id uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.project_intakes%rowtype; items jsonb; deadline date;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>650000 or
 length(btrim(coalesce(p_data->>'company_name',''))) not between 1 and 200 or
 length(btrim(coalesce(p_data->>'contact_name',''))) not between 1 and 200 or
 length(btrim(coalesce(p_data->>'title',''))) not between 1 and 200 or
 length(coalesce(p_data->>'description',''))>10000 or
 length(coalesce(p_data->>'email',''))>254 or coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
 coalesce(p_data->>'production_category','') not in ('technical','photo_trace','realistic','3dcg','animation','manual','other') then raise exception 'Invalid intake' using errcode='22023'; end if;
 items:=nullif(p_data->'quote_items','null'::jsonb); deadline:=nullif(p_data->>'quote_deadline','')::date;
 if items is not null then perform public.csworks_intake_totals(items); if deadline is null then raise exception 'Deadline required' using errcode='22023'; end if; end if;
 if p_id is null then
  if p_version is distinct from 0 then raise exception 'Version mismatch' using errcode='40001'; end if;
  insert into public.project_intakes(company_name,contact_name,email,title,description,production_category,desired_deadline,quote_items,quote_deadline,created_by)
  values(btrim(p_data->>'company_name'),btrim(p_data->>'contact_name'),lower(btrim(p_data->>'email')),btrim(p_data->>'title'),coalesce(p_data->>'description',''),p_data->>'production_category',nullif(p_data->>'desired_deadline','')::date,items,deadline,auth.uid()) returning * into i;
 else
  select * into i from public.project_intakes where id=p_id for update;
  if not found or i.accepted_at is not null or i.version is distinct from p_version then raise exception 'Intake changed' using errcode='40001'; end if;
  -- Editing invalidates every earlier invitation, including changed addresses/terms.
  update public.project_invitations set revoked_at=now() where intake_id=i.id and revoked_at is null and accepted_at is null;
  update public.project_intakes set company_name=btrim(p_data->>'company_name'),contact_name=btrim(p_data->>'contact_name'),email=lower(btrim(p_data->>'email')),title=btrim(p_data->>'title'),description=coalesce(p_data->>'description',''),production_category=p_data->>'production_category',desired_deadline=nullif(p_data->>'desired_deadline','')::date,quote_items=items,quote_deadline=deadline,version=version+1,updated_at=now() where id=p_id returning * into i;
 end if;
 return to_jsonb(i);
end $$;

create function public.csworks_list_intakes() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('files',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.project_intake_files f where f.intake_id=i.id),'[]'::jsonb),'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'created_at',v.created_at,'expires_at',v.expires_at,'revoked_at',v.revoked_at,'accepted_at',v.accepted_at,'send_state',v.send_state) order by v.created_at desc) from public.project_invitations v where v.intake_id=i.id),'[]'::jsonb)) order by i.updated_at desc) from public.project_intakes i),'[]'::jsonb);
end $$;

-- Server-only issuance: actor ID is verified with auth.getUser + admin lookup in the API.
create function public.csworks_issue_invitation(p_intake_id uuid,p_version integer,p_actor uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.project_intakes%rowtype; v public.project_invitations%rowtype;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 -- Serializes all sends by this admin, then locks the intake (same ordering for sends).
 perform 1 from public.profiles where id=p_actor for update;
 select * into i from public.project_intakes where id=p_intake_id for update;
 if not found or i.accepted_at is not null or i.version is distinct from p_version then raise exception 'Intake changed' using errcode='40001'; end if;
 if exists(select 1 from public.project_invitations where intake_id=i.id and created_at>now()-interval '60 seconds') or
 (select count(*) from public.project_invitations where created_by=p_actor and created_at>now()-interval '1 hour')>=30 or
 (select count(*) from public.project_invitations where email=i.email and created_at>now()-interval '1 day')>=5 then raise exception 'Send limit reached' using errcode='54000'; end if;
 update public.project_invitations set revoked_at=now() where intake_id=i.id and revoked_at is null and accepted_at is null;
 insert into public.project_invitations(intake_id,intake_version,email,token_hash,created_by,expires_at) values(i.id,i.version,i.email,p_hash,p_actor,now()+interval '7 days') returning * into v;
 return jsonb_build_object('id',v.id,'email',i.email,'contact_name',i.contact_name,'expires_at',v.expires_at);
end $$;
create function public.csworks_finish_invitation(p_id uuid,p_state text,p_provider_id text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_state not in ('captured','sent','failed','unknown') then raise exception 'Invalid state'; end if;
 update public.project_invitations set send_state=p_state,provider_id=p_provider_id where id=p_id and send_state='processing';
end $$;
create function public.csworks_revoke_invitation(p_intake_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 perform 1 from public.project_intakes where id=p_intake_id for update;
 update public.project_invitations set revoked_at=now() where intake_id=p_intake_id and revoked_at is null and accepted_at is null;
end $$;

create function public.csworks_accept_invitation(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.project_intakes%rowtype; v public.project_invitations%rowtype; who uuid:=auth.uid(); mail text; confirmed timestamptz; totals jsonb; qid uuid; x jsonb; pos integer:=0; tries integer;
begin
 if who is null or public.is_admin() then raise exception 'Customer required' using errcode='42501'; end if;
 -- Return errors (rather than raise) after increment so invalid attempts remain counted.
 insert into public.project_invitation_attempts values(who,now(),1)
 on conflict(user_id) do update set attempts=case when project_invitation_attempts.window_start<now()-interval '15 minutes' then 1 else project_invitation_attempts.attempts+1 end,window_start=case when project_invitation_attempts.window_start<now()-interval '15 minutes' then now() else project_invitation_attempts.window_start end returning attempts into tries;
 if tries>20 then return jsonb_build_object('error','rate_limited'); end if;
 select lower(btrim(email)),email_confirmed_at into mail,confirmed from auth.users where id=who;
 if confirmed is null then return jsonb_build_object('error','email_confirmation_required'); end if;
 select * into v from public.project_invitations where token_hash=p_hash;
 if not found then return jsonb_build_object('error','invalid_invitation'); end if;
 -- Intake first: consistent lock order with edits/revoke/send.
 select * into i from public.project_intakes where id=v.intake_id for update;
 select * into v from public.project_invitations where id=v.id for update;
 if v.accepted_at is not null or v.revoked_at is not null or v.expires_at<=now() or v.email is distinct from mail or i.version<>v.intake_version or i.accepted_at is not null or v.send_state not in ('sent','captured') then return jsonb_build_object('error','invalid_invitation'); end if;
 -- Only stored admin-authored content is copied. No owner/price/status input exists.
 insert into public.projects(id,user_id,project_code,title,description,desired_deadline,status)
 values(i.project_id,who,'PRJ-'||to_char(now() at time zone 'Asia/Tokyo','YYYYMMDD')||'-'||upper(replace(i.project_id::text,'-','')),i.title,i.description,i.desired_deadline,'quote_requested');
 if i.quote_items is not null then
  totals:=public.csworks_intake_totals(i.quote_items);
  insert into public.project_quotes(project_id,revision,state,title,description,deadline,customer,subtotal,hours,created_by,presented_at)
  values(i.project_id,1,'presented',i.title,i.description,i.quote_deadline,jsonb_build_object('company_name',i.company_name,'contact_name',i.contact_name,'email',mail),(totals->>'subtotal')::integer,(totals->>'hours')::numeric,i.created_by,now()) returning id into qid;
  for x in select value from jsonb_array_elements(i.quote_items) loop
   pos:=pos+1;
   insert into public.project_quote_items(quote_id,item_key,position,number,name,description,amount,hours) values(qid,(x->>'item_key')::uuid,pos,btrim(x->>'number'),btrim(x->>'name'),x->>'description',(x->>'amount')::integer,(x->>'hours')::numeric);
  end loop;
  update public.projects set formal_quote_id=qid,quoted_amount=(totals->>'subtotal')::integer,quoted_hours=(totals->>'hours')::numeric,confirmed_deadline=i.quote_deadline,quote_presented_at=now(),status='quote_presented' where id=i.project_id;
 end if;
 insert into public.project_files(id,project_id,uploaded_by,file_name,storage_path,file_size,mime_type,file_type)
 select id,i.project_id,uploaded_by,file_name,storage_path,file_size,mime_type,'reference' from public.project_intake_files where intake_id=i.id;
 update public.project_intakes set accepted_at=now(),accepted_by=who,updated_at=now() where id=i.id;
 update public.project_invitations set accepted_at=now(),accepted_by=who where id=v.id;
 -- Do not overwrite an existing customer's profile. Ensure signup profile exists.
 insert into public.profiles(id,role,email,company_name,contact_name) values(who,'customer',mail,i.company_name,i.contact_name) on conflict(id) do update set company_name=coalesce(nullif(public.profiles.company_name,''),excluded.company_name),contact_name=coalesce(nullif(public.profiles.contact_name,''),excluded.contact_name),email=coalesce(nullif(public.profiles.email,''),excluded.email);
 return jsonb_build_object('projectId',i.project_id);
end $$;
revoke all on function public.csworks_intake_totals(jsonb),public.csworks_save_intake(uuid,integer,jsonb),public.csworks_list_intakes(),public.csworks_issue_invitation(uuid,integer,uuid,text),public.csworks_finish_invitation(uuid,text,text),public.csworks_revoke_invitation(uuid),public.csworks_accept_invitation(text) from public,anon,authenticated,service_role;
grant execute on function public.csworks_save_intake(uuid,integer,jsonb),public.csworks_list_intakes(),public.csworks_revoke_invitation(uuid),public.csworks_accept_invitation(text) to authenticated;
grant execute on function public.csworks_issue_invitation(uuid,integer,uuid,text),public.csworks_finish_invitation(uuid,text,text) to service_role;
commit;
