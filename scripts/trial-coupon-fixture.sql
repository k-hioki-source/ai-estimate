-- Isolated coupon regression fixture. NEVER run against production.
do $$ begin if current_database()<>'coupon_ci' then raise exception 'Fixture requires coupon_ci'; end if; end $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create table auth.users(id uuid primary key,email text,created_at timestamptz not null default clock_timestamp(),email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
create table public.profiles(id uuid primary key references auth.users,company_name text,department_name text,contact_name text,email text,phone text,postal_code text,address text,role text not null default 'customer',created_at timestamptz default clock_timestamp(),updated_at timestamptz default clock_timestamp());
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
create function public.handle_new_user() returns trigger language plpgsql security definer as $$ begin insert into public.profiles(id,email) values(new.id,new.email);return new;end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create table public.projects(id uuid primary key default gen_random_uuid(),project_code text not null default gen_random_uuid()::text,user_id uuid references auth.users,title text not null,description text,status text not null default 'quote_requested',quoted_amount integer,quoted_hours numeric,confirmed_deadline date,quote_presented_at timestamptz,ordered_at timestamptz,completed_at timestamptz,created_at timestamptz default clock_timestamp(),updated_at timestamptz default clock_timestamp());
create table public.project_orders(id uuid primary key default gen_random_uuid(),project_id uuid not null unique references public.projects,user_id uuid not null,order_code text,project_code text,project_title text,project_description text,customer_company_name text,customer_department_name text,customer_contact_name text,customer_email text,customer_phone text,customer_postal_code text,customer_address text,subtotal_amount integer not null,tax_rate numeric not null default 10,tax_amount integer not null,total_amount integer not null,quoted_hours numeric,confirmed_deadline date,ordered_at timestamptz not null default clock_timestamp(),created_at timestamptz default clock_timestamp());
create table public.project_deliveries(like public.project_orders including defaults);
alter table public.project_deliveries add primary key(id), add unique(project_id), add column delivery_code text,add column delivered_at timestamptz not null default clock_timestamp();
create table public.project_invoices(like public.project_orders including defaults);
alter table public.project_invoices add primary key(id), add unique(project_id);
create table public.project_files(id uuid primary key default gen_random_uuid(),project_id uuid references public.projects,file_type text);
-- Materialization of illustration tasks belongs to the existing workflow and is
-- stubbed in this isolated fixture. Hosted workflow integration is a separate check.
create function public.csworks_materialize_illustrations(uuid) returns void language plpgsql as $$ begin return;end $$;
create function public.order_project(p_project_id uuid) returns public.projects language plpgsql security definer set search_path='' as $$
declare p public.projects%rowtype; pr public.profiles%rowtype;
begin
 select * into p from public.projects where id=p_project_id for update;
 if auth.uid() is null or p.user_id is distinct from auth.uid() or p.status<>'quote_presented' then raise exception 'Not authorized' using errcode='42501';end if;
 select * into pr from public.profiles where id=p.user_id;
 insert into public.project_orders(project_id,user_id,order_code,project_code,project_title,project_description,customer_company_name,subtotal_amount,tax_amount,total_amount,quoted_hours,confirmed_deadline)
 values(p.id,p.user_id,'ORD-CI-'||p.id,p.project_code,p.title,p.description,pr.company_name,p.quoted_amount,floor(p.quoted_amount::numeric/10),p.quoted_amount+floor(p.quoted_amount::numeric/10),p.quoted_hours,p.confirmed_deadline);
 update public.projects set status='ordered',ordered_at=clock_timestamp() where id=p.id returning * into p;
 return p;
end $$;
