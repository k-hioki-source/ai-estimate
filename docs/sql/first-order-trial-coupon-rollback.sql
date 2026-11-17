-- Recovery plan only. Run only after stopping new grants and reviewing current records.
-- This script intentionally refuses recovery once any coupon has been granted.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select singleton from public.trial_coupon_settings where singleton for update;
lock table public.trial_coupon_grants in share row exclusive mode;
do $$ begin
 if exists(select 1 from public.trial_coupon_grants) then
  raise exception 'Coupon grants exist: preserve customer entitlements and review a forward fix instead';
 end if;
end $$;
update public.trial_coupon_settings set enabled=false where singleton;
drop trigger if exists zz_trial_coupon_company on auth.users;
drop trigger if exists trial_coupon_confirmed on auth.users;
drop trigger if exists trial_coupon_project on public.projects;
drop trigger if exists trial_coupon_zero_invoice on public.project_invoices;
drop trigger if exists zz_trial_coupon_complete on public.projects;
-- Older quote save functions do not maintain the new metadata columns.
alter table public.project_quotes drop constraint if exists trial_coupon_quote_amounts;
alter table public.project_quotes drop constraint if exists trial_coupon_quote_grant;
CREATE OR REPLACE FUNCTION public.csworks_order_quote(p_project_id uuid, p_quote_id uuid, p_request_id uuid)
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

CREATE OR REPLACE FUNCTION public.csworks_save_quote(p_project_id uuid, p_expected_quote_id uuid, p_draft_id uuid, p_edit_version integer, p_deadline date, p_items jsonb, p_present boolean, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;

CREATE OR REPLACE FUNCTION public.deliver_project(p_project_id uuid)
 RETURNS projects
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
-- Retain tables, new columns and all history for investigation.
commit;
