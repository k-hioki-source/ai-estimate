-- Synthetic empty fixture generated from user-provided metadata, 2026-10-26.

-- No customer rows, credentials or production bank defaults. Not for remote execution.

create schema auth; create role anon; create role authenticated; create role service_role;

create table auth.users(id uuid primary key); create table public.estimates(id uuid primary key);

create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;

grant usage on schema auth,public to authenticated,anon,service_role; grant execute on function auth.uid(),auth.role() to public;

create table public.profiles (
 "address" text,
 "company_name" text,
 "contact_name" text,
 "created_at" timestamptz not null default now(),
 "department_name" text,
 "email" text,
 "id" uuid not null,
 "newsletter_enabled" bool not null default true,
 "phone" text,
 "postal_code" text,
 "role" text not null default 'customer'::text,
 "updated_at" timestamptz not null default now()
);

create table public.project_deliveries (
 "confirmed_deadline" date,
 "created_at" timestamptz not null default now(),
 "customer_address" text,
 "customer_company_name" text,
 "customer_contact_name" text,
 "customer_department_name" text,
 "customer_email" text,
 "customer_phone" text,
 "customer_postal_code" text,
 "delivered_at" timestamptz not null,
 "delivery_code" text not null,
 "id" uuid not null default gen_random_uuid(),
 "project_code" text not null,
 "project_description" text,
 "project_id" uuid not null,
 "project_title" text not null,
 "quoted_hours" numeric,
 "subtotal_amount" int4 not null,
 "tax_amount" int4 not null,
 "tax_rate" numeric not null default 10.00,
 "total_amount" int4 not null,
 "user_id" uuid not null
);

create table public.project_files (
 "created_at" timestamptz not null default now(),
 "file_name" text not null,
 "file_size" int8,
 "file_type" text not null default 'reference'::text,
 "id" uuid not null default gen_random_uuid(),
 "mime_type" text,
 "project_id" uuid not null,
 "storage_path" text not null,
 "uploaded_by" uuid not null
);

create table public.project_invoices (
 "bank_account_name" text not null default 'SYNTHETIC TEST'::text,
 "bank_account_name_kana" text not null default 'SYNTHETIC TEST'::text,
 "bank_account_number" text not null default 'SYNTHETIC TEST'::text,
 "bank_account_type" text not null default 'SYNTHETIC TEST'::text,
 "bank_branch_code" text not null default 'SYNTHETIC TEST'::text,
 "bank_branch_name" text not null default 'SYNTHETIC TEST'::text,
 "bank_code" text not null default 'SYNTHETIC TEST'::text,
 "bank_name" text not null default 'SYNTHETIC TEST'::text,
 "confirmed_deadline" date,
 "created_at" timestamptz not null default now(),
 "customer_address" text,
 "customer_company_name" text,
 "customer_contact_name" text,
 "customer_department_name" text,
 "customer_email" text,
 "customer_phone" text,
 "customer_postal_code" text,
 "id" uuid not null default gen_random_uuid(),
 "invoice_code" text not null,
 "invoice_date" date not null,
 "issued_at" timestamptz not null default now(),
 "issuer_name" text not null default 'SYNTHETIC TEST'::text,
 "issuer_registration_number" text not null default 'SYNTHETIC TEST'::text,
 "payment_due_date" date,
 "payment_reminder_sent_at" timestamptz,
 "project_code" text not null,
 "project_description" text,
 "project_id" uuid not null,
 "project_title" text not null,
 "quoted_hours" numeric,
 "subtotal_amount" int4 not null,
 "tax_amount" int4 not null,
 "tax_rate" numeric not null default 10.00,
 "total_amount" int4 not null,
 "user_id" uuid not null
);

create table public.project_messages (
 "created_at" timestamptz not null default now(),
 "id" uuid not null default gen_random_uuid(),
 "message" text not null,
 "message_type" text not null default 'message'::text,
 "project_id" uuid not null,
 "read_by_admin_at" timestamptz,
 "read_by_customer_at" timestamptz,
 "sender_type" text not null default 'system'::text,
 "user_id" uuid not null
);

create table public.project_orders (
 "confirmed_deadline" date,
 "created_at" timestamptz not null default now(),
 "customer_address" text,
 "customer_company_name" text,
 "customer_contact_name" text,
 "customer_department_name" text,
 "customer_email" text,
 "customer_phone" text,
 "customer_postal_code" text,
 "id" uuid not null default gen_random_uuid(),
 "order_code" text not null,
 "ordered_at" timestamptz not null,
 "project_code" text not null,
 "project_description" text,
 "project_id" uuid not null,
 "project_title" text not null,
 "quoted_hours" numeric,
 "subtotal_amount" int4 not null,
 "tax_amount" int4 not null,
 "tax_rate" numeric not null default 10.00,
 "total_amount" int4 not null,
 "user_id" uuid not null
);

