-- First-order trial coupon. Review in test DB before production.
-- Production enablement requires app deployment and setting enabled=true.
begin;
create schema if not exists csworks_private;
revoke all on schema csworks_private from public,anon,authenticated;
create table public.trial_coupon_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 starts_at timestamptz not null default clock_timestamp(),
 grant_limit integer check(grant_limit>=0),
 redemption_limit integer check(redemption_limit>=0),
 expires_at timestamptz
);
insert into public.trial_coupon_settings(singleton) values(true);
alter table public.trial_coupon_settings enable row level security;
revoke all on public.trial_coupon_settings from public,anon,authenticated;
grant select,update on public.trial_coupon_settings to service_role;

create function csworks_private.company_key(p_name text) returns text
language sql immutable set search_path='' as $$
 select regexp_replace(
  regexp_replace(lower(normalize(coalesce(p_name,''),NFKC)),'[[:space:]　]+','','g'),
  '(株式会社|有限会社|合同会社|\(株\)|\(有\)|\(同\))','','g')
$$;
revoke all on function csworks_private.company_key(text) from public,anon,authenticated;

create table public.trial_coupon_grants (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete restrict,
 company_key text not null unique check(length(company_key)>0),
 company_name text not null,
 granted_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz,
 consumed_at timestamptz,
 consumed_project_id uuid unique references public.projects(id) on delete restrict,
 application text check(application in ('full','partial')),
 discount_amount integer check(discount_amount between 0 and 3000),
 check((consumed_at is null and consumed_project_id is null and application is null and discount_amount is null)
 or (consumed_at is not null and consumed_project_id is not null and application is not null and discount_amount is not null))
);
alter table public.trial_coupon_grants enable row level security;
revoke all on public.trial_coupon_grants from public,anon,authenticated;
grant select on public.trial_coupon_grants to authenticated;
grant select,update on public.trial_coupon_grants to service_role;
create policy trial_coupon_read on public.trial_coupon_grants for select to authenticated
using(user_id=(select auth.uid()) or public.is_admin());

create table public.trial_coupon_mail (
 grant_id uuid primary key references public.trial_coupon_grants(id) on delete restrict,
 sent_at timestamptz,
 claimed_at timestamptz,
 attempt_count integer not null default 0,
 last_error text
);
alter table public.trial_coupon_mail enable row level security;
revoke all on public.trial_coupon_mail from public,anon,authenticated;
grant select,update on public.trial_coupon_mail to service_role;

alter table public.project_quotes
 add column gross_subtotal integer,
 add column coupon_grant_id uuid references public.trial_coupon_grants(id) on delete restrict,
 add column coupon_discount_amount integer not null default 0 check(coupon_discount_amount between 0 and 3000),
 add column coupon_application text not null default 'ineligible' check(coupon_application in ('full','partial','ineligible')),
 add column coupon_managed boolean not null default false,
 add constraint trial_coupon_quote_amounts check(
 (gross_subtotal is null and coupon_discount_amount=0) or
 (gross_subtotal between 0 and 1800000000 and subtotal=gross_subtotal-coupon_discount_amount and subtotal>=0)),
 add constraint trial_coupon_quote_grant check((coupon_grant_id is null)=(coupon_application='ineligible'));

alter table public.projects add column coupon_zero_delivery boolean not null default false;

