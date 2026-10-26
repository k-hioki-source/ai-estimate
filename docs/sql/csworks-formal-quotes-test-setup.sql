-- TEST ONLY. Dashboard must show cs-works-test / jjiebuuasaimaqemhiua.
-- Never run on cs-works. Refuses missing test marker, non-test accounts, nonempty documents, repeat runs.
-- Extends empty synthetic document tables; preserves existing annotation tests and files.
-- This is not a Production migration. Run as one script, not selected statements.
begin;
do $$ begin
 if to_regclass('public.csworks_annotation_test_environment') is null then raise exception 'STOP: annotation test environment marker required'; end if;
 if not exists(select 1 from public.csworks_annotation_test_environment where project_ref='jjiebuuasaimaqemhiua') then raise exception 'STOP: wrong test marker'; end if;
 if exists(select 1 from auth.users where email is null or email not in ('csworks-admin@example.com','csworks-customer@example.com','csworks-other@example.com')) or (select count(*) from auth.users)<>3 then raise exception 'STOP: exactly the three dedicated test users are required'; end if;
 if exists(select 1 from public.projects where project_code not like 'TEST-%') then raise exception 'STOP: unexpected project data'; end if;
 if exists(select 1 from public.project_orders) or exists(select 1 from public.project_deliveries) or exists(select 1 from public.project_invoices) then raise exception 'STOP: synthetic document tables must be empty'; end if;
 if to_regclass('public.project_quotes') is not null then raise exception 'STOP: quote setup already applied; do not repeat'; end if;
