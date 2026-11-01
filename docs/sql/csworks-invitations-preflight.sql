-- READ ONLY. No auth accounts, data, policies or settings are changed.
begin read only;
select current_database(), current_user, now();
select name, to_regprocedure(name) as installed from unnest(array[
 'public.order_project(uuid)', 'public.csworks_save_quote(uuid,uuid,uuid,integer,date,jsonb,boolean,uuid)',
 'public.csworks_order_quote(uuid,uuid,uuid)', 'public.is_admin()',
 'public.csworks_guard_direct_project()', 'public.csworks_guard_message_update()',
 'public.csworks_accept_invitation(text)']) name;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('projects','project_messages','project_files','profiles','project_quotes')
   or schemaname='storage' and tablename='objects' order by schemaname,tablename,policyname;
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name in ('projects','project_messages','project_files','profiles') order by table_name,grantee;
select event_object_table,trigger_name,action_statement from information_schema.triggers
where event_object_schema='public' and event_object_table in ('projects','project_messages','project_files','profiles');
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id in ('project-files','estimate-images');
-- Release blocker: pending legacy quotes lack immutable evidence until admin re-presents.
-- Review these actual cases; never blindly attest/backfill from customer-writable columns.
select id,project_code,status from public.projects where formal_quote_id is null and status='quote_presented';
-- Historical invalid paths must be reviewed; this query does NOT alter or delete them.
select id,project_id from public.project_files where split_part(storage_path,'/',1)<>project_id::text or storage_path ~ '(^|/)\.\.?(/|$)|\\|//';
rollback;