create function csworks_private.grant_trial_coupon(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare cfg public.trial_coupon_settings%rowtype; pr public.profiles%rowtype; ky text; gid uuid;
begin
 select * into cfg from public.trial_coupon_settings where singleton for update;
 if not cfg.enabled or (cfg.expires_at is not null and cfg.expires_at<=clock_timestamp()) then return; end if;
 select * into pr from public.profiles where id=p_user;
 if not found or pr.role<>'customer' or not exists(select 1 from auth.users u where u.id=p_user and u.created_at>=cfg.starts_at and u.email_confirmed_at is not null) then return; end if;
 ky:=csworks_private.company_key(pr.company_name);
 if ky='' or exists(select 1 from public.trial_coupon_grants where user_id=p_user or company_key=ky) then return; end if;
 if exists(select 1 from public.project_orders o where o.user_id=p_user or csworks_private.company_key(o.customer_company_name)=ky) then return; end if;
 if cfg.grant_limit is not null and (select count(*) from public.trial_coupon_grants)>=cfg.grant_limit then return; end if;
 insert into public.trial_coupon_grants(user_id,company_key,company_name,expires_at)
 values(p_user,ky,pr.company_name,cfg.expires_at) on conflict do nothing returning id into gid;
 if gid is not null then insert into public.trial_coupon_mail(grant_id) values(gid); end if;
end $$;
revoke all on function csworks_private.grant_trial_coupon(uuid) from public,anon,authenticated;

-- Only captures company input for a newly created account; never authorizes via metadata.
create function csworks_private.capture_company() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.profiles set company_name=left(btrim(new.raw_user_meta_data->>'company_name'),200)
 where id=new.id and company_name is null;
 if new.email_confirmed_at is not null then perform csworks_private.grant_trial_coupon(new.id); end if;
 return new;
end $$;
create trigger zz_trial_coupon_company after insert on auth.users
for each row execute function csworks_private.capture_company();
create function csworks_private.confirmed_signup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.email_confirmed_at is null and new.email_confirmed_at is not null then
  perform csworks_private.grant_trial_coupon(new.id);
 end if;
 return new;
end $$;
create trigger trial_coupon_confirmed after update of email_confirmed_at on auth.users
for each row execute function csworks_private.confirmed_signup();
revoke all on function csworks_private.capture_company(),csworks_private.confirmed_signup() from public,anon,authenticated;

create function csworks_private.available_trial_coupon(p_user uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select g.id from public.trial_coupon_grants g cross join public.trial_coupon_settings s
 where s.singleton and g.user_id=p_user and g.consumed_at is null
 and (g.expires_at is null or g.expires_at>now())
 and (s.expires_at is null or s.expires_at>now())
 and (s.redemption_limit is null or (select count(*) from public.trial_coupon_grants where consumed_at is not null)<s.redemption_limit)
 and not exists(select 1 from public.project_orders o where o.user_id=p_user or csworks_private.company_key(o.customer_company_name)=g.company_key)
$$;
revoke all on function csworks_private.available_trial_coupon(uuid) from public,anon,authenticated;

create function public.csworks_trial_coupon_status(p_user_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=coalesce(p_user_id,auth.uid()); g public.trial_coupon_grants%rowtype;
begin
 if auth.uid() is null or (uid is distinct from auth.uid() and not public.is_admin()) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into g from public.trial_coupon_grants where user_id=uid;
 return jsonb_build_object('granted',g.id is not null,'available',csworks_private.available_trial_coupon(uid) is not null,
 'consumed',g.consumed_at is not null,'granted_at',g.granted_at,'consumed_at',g.consumed_at,
 'expires_at',g.expires_at,'amount',3000);
end $$;
revoke all on function public.csworks_trial_coupon_status(uuid) from public,anon,authenticated;
grant execute on function public.csworks_trial_coupon_status(uuid) to authenticated;

-- Called by trusted save/order wrappers while holding the member lock.
create function csworks_private.reprice_trial_quotes(p_user uuid,p_except uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare q public.project_quotes%rowtype; gid uuid; gross integer; disc integer;
begin
 gid:=csworks_private.available_trial_coupon(p_user);
 for q in select x.* from public.project_quotes x join public.projects p on p.id=x.project_id
 where p.user_id=p_user and x.state in ('draft','presented') and x.coupon_managed
 and x.id is distinct from p_except order by x.id for update of x loop
  gross:=coalesce(q.gross_subtotal,q.subtotal);
  disc:=case when gid is null then 0 else least(3000,gross) end;
  if q.coupon_discount_amount is distinct from disc or q.coupon_grant_id is distinct from gid then
   update public.project_quotes set gross_subtotal=gross,subtotal=gross-disc,coupon_grant_id=gid,
   coupon_discount_amount=disc,coupon_application=case when gid is null then 'ineligible' when gross<=3000 then 'full' else 'partial' end,
   edit_version=edit_version+1,request_id=null where id=q.id;
   if q.state='presented' then update public.projects set quoted_amount=gross-disc where id=q.project_id and formal_quote_id=q.id; end if;
  end if;
 end loop;
end $$;
revoke all on function csworks_private.reprice_trial_quotes(uuid,uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.csworks_save_quote(p_project_id uuid, p_expected_quote_id uuid, p_draft_id uuid, p_edit_version integer, p_deadline date, p_items jsonb, p_present boolean, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.projects%rowtype; q public.project_quotes%rowtype; x jsonb; amount numeric:=0; hrs numeric:=0; pos integer:=0; keys uuid[]:='{}'; nums text[]:='{}'; k uuid; customer_snapshot jsonb; coupon_id uuid; gross_amount integer; discount integer;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Admin required' using errcode='42501'; end if;
 perform 1 from public.profiles where id=(select user_id from public.projects where id=p_project_id) for update;
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
 if amount<3000 then raise exception 'Minimum formal quote is 3000 yen' using errcode='22023'; end if;
 gross_amount:=amount;
 coupon_id:=csworks_private.available_trial_coupon(p.user_id);
 discount:=case when coupon_id is null then 0 else least(3000,gross_amount) end;
 amount:=gross_amount-discount;
 if p_draft_id is null then
  if p_edit_version<>0 or exists(select 1 from public.project_quotes where project_id=p_project_id and state='draft') then raise exception 'Draft changed' using errcode='40001'; end if;
  insert into public.project_quotes(project_id,revision,state,title,description,deadline,subtotal,hours,created_by,gross_subtotal,coupon_grant_id,coupon_discount_amount,coupon_application,coupon_managed)
   select p_project_id,coalesce(max(revision),0)+1,'draft',p.title,p.description,p_deadline,amount,hrs,auth.uid(),gross_amount,coupon_id,discount,
 case when coupon_id is null then 'ineligible' when gross_amount<=3000 then 'full' else 'partial' end,
 exists(select 1 from public.trial_coupon_grants where user_id=p.user_id) from public.project_quotes where project_id=p_project_id returning * into q;
 else
  select * into q from public.project_quotes where id=p_draft_id and project_id=p_project_id for update;
  if not found or q.state<>'draft' or p_edit_version is distinct from q.edit_version then raise exception 'Draft changed' using errcode='40001'; end if;
  update public.project_quotes set edit_version=edit_version+1,title=p.title,description=p.description,deadline=p_deadline,subtotal=amount,hours=hrs,gross_subtotal=gross_amount,coupon_grant_id=coupon_id,
 coupon_discount_amount=discount,coupon_managed=exists(select 1 from public.trial_coupon_grants where user_id=p.user_id),
 coupon_application=case when coupon_id is null then 'ineligible' when gross_amount<=3000 then 'full' else 'partial' end where id=q.id returning * into q;
  delete from public.project_quote_items where quote_id=q.id;
 end if;
 for x in select value from jsonb_array_elements(p_items) loop
  pos:=pos+1;
  insert into public.project_quote_items(quote_id,item_key,position,number,name,description,amount,hours)
   values(q.id,(x->>'item_key')::uuid,pos,btrim(x->>'number'),btrim(x->>'name'),x->>'description',(x->>'amount')::integer,(x->>'hours')::numeric);
 end loop;
 select jsonb_build_object('company_name',pr.company_name,'department_name',pr.department_name,'contact_name',pr.contact_name,'email',pr.email,'phone',pr.phone,'postal_code',pr.postal_code,'address',pr.address) into customer_snapshot from public.profiles pr where pr.id=p.user_id;
 update public.project_quotes set gross_subtotal=gross_amount,coupon_grant_id=coupon_id,coupon_discount_amount=discount,
 coupon_managed=exists(select 1 from public.trial_coupon_grants where user_id=p.user_id),
 coupon_application=case when coupon_id is null then 'ineligible' when gross_amount<=3000 then 'full' else 'partial' end,
 request_id=p_request_id,customer=coalesce(customer_snapshot,'{}'::jsonb) where id=q.id returning * into q;
 if p_present then
  update public.project_quotes set state='superseded' where project_id=p_project_id and state='presented';
  update public.project_quotes set state='presented',presented_at=now(),request_id=p_request_id where id=q.id returning * into q;
  update public.projects set formal_quote_id=q.id,quoted_amount=q.subtotal,quoted_hours=q.hours,confirmed_deadline=q.deadline,quote_presented_at=q.presented_at,status='quote_presented' where id=p_project_id returning * into p;
 end if;
 return jsonb_build_object('quote',public.csworks_quote_json(q.id),'project',to_jsonb(p),'replayed',false);
end $function$
;
CREATE OR REPLACE FUNCTION csworks_private.order_quote_base(p_project_id uuid, p_quote_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;
revoke all on function csworks_private.order_quote_base(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.csworks_order_quote(p_project_id uuid,p_quote_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.project_quotes where id=p_quote_id and coupon_managed) then
  raise exception 'Reload quote and confirm the latest total' using errcode='40001';
 end if;
 return csworks_private.order_quote_base(p_project_id,p_quote_id,p_request_id);
end $$;

create function public.csworks_order_quote_checked(p_project_id uuid,p_quote_id uuid,p_request_id uuid,p_expected_total integer,p_expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; q public.project_quotes%rowtype; gid uuid; result jsonb;
begin
 if auth.uid() is null then raise exception 'Customer required' using errcode='42501'; end if;
 -- Global capacity lock precedes member/project locks. All coupon orders share this path.
 perform 1 from public.trial_coupon_settings where singleton for update;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into p from public.projects where id=p_project_id for update;
 if not found or p.user_id is distinct from auth.uid() or public.is_admin() then raise exception 'Customer required' using errcode='42501'; end if;
 select * into q from public.project_quotes where id=p_quote_id and project_id=p_project_id for update;
 if not found or p_request_id is null then raise exception 'Invalid quote' using errcode='22023'; end if;
 if q.state='accepted' and q.accepted_request_id=p_request_id then return csworks_private.order_quote_base(p_project_id,p_quote_id,p_request_id); end if;
 if p.formal_quote_id is distinct from q.id or q.state<>'presented' or p.status<>'quote_presented' then raise exception 'Quote changed' using errcode='40001'; end if;
 perform csworks_private.reprice_trial_quotes(auth.uid());
 select * into q from public.project_quotes where id=p_quote_id;
 if p_expected_total is distinct from (q.subtotal+floor(q.subtotal::numeric/10))::integer or p_expected_version is distinct from q.edit_version then
  return jsonb_build_object('quoteChanged',true,'quote',public.csworks_quote_json(q.id));
 end if;
 gid:=csworks_private.available_trial_coupon(auth.uid());
 if q.coupon_grant_id is not null then
  if gid is distinct from q.coupon_grant_id then raise exception 'Coupon changed' using errcode='40001'; end if;
  update public.trial_coupon_grants set consumed_at=clock_timestamp(),consumed_project_id=p.id,
  application=q.coupon_application,discount_amount=q.coupon_discount_amount
  where id=gid and consumed_at is null;
  if not found then raise exception 'Coupon already consumed' using errcode='40001'; end if;
  update public.projects set coupon_zero_delivery=(q.subtotal=0) where id=p.id;
 end if;
 result:=csworks_private.order_quote_base(p_project_id,p_quote_id,p_request_id);
 perform csworks_private.reprice_trial_quotes(auth.uid(),p_quote_id);
 return result;
end $$;
revoke all on function public.csworks_order_quote_checked(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.csworks_order_quote_checked(uuid,uuid,uuid,integer,integer) to authenticated;

-- Prevent legacy, manually edited, or unauthorized commercial paths bypassing coupons.
create function csworks_private.guard_trial_project() returns trigger
language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and
 new.coupon_zero_delivery is distinct from old.coupon_zero_delivery then raise exception 'Frozen coupon treatment' using errcode='42501'; end if;
 if new.status in ('quote_presented','ordered') and new.formal_quote_id is null and
 exists(select 1 from public.trial_coupon_grants where user_id=new.user_id) then
 raise exception 'Coupon members require itemized formal quotes' using errcode='22023'; end if;
 return new;
end $$;
create trigger trial_coupon_project before update on public.projects for each row execute function csworks_private.guard_trial_project();
revoke all on function csworks_private.guard_trial_project() from public,anon,authenticated;

create function csworks_private.guard_zero_invoice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.projects where id=new.project_id and coupon_zero_delivery) then
  raise exception 'Coupon zero delivery does not issue an invoice' using errcode='22023';
 end if;
 return new;
end $$;
create trigger trial_coupon_zero_invoice before insert or update on public.project_invoices
for each row execute function csworks_private.guard_zero_invoice();
revoke all on function csworks_private.guard_zero_invoice() from public,anon,authenticated;

create function csworks_private.complete_zero_delivery() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='delivered' and old.status is distinct from new.status and new.coupon_zero_delivery then
  update public.projects set status='completed',completed_at=clock_timestamp() where id=new.id;
 end if;
 return new;
end $$;
create trigger zz_trial_coupon_complete after update of status on public.projects
for each row execute function csworks_private.complete_zero_delivery();
revoke all on function csworks_private.complete_zero_delivery() from public,anon,authenticated;
CREATE OR REPLACE FUNCTION csworks_private.deliver_project_base(p_project_id uuid)
 RETURNS public.projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects;
  v_profile public.profiles;
  v_order public.project_orders;
  v_delivered_at timestamptz := now();
  v_delivery_code text;
  v_subtotal integer;
  v_tax_rate numeric(5,2);
  v_tax integer;
  v_total integer;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  select * into v_project
  from public.projects
  where id = p_project_id
  for update;

  if v_project.id is null then raise exception 'Project not found'; end if;
  if v_project.status <> 'approved' then
    raise exception 'Only approved projects can be delivered';
  end if;

  if not exists (
    select 1 from public.project_files
    where project_id = v_project.id and file_type = 'delivery'
  ) then
    raise exception 'Delivery file is required';
  end if;

  if exists (
    select 1 from public.project_deliveries where project_id = v_project.id
  ) then
    raise exception 'Delivery document already exists';
  end if;

  select * into v_profile from public.profiles where id = v_project.user_id;
  select * into v_order from public.project_orders where project_id = v_project.id;

  if v_order.id is not null then
    v_subtotal := v_order.subtotal_amount;
    v_tax_rate := v_order.tax_rate;
    v_tax := v_order.tax_amount;
    v_total := v_order.total_amount;
  else
    if v_project.quoted_amount is null then raise exception 'Quoted amount is required'; end if;
    v_subtotal := round(v_project.quoted_amount)::integer;
    v_tax_rate := 10.00;
    v_tax := floor(v_subtotal * v_tax_rate / 100)::integer;
    v_total := v_subtotal + v_tax;
  end if;

  v_delivery_code := 'DLV-' ||
    to_char(v_delivered_at at time zone 'Asia/Tokyo', 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.project_deliveries (
    project_id,user_id,delivery_code,project_code,project_title,project_description,
    customer_company_name,customer_department_name,customer_contact_name,customer_email,
    customer_phone,customer_postal_code,customer_address,
    subtotal_amount,tax_rate,tax_amount,total_amount,quoted_hours,confirmed_deadline,delivered_at
  ) values (
    v_project.id,v_project.user_id,v_delivery_code,v_project.project_code,v_project.title,v_project.description,
    v_profile.company_name,v_profile.department_name,v_profile.contact_name,v_profile.email,
    v_profile.phone,v_profile.postal_code,v_profile.address,
    v_subtotal,v_tax_rate,v_tax,v_total,v_project.quoted_hours,v_project.confirmed_deadline,v_delivered_at
  );

  update public.projects
  set status = 'delivered'
  where id = v_project.id
  returning * into v_project;

  return v_project;
end;
$function$;
revoke all on function csworks_private.deliver_project_base(uuid) from public,anon,authenticated;
create or replace function public.deliver_project(p_project_id uuid) returns public.projects
language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype;
begin
 perform csworks_private.deliver_project_base(p_project_id);
 select * into p from public.projects where id=p_project_id;
 return p;
end $$;

create function public.csworks_trial_coupon_monthly(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_from>p_to or p_to>p_from+interval '10 years' then raise exception 'Invalid months' using errcode='22023'; end if;
 select coalesce(jsonb_agg(row_to_json(x) order by x.month),'[]'::jsonb) into result from (
 select to_char(m,'YYYY-MM') as month,
 (select count(*) from public.profiles pr join auth.users u on u.id=pr.id where pr.role='customer' and date_trunc('month',u.email_confirmed_at at time zone 'Asia/Tokyo')=m) as registrations,
 (select count(*) from public.trial_coupon_grants g where date_trunc('month',g.granted_at at time zone 'Asia/Tokyo')=m) as grants,
 (select count(*) from public.trial_coupon_grants g where date_trunc('month',g.consumed_at at time zone 'Asia/Tokyo')=m) as redemptions,
 (select count(*) from public.trial_coupon_grants g where g.application='full' and date_trunc('month',g.consumed_at at time zone 'Asia/Tokyo')=m) as full_redemptions,
 (select count(*) from public.trial_coupon_grants g where g.application='partial' and date_trunc('month',g.consumed_at at time zone 'Asia/Tokyo')=m) as partial_redemptions,
 (select count(*) from public.trial_coupon_grants g where date_trunc('month',g.consumed_at at time zone 'Asia/Tokyo')=m
 and exists(select 1 from public.project_orders o where o.user_id=g.user_id and o.project_id<>g.consumed_project_id and o.ordered_at>=g.consumed_at)) as repeat_customers,
 (select coalesce(sum(d.subtotal_amount),0) from public.project_deliveries d join public.trial_coupon_grants g on g.consumed_project_id=d.project_id
 where date_trunc('month',d.delivered_at at time zone 'Asia/Tokyo')=m) as first_revenue_ex_tax,
 (select coalesce(sum(d.subtotal_amount),0) from public.project_deliveries d join public.trial_coupon_grants g on g.user_id=d.user_id
 join public.project_orders o on o.project_id=d.project_id where d.project_id<>g.consumed_project_id and o.ordered_at>=g.consumed_at
 and date_trunc('month',d.delivered_at at time zone 'Asia/Tokyo')=m) as repeat_revenue_ex_tax
 from generate_series(date_trunc('month',p_from::timestamp),date_trunc('month',p_to::timestamp),interval '1 month') m
 ) x;
 return result;
end $$;
revoke all on function public.csworks_trial_coupon_monthly(date,date) from public,anon,authenticated;
grant execute on function public.csworks_trial_coupon_monthly(date,date) to authenticated;

create function public.csworks_claim_trial_coupon_mail(p_user_id uuid default null) returns table(grant_id uuid,email text)
language sql security definer set search_path='' as $$
 with candidates as (
 select m.grant_id from public.trial_coupon_mail m join public.trial_coupon_grants g on g.id=m.grant_id
 where m.sent_at is null and (m.claimed_at is null or m.claimed_at<now()-interval '10 minutes')
 and (p_user_id is null or g.user_id=p_user_id) order by g.granted_at limit 25 for update of m skip locked
 ), claimed as (
 update public.trial_coupon_mail m set claimed_at=now(),attempt_count=attempt_count+1
 from candidates c where m.grant_id=c.grant_id returning m.grant_id
 )
 select c.grant_id,u.email::text from claimed c join public.trial_coupon_grants g on g.id=c.grant_id
 join auth.users u on u.id=g.user_id where u.email_confirmed_at is not null
$$;
revoke all on function public.csworks_claim_trial_coupon_mail(uuid) from public,anon,authenticated;
grant execute on function public.csworks_claim_trial_coupon_mail(uuid) to service_role;

create function public.csworks_trial_coupon_repeat_members(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_from>p_to or p_to>p_from+interval '10 years' then raise exception 'Invalid months' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',g.user_id,'company_name',g.company_name,'consumed_at',g.consumed_at,
 'has_second_order',exists(select 1 from public.project_orders o where o.user_id=g.user_id and o.project_id<>g.consumed_project_id and o.ordered_at>=g.consumed_at)) order by g.consumed_at)
 from public.trial_coupon_grants g where (g.consumed_at at time zone 'Asia/Tokyo')>=date_trunc('month',p_from::timestamp)
 and (g.consumed_at at time zone 'Asia/Tokyo')<date_trunc('month',p_to::timestamp)+interval '1 month'),'[]'::jsonb);
end $;
revoke all on function public.csworks_trial_coupon_repeat_members(date,date) from public,anon,authenticated;
grant execute on function public.csworks_trial_coupon_repeat_members(date,date) to authenticated;
commit;