end $$;
alter table public.project_orders add column if not exists "confirmed_deadline" date;
alter table public.project_orders add column if not exists "created_at" timestamptz not null default now();
alter table public.project_orders alter column "created_at" set not null;
alter table public.project_orders add column if not exists "customer_address" text;
alter table public.project_orders add column if not exists "customer_company_name" text;
alter table public.project_orders add column if not exists "customer_contact_name" text;
alter table public.project_orders add column if not exists "customer_department_name" text;
alter table public.project_orders add column if not exists "customer_email" text;
alter table public.project_orders add column if not exists "customer_phone" text;
alter table public.project_orders add column if not exists "customer_postal_code" text;
alter table public.project_orders add column if not exists "id" uuid not null default gen_random_uuid();
alter table public.project_orders alter column "id" set not null;
alter table public.project_orders add column if not exists "order_code" text not null;
alter table public.project_orders alter column "order_code" set not null;
alter table public.project_orders add column if not exists "ordered_at" timestamptz not null;
alter table public.project_orders alter column "ordered_at" set not null;
alter table public.project_orders add column if not exists "project_code" text not null;
alter table public.project_orders alter column "project_code" set not null;
alter table public.project_orders add column if not exists "project_description" text;
alter table public.project_orders add column if not exists "project_id" uuid not null;
alter table public.project_orders alter column "project_id" set not null;
alter table public.project_orders add column if not exists "project_title" text not null;
alter table public.project_orders alter column "project_title" set not null;
alter table public.project_orders add column if not exists "quoted_hours" numeric;
alter table public.project_orders add column if not exists "subtotal_amount" int4 not null;
alter table public.project_orders alter column "subtotal_amount" set not null;
alter table public.project_orders add column if not exists "tax_amount" int4 not null;
alter table public.project_orders alter column "tax_amount" set not null;
alter table public.project_orders add column if not exists "tax_rate" numeric not null default 10.00;
alter table public.project_orders alter column "tax_rate" set not null;
alter table public.project_orders add column if not exists "total_amount" int4 not null;
alter table public.project_orders alter column "total_amount" set not null;
alter table public.project_orders add column if not exists "user_id" uuid not null;
alter table public.project_orders alter column "user_id" set not null;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_orders'::regclass and conname='project_orders_order_code_key') then alter table public.project_orders add constraint project_orders_order_code_key UNIQUE (order_code); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_orders'::regclass and conname='project_orders_pkey') then alter table public.project_orders add constraint project_orders_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_orders'::regclass and conname='project_orders_project_id_key') then alter table public.project_orders add constraint project_orders_project_id_key UNIQUE (project_id); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_orders'::regclass and conname='project_orders_project_id_fkey') then alter table public.project_orders add constraint project_orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT; end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_orders'::regclass and conname='project_orders_subtotal_amount_check') then alter table public.project_orders add constraint project_orders_subtotal_amount_check CHECK (subtotal_amount >= 0); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_orders'::regclass and conname='project_orders_tax_amount_check') then alter table public.project_orders add constraint project_orders_tax_amount_check CHECK (tax_amount >= 0); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_orders'::regclass and conname='project_orders_tax_rate_check') then alter table public.project_orders add constraint project_orders_tax_rate_check CHECK (tax_rate >= 0::numeric); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_orders'::regclass and conname='project_orders_total_amount_check') then alter table public.project_orders add constraint project_orders_total_amount_check CHECK (total_amount >= 0); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_orders'::regclass and conname='project_orders_user_id_fkey') then alter table public.project_orders add constraint project_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT; end if; end $$;
alter table public.project_deliveries add column if not exists "confirmed_deadline" date;
alter table public.project_deliveries add column if not exists "created_at" timestamptz not null default now();
alter table public.project_deliveries alter column "created_at" set not null;
alter table public.project_deliveries add column if not exists "customer_address" text;
alter table public.project_deliveries add column if not exists "customer_company_name" text;
alter table public.project_deliveries add column if not exists "customer_contact_name" text;
alter table public.project_deliveries add column if not exists "customer_department_name" text;
alter table public.project_deliveries add column if not exists "customer_email" text;
alter table public.project_deliveries add column if not exists "customer_phone" text;
alter table public.project_deliveries add column if not exists "customer_postal_code" text;
alter table public.project_deliveries add column if not exists "delivered_at" timestamptz not null;
alter table public.project_deliveries alter column "delivered_at" set not null;
alter table public.project_deliveries add column if not exists "delivery_code" text not null;
alter table public.project_deliveries alter column "delivery_code" set not null;
alter table public.project_deliveries add column if not exists "id" uuid not null default gen_random_uuid();
alter table public.project_deliveries alter column "id" set not null;
alter table public.project_deliveries add column if not exists "project_code" text not null;
alter table public.project_deliveries alter column "project_code" set not null;
alter table public.project_deliveries add column if not exists "project_description" text;
alter table public.project_deliveries add column if not exists "project_id" uuid not null;
alter table public.project_deliveries alter column "project_id" set not null;
alter table public.project_deliveries add column if not exists "project_title" text not null;
alter table public.project_deliveries alter column "project_title" set not null;
alter table public.project_deliveries add column if not exists "quoted_hours" numeric;
alter table public.project_deliveries add column if not exists "subtotal_amount" int4 not null;
alter table public.project_deliveries alter column "subtotal_amount" set not null;
alter table public.project_deliveries add column if not exists "tax_amount" int4 not null;
alter table public.project_deliveries alter column "tax_amount" set not null;
alter table public.project_deliveries add column if not exists "tax_rate" numeric not null default 10.00;
alter table public.project_deliveries alter column "tax_rate" set not null;
alter table public.project_deliveries add column if not exists "total_amount" int4 not null;
alter table public.project_deliveries alter column "total_amount" set not null;
alter table public.project_deliveries add column if not exists "user_id" uuid not null;
alter table public.project_deliveries alter column "user_id" set not null;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_deliveries'::regclass and conname='project_deliveries_delivery_code_key') then alter table public.project_deliveries add constraint project_deliveries_delivery_code_key UNIQUE (delivery_code); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_deliveries'::regclass and conname='project_deliveries_pkey') then alter table public.project_deliveries add constraint project_deliveries_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_deliveries'::regclass and conname='project_deliveries_project_id_key') then alter table public.project_deliveries add constraint project_deliveries_project_id_key UNIQUE (project_id); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_deliveries'::regclass and conname='project_deliveries_project_id_fkey') then alter table public.project_deliveries add constraint project_deliveries_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT; end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_deliveries'::regclass and conname='project_deliveries_subtotal_amount_check') then alter table public.project_deliveries add constraint project_deliveries_subtotal_amount_check CHECK (subtotal_amount >= 0); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_deliveries'::regclass and conname='project_deliveries_tax_amount_check') then alter table public.project_deliveries add constraint project_deliveries_tax_amount_check CHECK (tax_amount >= 0); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_deliveries'::regclass and conname='project_deliveries_tax_rate_check') then alter table public.project_deliveries add constraint project_deliveries_tax_rate_check CHECK (tax_rate >= 0::numeric); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_deliveries'::regclass and conname='project_deliveries_total_amount_check') then alter table public.project_deliveries add constraint project_deliveries_total_amount_check CHECK (total_amount >= 0); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_deliveries'::regclass and conname='project_deliveries_user_id_fkey') then alter table public.project_deliveries add constraint project_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT; end if; end $$;
alter table public.project_invoices add column if not exists "bank_account_name" text not null default 'SYNTHETIC TEST'::text;
alter table public.project_invoices alter column "bank_account_name" set not null;
alter table public.project_invoices add column if not exists "bank_account_name_kana" text not null default 'SYNTHETIC TEST'::text;
alter table public.project_invoices alter column "bank_account_name_kana" set not null;
alter table public.project_invoices add column if not exists "bank_account_number" text not null default 'SYNTHETIC TEST'::text;
alter table public.project_invoices alter column "bank_account_number" set not null;
alter table public.project_invoices add column if not exists "bank_account_type" text not null default 'SYNTHETIC TEST'::text;
alter table public.project_invoices alter column "bank_account_type" set not null;
alter table public.project_invoices add column if not exists "bank_branch_code" text not null default 'SYNTHETIC TEST'::text;
alter table public.project_invoices alter column "bank_branch_code" set not null;
alter table public.project_invoices add column if not exists "bank_branch_name" text not null default 'SYNTHETIC TEST'::text;
alter table public.project_invoices alter column "bank_branch_name" set not null;
alter table public.project_invoices add column if not exists "bank_code" text not null default 'SYNTHETIC TEST'::text;
alter table public.project_invoices alter column "bank_code" set not null;
alter table public.project_invoices add column if not exists "bank_name" text not null default 'SYNTHETIC TEST'::text;
alter table public.project_invoices alter column "bank_name" set not null;
alter table public.project_invoices add column if not exists "confirmed_deadline" date;
alter table public.project_invoices add column if not exists "created_at" timestamptz not null default now();
alter table public.project_invoices alter column "created_at" set not null;
alter table public.project_invoices add column if not exists "customer_address" text;
alter table public.project_invoices add column if not exists "customer_company_name" text;
alter table public.project_invoices add column if not exists "customer_contact_name" text;
alter table public.project_invoices add column if not exists "customer_department_name" text;
alter table public.project_invoices add column if not exists "customer_email" text;
alter table public.project_invoices add column if not exists "customer_phone" text;
alter table public.project_invoices add column if not exists "customer_postal_code" text;
alter table public.project_invoices add column if not exists "id" uuid not null default gen_random_uuid();
alter table public.project_invoices alter column "id" set not null;
alter table public.project_invoices add column if not exists "invoice_code" text not null;
alter table public.project_invoices alter column "invoice_code" set not null;
alter table public.project_invoices add column if not exists "invoice_date" date not null;
alter table public.project_invoices alter column "invoice_date" set not null;
alter table public.project_invoices add column if not exists "issued_at" timestamptz not null default now();
alter table public.project_invoices alter column "issued_at" set not null;
alter table public.project_invoices add column if not exists "issuer_name" text not null default 'SYNTHETIC TEST'::text;
alter table public.project_invoices alter column "issuer_name" set not null;
alter table public.project_invoices add column if not exists "issuer_registration_number" text not null default 'SYNTHETIC TEST'::text;
alter table public.project_invoices alter column "issuer_registration_number" set not null;
alter table public.project_invoices add column if not exists "payment_due_date" date;
alter table public.project_invoices add column if not exists "payment_reminder_sent_at" timestamptz;
alter table public.project_invoices add column if not exists "project_code" text not null;
alter table public.project_invoices alter column "project_code" set not null;
alter table public.project_invoices add column if not exists "project_description" text;
alter table public.project_invoices add column if not exists "project_id" uuid not null;
alter table public.project_invoices alter column "project_id" set not null;
alter table public.project_invoices add column if not exists "project_title" text not null;
alter table public.project_invoices alter column "project_title" set not null;
alter table public.project_invoices add column if not exists "quoted_hours" numeric;
alter table public.project_invoices add column if not exists "subtotal_amount" int4 not null;
alter table public.project_invoices alter column "subtotal_amount" set not null;
alter table public.project_invoices add column if not exists "tax_amount" int4 not null;
alter table public.project_invoices alter column "tax_amount" set not null;
alter table public.project_invoices add column if not exists "tax_rate" numeric not null default 10.00;
alter table public.project_invoices alter column "tax_rate" set not null;
alter table public.project_invoices add column if not exists "total_amount" int4 not null;
alter table public.project_invoices alter column "total_amount" set not null;
alter table public.project_invoices add column if not exists "user_id" uuid not null;
alter table public.project_invoices alter column "user_id" set not null;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_invoices'::regclass and conname='project_invoices_invoice_code_key') then alter table public.project_invoices add constraint project_invoices_invoice_code_key UNIQUE (invoice_code); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_invoices'::regclass and conname='project_invoices_pkey') then alter table public.project_invoices add constraint project_invoices_pkey PRIMARY KEY (id); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_invoices'::regclass and conname='project_invoices_project_id_key') then alter table public.project_invoices add constraint project_invoices_project_id_key UNIQUE (project_id); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_invoices'::regclass and conname='project_invoices_project_id_fkey') then alter table public.project_invoices add constraint project_invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT; end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_invoices'::regclass and conname='project_invoices_subtotal_amount_check') then alter table public.project_invoices add constraint project_invoices_subtotal_amount_check CHECK (subtotal_amount >= 0); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_invoices'::regclass and conname='project_invoices_tax_amount_check') then alter table public.project_invoices add constraint project_invoices_tax_amount_check CHECK (tax_amount >= 0); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_invoices'::regclass and conname='project_invoices_tax_rate_check') then alter table public.project_invoices add constraint project_invoices_tax_rate_check CHECK (tax_rate >= 0::numeric); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_invoices'::regclass and conname='project_invoices_total_amount_check') then alter table public.project_invoices add constraint project_invoices_total_amount_check CHECK (total_amount >= 0); end if; end $$;
do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.project_invoices'::regclass and conname='project_invoices_user_id_fkey') then alter table public.project_invoices add constraint project_invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT; end if; end $$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$function$;
revoke all on function public.is_admin() from public,anon,service_role;
grant execute on function public.is_admin() to authenticated;

