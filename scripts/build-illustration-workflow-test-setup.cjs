const fs=require('fs');
const migration=fs.readFileSync('supabase/migrations/20261027010000_illustration_workflow.sql','utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,'');
const guard=`-- TEST ONLY: cs-works-test / jjiebuuasaimaqemhiua. Not Production.
-- Preserves existing accepted quotes, orders, projects, images and annotation history.
-- Does not initialize existing projects; admin explicitly prepares the selected accepted project in the UI.
-- Run the complete script once. Never remove guards to work around an error.
begin;
do $$ begin
 if to_regclass('public.csworks_annotation_test_environment') is null then raise exception 'STOP: dedicated test marker required'; end if;
 if not exists(select 1 from public.csworks_annotation_test_environment where project_ref='jjiebuuasaimaqemhiua') then raise exception 'STOP: wrong test marker'; end if;
 if (select count(*) from auth.users)<>3 or exists(select 1 from auth.users where email is null or email not in ('csworks-admin@example.com','csworks-customer@example.com','csworks-other@example.com')) then raise exception 'STOP: only the three dedicated test users are allowed'; end if;
 if exists(select 1 from public.projects where project_code not like 'TEST-%') then raise exception 'STOP: unexpected project data'; end if;
 if to_regclass('public.project_quotes') is null then raise exception 'STOP: formal quote test setup required first'; end if;
 if to_regclass('public.project_illustrations') is not null then raise exception 'STOP: workflow migration already applied; do not repeat'; end if;
end $$;
`;
fs.writeFileSync('docs/sql/csworks-illustration-workflow-test-setup.sql',guard+'\n'+migration+"\ncommit;\nselect 'ILLUSTRATION_WORKFLOW_TEST_READY' as result;\n");
console.log('Built guarded test-only workflow migration; no remote execution.');
