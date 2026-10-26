-- READ ONLY: run each SELECT separately in the intended Supabase project.
-- Do not paste API keys, JWTs, SMTP passwords or customer rows into reports.
-- No writes, grants, policy changes, DDL or application functions are executed.

-- 1. Required tables and RLS state; missing table => investigate, do not auto-create.
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'profiles','projects','project_files','project_file_shares',
  'project_file_retention_holds','project_file_retention_jobs',
  'project_file_retention_deletion_logs') and c.relkind in ('r','p')
order by c.relname;

-- 2. Column definitions (metadata only).
select table_name,column_name,data_type,is_nullable
from information_schema.columns
where table_schema='public' and table_name in (
 'project_file_shares','project_file_retention_holds',
 'project_file_retention_jobs','project_file_retention_deletion_logs')
order by table_name,ordinal_position;

-- 3. PK, UNIQUE, FK, CHECK constraints; verify share token_hash UNIQUE,
-- expires_at NOT NULL (query 2), holds project_id PK/UNIQUE.
select c.relname as table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
 'project_file_shares','project_file_retention_holds')
order by c.relname,con.conname;

-- 4. Effective table privileges including inherited/PUBLIC grants.
-- shares/holds should not be directly readable/writable by anon/authenticated.
select r.role_name,t.table_name,
 has_table_privilege(r.role_name,format('public.%I',t.table_name),'SELECT') as can_select,
 has_table_privilege(r.role_name,format('public.%I',t.table_name),'INSERT') as can_insert,
 has_table_privilege(r.role_name,format('public.%I',t.table_name),'UPDATE') as can_update,
 has_table_privilege(r.role_name,format('public.%I',t.table_name),'DELETE') as can_delete
from (values ('anon'),('authenticated'),('service_role')) r(role_name)
cross join information_schema.tables t
where t.table_schema='public' and t.table_name in (
 'project_file_shares','project_file_retention_holds',
 'project_file_retention_jobs','project_file_retention_deletion_logs')
order by t.table_name,r.role_name;

-- 5. Actual project/file/profile and Storage policies.
-- Review UPDATE WITH CHECK: customers must not elevate profiles.role to admin.
-- Merely enabling RLS or denying one project page does not prove this property.
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where (schemaname='public' and tablename in ('profiles','projects','project_files'))
   or (schemaname='storage' and tablename='objects')
order by schemaname,tablename,policyname;

-- 6. Column/table update grants relevant to profiles.role.
select grantee,privilege_type from information_schema.table_privileges
where table_schema='public' and table_name='profiles'
  and grantee in ('anon','authenticated') order by grantee,privilege_type;
select grantee,column_name,privilege_type from information_schema.column_privileges
where table_schema='public' and table_name='profiles'
  and grantee in ('anon','authenticated') and privilege_type='UPDATE'
order by grantee,column_name;

-- 7. Bucket metadata only (no object listing or customer data).
select id,public from storage.buckets
where id in ('project-files','estimate-images') order by id;
