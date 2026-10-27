-- CS Works multi-illustration Production preflight: metadata only, 2026-10-27.
-- Run in Supabase SQL Editor for the existing cs-works project.
-- Does NOT read customer rows, or create/update/delete any DB objects or data.
-- Returns one result set, suitable for Download CSV.
with target_tables as (
  select c.oid, n.nspname, c.relname
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ('projects','profiles','project_orders','project_deliveries',
      'project_invoices','project_messages','project_files','project_quotes','project_quote_items',
      'project_illustrations','project_illustration_versions','project_illustration_operations',
      'project_delivery_assets','project_review_batches','project_review_batch_files','project_file_annotations')
    and c.relkind in ('r','p')
), relevant_functions as (
  select p.oid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and (
      p.proname in ('order_project','deliver_project','complete_project',
        'confirm_project_payment','request_project_invoice','approve_project','request_project_revision','is_admin')
      or p.proname in ('csworks_can_read_review','csworks_track_review_status','csworks_start_review','csworks_submit_review','csworks_save_annotations')
      or p.prosrc ~* '(project_orders|project_deliveries|project_invoices|quoted_amount|quote_presented)'
      or p.oid in (
        select t.tgfoid from pg_catalog.pg_trigger t
        where t.tgrelid in (select oid from target_tables) and not t.tgisinternal
      )
    )
), metadata as (
  select 'column'::text as kind,
    c.table_name||'.'||c.column_name as object_name,
    jsonb_build_object('type',c.data_type,'udt_schema',c.udt_schema,
      'udt_name',c.udt_name,'nullable',c.is_nullable,'default',c.column_default,
      'precision',c.numeric_precision,'scale',c.numeric_scale,
      'identity',c.is_identity,'generated',c.is_generated)::text as definition
  from information_schema.columns c
  where c.table_schema='public' and c.table_name in (select relname from target_tables)
  union all
  select 'constraint',t.relname||'.'||c.conname,pg_catalog.pg_get_constraintdef(c.oid,true)
  from pg_catalog.pg_constraint c join target_tables t on t.oid=c.conrelid
  union all
  select 'index',t.relname||'.'||i.relname,pg_catalog.pg_get_indexdef(x.indexrelid)
  from pg_catalog.pg_index x join target_tables t on t.oid=x.indrelid
  join pg_catalog.pg_class i on i.oid=x.indexrelid
  union all
  select 'table_security',t.relname,
    jsonb_build_object('rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
      'grants',c.relacl::text)::text
  from target_tables t join pg_catalog.pg_class c on c.oid=t.oid
  union all
  select 'policy',p.tablename||'.'||p.policyname,
    jsonb_build_object('command',p.cmd,'roles',p.roles,
      'using',p.qual,'with_check',p.with_check)::text
  from pg_catalog.pg_policies p
  where p.schemaname='public' and p.tablename in (select relname from target_tables)
  union all
  select 'trigger',t.relname||'.'||g.tgname,pg_catalog.pg_get_triggerdef(g.oid,true)
  from pg_catalog.pg_trigger g join target_tables t on t.oid=g.tgrelid
  where not g.tgisinternal
  union all
  select 'function',p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')',
    pg_catalog.pg_get_functiondef(p.oid)
  from pg_catalog.pg_proc p where p.oid in (select oid from relevant_functions)
  union all
  select 'function_security',
    p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')',
    jsonb_build_object('security_definer',p.prosecdef,'config',p.proconfig,
      'grants',p.proacl::text,'owner',pg_catalog.pg_get_userbyid(p.proowner),
      'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
      'service_role_execute',has_function_privilege('service_role',p.oid,'EXECUTE'))::text
  from pg_catalog.pg_proc p where p.oid in (select oid from relevant_functions)
)
select kind,object_name,definition from metadata
union all
select 'installation',name,jsonb_build_object('exists',to_regclass('public.'||name) is not null)::text
from unnest(array['project_quotes','project_quote_items','project_illustrations','project_illustration_versions','project_delivery_assets','project_review_batches','project_review_batch_files','project_file_annotations','csworks_annotation_test_environment']) as names(name)
union all
select 'required_function',name,jsonb_build_object('exists',to_regprocedure('public.'||name||'(uuid)') is not null)::text
from unnest(array['order_project','deliver_project','complete_project','confirm_project_payment','request_project_invoice']) as names(name)
union all
select 'storage_policy',p.tablename||'.'||p.policyname,
 jsonb_build_object('command',p.cmd,'roles',p.roles,'using',p.qual,'with_check',p.with_check)::text
from pg_catalog.pg_policies p where p.schemaname='storage' and p.tablename='objects'
order by kind,object_name;