CREATE OR REPLACE FUNCTION public.order_project(p_project_id uuid)
 RETURNS projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects;
  v_profile public.profiles;
  v_ordered_at timestamptz := now();
  v_order_code text;
  v_subtotal integer;
  v_tax integer;
  v_total integer;
begin
  -- 対象案件をロックし、二重発注を防止
  select *
    into v_project
  from public.projects
  where id = p_project_id
    and user_id = auth.uid()
  for update;

  if v_project.id is null then
    raise exception 'Project not found';
  end if;

  if v_project.status <> 'quote_presented' then
    raise exception 'Project is not ready to order';
  end if;

  if v_project.quoted_amount is null
     or v_project.confirmed_deadline is null then
    raise exception 'Quote amount and deadline are required';
  end if;

  -- 念のため既存発注書を確認
  if exists (
    select 1
    from public.project_orders
    where project_id = v_project.id
  ) then
    raise exception 'Order already exists';
  end if;

  select *
    into v_profile
  from public.profiles
  where id = auth.uid();

  v_subtotal := round(v_project.quoted_amount)::integer;
  v_tax := floor(v_subtotal * 0.10)::integer;
  v_total := v_subtotal + v_tax;

  -- ORD-YYYYMMDD-XXXXXX
  v_order_code :=
    'ORD-' ||
    to_char(v_ordered_at at time zone 'Asia/Tokyo', 'YYYYMMDD') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.project_orders (
    project_id,
    user_id,
    order_code,
    project_code,
    project_title,
    project_description,
    customer_company_name,
    customer_department_name,
    customer_contact_name,
    customer_email,
    customer_phone,
    customer_postal_code,
    customer_address,
    subtotal_amount,
    tax_rate,
    tax_amount,
    total_amount,
    quoted_hours,
    confirmed_deadline,
    ordered_at
  )
  values (
    v_project.id,
    auth.uid(),
    v_order_code,
    v_project.project_code,
    v_project.title,
    v_project.description,
    v_profile.company_name,
    v_profile.department_name,
    v_profile.contact_name,
    v_profile.email,
    v_profile.phone,
    v_profile.postal_code,
    v_profile.address,
    v_subtotal,
    10.00,
    v_tax,
    v_total,
    v_project.quoted_hours,
    v_project.confirmed_deadline,
    v_ordered_at
  );

  update public.projects
  set
    status = 'ordered',
    ordered_at = v_ordered_at
  where id = v_project.id
  returning * into v_project;

  return v_project;