create table public.projects (
 "archived_at" timestamptz,
 "completed_at" timestamptz,
 "confirmed_deadline" date,
 "created_at" timestamptz not null default now(),
 "description" text,
 "desired_deadline" date,
 "estimate_id" uuid,
 "id" uuid not null default gen_random_uuid(),
 "ordered_at" timestamptz,
 "project_code" text not null,
 "quote_presented_at" timestamptz,
 "quoted_amount" int4,
 "quoted_hours" numeric,
 "status" text not null default 'quote_requested'::text,
 "title" text not null,
 "updated_at" timestamptz not null default now(),
 "user_id" uuid not null
);

alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);

alter table public.project_deliveries add constraint project_deliveries_delivery_code_key UNIQUE (delivery_code);

alter table public.project_deliveries add constraint project_deliveries_pkey PRIMARY KEY (id);

alter table public.project_deliveries add constraint project_deliveries_project_id_key UNIQUE (project_id);

alter table public.project_files add constraint project_files_pkey PRIMARY KEY (id);

alter table public.project_invoices add constraint project_invoices_invoice_code_key UNIQUE (invoice_code);

alter table public.project_invoices add constraint project_invoices_pkey PRIMARY KEY (id);

alter table public.project_invoices add constraint project_invoices_project_id_key UNIQUE (project_id);

alter table public.project_messages add constraint project_messages_pkey PRIMARY KEY (id);

alter table public.project_orders add constraint project_orders_order_code_key UNIQUE (order_code);

alter table public.project_orders add constraint project_orders_pkey PRIMARY KEY (id);

alter table public.project_orders add constraint project_orders_project_id_key UNIQUE (project_id);

alter table public.projects add constraint projects_pkey PRIMARY KEY (id);

alter table public.projects add constraint projects_project_code_key UNIQUE (project_code);

alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.profiles add constraint profiles_role_check CHECK (role = ANY (ARRAY['customer'::text, 'admin'::text]));

alter table public.project_deliveries add constraint project_deliveries_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

alter table public.project_deliveries add constraint project_deliveries_subtotal_amount_check CHECK (subtotal_amount >= 0);

alter table public.project_deliveries add constraint project_deliveries_tax_amount_check CHECK (tax_amount >= 0);

alter table public.project_deliveries add constraint project_deliveries_tax_rate_check CHECK (tax_rate >= 0::numeric);

alter table public.project_deliveries add constraint project_deliveries_total_amount_check CHECK (total_amount >= 0);

alter table public.project_deliveries add constraint project_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.project_files add constraint project_files_file_type_check CHECK (file_type = ANY (ARRAY['reference'::text, 'review'::text, 'revision'::text, 'delivery'::text]));

alter table public.project_files add constraint project_files_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

alter table public.project_files add constraint project_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.project_invoices add constraint project_invoices_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

alter table public.project_invoices add constraint project_invoices_subtotal_amount_check CHECK (subtotal_amount >= 0);

alter table public.project_invoices add constraint project_invoices_tax_amount_check CHECK (tax_amount >= 0);

alter table public.project_invoices add constraint project_invoices_tax_rate_check CHECK (tax_rate >= 0::numeric);

alter table public.project_invoices add constraint project_invoices_total_amount_check CHECK (total_amount >= 0);

alter table public.project_invoices add constraint project_invoices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.project_messages add constraint project_messages_message_type_check CHECK (message_type = ANY (ARRAY['message'::text, 'revision_request'::text, 'approval'::text, 'system'::text]));

alter table public.project_messages add constraint project_messages_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

alter table public.project_messages add constraint project_messages_sender_type_check CHECK (sender_type = ANY (ARRAY['customer'::text, 'admin'::text, 'system'::text]));

alter table public.project_messages add constraint project_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.project_orders add constraint project_orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

alter table public.project_orders add constraint project_orders_subtotal_amount_check CHECK (subtotal_amount >= 0);

alter table public.project_orders add constraint project_orders_tax_amount_check CHECK (tax_amount >= 0);

alter table public.project_orders add constraint project_orders_tax_rate_check CHECK (tax_rate >= 0::numeric);

alter table public.project_orders add constraint project_orders_total_amount_check CHECK (total_amount >= 0);

alter table public.project_orders add constraint project_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

alter table public.projects add constraint projects_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE SET NULL;

alter table public.projects add constraint projects_status_check CHECK (status = ANY (ARRAY['quote_requested'::text, 'quote_reviewing'::text, 'quote_presented'::text, 'ordered'::text, 'in_production'::text, 'customer_review'::text, 'revision'::text, 'approved'::text, 'delivered'::text, 'invoice_requested'::text, 'invoiced'::text, 'completed'::text, 'cancelled'::text]));

alter table public.projects add constraint projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

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

CREATE OR REPLACE FUNCTION public.decline_project_order(p_project_id uuid)
 RETURNS projects
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project public.projects;
begin
  select *
    into v_project
    from public.projects
   where id = p_project_id
   for update;

  if not found then
    raise exception 'Project not found';
  end if;

  -- お客様本人の案件だけ操作可能
  if v_project.user_id <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  -- 正式見積り提示後、まだ発注していない案件だけ
  if v_project.status <> 'quote_presented' then
    raise exception 'Only quote_presented projects can be declined';
  end if;

  update public.projects
     set status = 'cancelled',
         updated_at = now()
   where id = p_project_id
   returning * into v_project;

  return v_project;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.protect_profile_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.role is distinct from old.role then
    if auth.role() is distinct from 'service_role' then
      raise exception 'プロフィールの管理者権限は変更できません';
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_profile_role_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.role() is distinct from 'service_role' then
    new.role := 'customer';
  end if;

  return new;
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

