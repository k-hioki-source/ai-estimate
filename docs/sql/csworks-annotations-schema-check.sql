-- READ ONLY: one result set, schema metadata only; no customer rows.
select 'column' as kind, table_name as target,
  jsonb_build_object('column',column_name,'type_schema',udt_schema,'type',udt_name,
    'nullable',is_nullable,'default',column_default) as details
from information_schema.columns
where table_schema='public'
  and table_name in ('projects','project_files','project_messages')
union all
select 'trigger', c.relname,
  jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
    'trigger',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid))
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in ('projects','project_files','project_messages')
  and not t.tgisinternal
union all
select 'policy', tablename,
  jsonb_build_object('name',policyname,'command',cmd,'roles',roles,
    'using',qual,'check',with_check)
from pg_policies
where schemaname='public'
  and tablename in ('projects','project_files','project_messages')
order by kind,target;