end;
$function$;
revoke all on function public.order_project(uuid) from public,anon,service_role;
grant execute on function public.order_project(uuid) to authenticated;

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
revoke all on function public.deliver_project(uuid) from public,anon,service_role;
grant execute on function public.deliver_project(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.complete_project(p_project_id uuid)
 RETURNS projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects%rowtype;
  v_delivery public.project_deliveries%rowtype;
  v_invoice public.project_invoices%rowtype;
  v_invoice_code text;
  v_invoice_date date := current_date;
  v_payment_due_date date;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  select *
    into v_project
    from public.projects
   where id = p_project_id
   for update;

  if not found then
    raise exception 'Project not found';
  end if;

  if v_project.status <> 'invoice_requested' then
    raise exception 'Project status must be invoice_requested';
  end if;

  select *
    into v_delivery
    from public.project_deliveries
   where project_id = p_project_id;

  if not found then
    raise exception 'Delivery not found';
  end if;

  if exists (
    select 1
      from public.project_invoices
     where project_id = p_project_id
  ) then
    raise exception 'Invoice already exists';
  end if;

  -- 請求日の翌月末
  v_payment_due_date :=
    (date_trunc('month', v_invoice_date)::date
      + interval '2 months'
      - interval '1 day')::date;

  v_invoice_code :=
    'CSW-INV-' ||
    to_char(clock_timestamp(), 'YYYYMMDD') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.project_invoices (
    project_id,
    user_id,
    invoice_code,
    project_code,
    project_title,
    project_description,
    customer_company_name,
    customer_department_name,
    customer_contact_name,
    customer_email,
    customer_phone,
    customer_postal_code,
    customer_address,
    subtotal_amount,
    tax_rate,
    tax_amount,
    total_amount,
    quoted_hours,
    confirmed_deadline,
    invoice_date,
    payment_due_date,
    issued_at
  )
  values (
    v_project.id,
    v_project.user_id,
    v_invoice_code,
    v_delivery.project_code,
    v_delivery.project_title,
    v_delivery.project_description,
    v_delivery.customer_company_name,
    v_delivery.customer_department_name,
    v_delivery.customer_contact_name,
    v_delivery.customer_email,
    v_delivery.customer_phone,
    v_delivery.customer_postal_code,
    v_delivery.customer_address,
    v_delivery.subtotal_amount,
    v_delivery.tax_rate,
    v_delivery.tax_amount,
    v_delivery.total_amount,
    v_delivery.quoted_hours,
    v_delivery.confirmed_deadline,
    v_invoice_date,
    v_payment_due_date,
    now()
  )
  returning * into v_invoice;

  update public.projects
     set status = 'invoiced',
         updated_at = now()
   where id = p_project_id
  returning * into v_project;

  return v_project;
end;
$function$;
revoke all on function public.complete_project(uuid) from public,anon,service_role;
grant execute on function public.complete_project(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.confirm_project_payment(p_project_id uuid)
 RETURNS projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;

  select *
    into v_project
    from public.projects
   where id = p_project_id
   for update;

  if not found then
    raise exception 'Project not found';
  end if;

  if v_project.status <> 'invoiced' then
    raise exception 'Project status must be invoiced';
  end if;

  if not exists (
    select 1
      from public.project_invoices
     where project_id = p_project_id
  ) then
    raise exception 'Invoice not found';
  end if;

  update public.projects
     set status = 'completed',
         completed_at = now(),
         updated_at = now()
   where id = p_project_id
  returning * into v_project;

  return v_project;
end;
$function$;
revoke all on function public.confirm_project_payment(uuid) from public,anon,service_role;
grant execute on function public.confirm_project_payment(uuid) to authenticated;

-- DRAFT: dedicated test DB first. Production application requires separate approval.
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


insert into public.projects(id,user_id,project_code,title,description,status)
select 'c5200000-0000-4000-8000-000000000001'::uuid,id,'TEST-QUOTE-A','複数枚正式見積りテストA','専用テスト案件。実顧客データではありません。','quote_requested' from auth.users where email='csworks-customer@example.com';
insert into public.projects(id,user_id,project_code,title,description,status)
select 'c5200000-0000-4000-8000-000000000002'::uuid,id,'TEST-QUOTE-B','複数枚正式見積りテストB','別顧客の権限確認用。','quote_requested' from auth.users where email='csworks-other@example.com';
commit;
select 'FORMAL_QUOTE_TEST_READY' as result;