alter table public.profiles enable row level security;

grant insert,select,update,truncate,references,trigger on public.profiles to authenticated;

grant truncate,references,trigger on public.profiles to anon;

grant select,truncate,references,trigger on public.profiles to service_role;

alter table public.project_deliveries enable row level security;

grant select,truncate,references,trigger on public.project_deliveries to authenticated;

grant truncate,references,trigger on public.project_deliveries to anon;

grant truncate,references,trigger on public.project_deliveries to service_role;

alter table public.project_files enable row level security;

grant insert,select,truncate,references,trigger on public.project_files to authenticated;

grant truncate,references,trigger on public.project_files to anon;

grant insert,select,update,delete,truncate,references,trigger on public.project_files to service_role;

alter table public.project_invoices enable row level security;

grant select,truncate,references,trigger on public.project_invoices to authenticated;

grant truncate,references,trigger on public.project_invoices to anon;

grant select,update,truncate,references,trigger on public.project_invoices to service_role;

alter table public.project_messages enable row level security;

grant insert,select,update,truncate,references,trigger on public.project_messages to authenticated;

grant truncate,references,trigger on public.project_messages to anon;

grant truncate,references,trigger on public.project_messages to service_role;

alter table public.project_orders enable row level security;

grant select,truncate,references,trigger on public.project_orders to authenticated;

grant truncate,references,trigger on public.project_orders to anon;

grant truncate,references,trigger on public.project_orders to service_role;

alter table public.projects enable row level security;

grant insert,select,update,truncate,references,trigger on public.projects to authenticated;

grant truncate,references,trigger on public.projects to anon;

grant select,truncate,references,trigger on public.projects to service_role;

create policy "Admins can view all profiles" on public.profiles for SELECT to authenticated using (is_admin());

create policy "Users can update own profile" on public.profiles for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = id)) with check ((( SELECT auth.uid() AS uid) = id));

create policy "Users can view own profile" on public.profiles for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = id));

create policy "Admins can view all project deliveries" on public.project_deliveries for SELECT to authenticated using (is_admin());

create policy "Customers can view own project deliveries" on public.project_deliveries for SELECT to authenticated using ((user_id = auth.uid()));

create policy "Admins can add project files" on public.project_files for INSERT to authenticated with check ((is_admin() AND (uploaded_by = auth.uid())));

create policy "Admins can view all project files" on public.project_files for SELECT to authenticated using (is_admin());

create policy "Users can add own project reference files" on public.project_files for INSERT to authenticated with check (((uploaded_by = auth.uid()) AND (file_type = 'reference'::text) AND (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_files.project_id) AND (projects.user_id = auth.uid()))))));

create policy "Users can delete own project reference files" on public.project_files for DELETE to authenticated using (((uploaded_by = auth.uid()) AND (file_type = 'reference'::text)));

create policy "Users can view own project files" on public.project_files for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_files.project_id) AND (projects.user_id = auth.uid())))));

create policy "Admins can view all project invoices" on public.project_invoices for SELECT to authenticated using (is_admin());

create policy "Customers can view own project invoices" on public.project_invoices for SELECT to authenticated using ((user_id = auth.uid()));

create policy "Admins can add project messages" on public.project_messages for INSERT to authenticated with check ((is_admin() AND (user_id = auth.uid())));

create policy "Admins can mark project messages read" on public.project_messages for UPDATE to authenticated using (is_admin()) with check (is_admin());

create policy "Admins can view all project messages" on public.project_messages for SELECT to authenticated using (is_admin());

create policy "Users can add own project messages" on public.project_messages for INSERT to authenticated with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_messages.project_id) AND (projects.user_id = auth.uid()))))));

create policy "Users can mark own project messages read" on public.project_messages for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_messages.project_id) AND (projects.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_messages.project_id) AND (projects.user_id = auth.uid())))));

create policy "Users can view own project messages" on public.project_messages for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = project_messages.project_id) AND (projects.user_id = auth.uid())))));

create policy "Admins can view all project orders" on public.project_orders for SELECT to authenticated using (is_admin());

create policy "Customers can view own project orders" on public.project_orders for SELECT to authenticated using ((user_id = auth.uid()));

create policy "Admins can update all projects" on public.projects for UPDATE to authenticated using (is_admin()) with check (is_admin());

create policy "Admins can view all projects" on public.projects for SELECT to authenticated using (is_admin());

create policy "Users can create own projects" on public.projects for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "Users can view own projects" on public.projects for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER protect_profile_role_insert_trigger BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION protect_profile_role_insert();

CREATE TRIGGER protect_profile_role_trigger BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION protect_profile_role();

CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
