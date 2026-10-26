-- READ ONLY. Return definitions/metadata only. Run before reviewing/applying the draft migration.
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,p.proconfig,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('request_project_revision','approve_project','is_admin');
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('projects','project_files','project_messages') order by table_name,ordinal_position;
select tablename,policyname,cmd,roles,qual,with_check from pg_policies
where schemaname='public' and tablename in ('projects','project_files','project_messages');
select c.relname,t.tgname,pg_get_triggerdef(t.oid),pg_get_functiondef(t.tgfoid)
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('projects','project_files','project_messages') and not t.tgisinternal;
