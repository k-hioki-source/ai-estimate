// Build one reviewed, atomic SQL script for the empty dedicated test project.
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
let migration=read('supabase/migrations/20261026_image_annotations.sql');
if(!migration.includes('\nbegin;\n')||!migration.endsWith('commit;\n'))throw Error('Migration transaction structure changed; review generator');
migration=migration.replace('\nbegin;\n','\n').replace(/commit;\n$/,'');
const sql=`-- CS Works IMAGE ANNOTATIONS TEST SETUP ONLY (2026-10-26)
-- Dashboard must show cs-works-test / jjiebuuasaimaqemhiua.
-- Target URL: https://jjiebuuasaimaqemhiua.supabase.co
-- This script cannot infer the dashboard project from SQL. Verify the dashboard before Run.
-- Empty-public-schema / empty-auth guards reject the populated production project and repeat runs.
-- No customer data is copied. Test accounts and projects are created separately after this script.
begin;
do $$ begin
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')) or
    exists(select 1 from auth.users) or exists(select 1 from storage.buckets) then
  raise exception 'STOP: dedicated EMPTY test project required. Do not run against cs-works or repeat this setup.';
 end if;
end $$;
`+[
'scripts/fixtures/csworks-annotation-test-base.sql',
'scripts/fixtures/csworks-existing-review-schema.sql',
'scripts/fixtures/csworks-existing-review-functions.sql',
'scripts/fixtures/csworks-annotation-test-access.sql'
].map(p=>'\n-- Source: '+p+'\n'+read(p)).join('\n')+
'\n-- Source: supabase/migrations/20261026_image_annotations.sql (same body, enclosed in outer transaction)\n'+migration+
"\ncommit;\nselect project_ref,'TEST_SETUP_READY' as result from public.csworks_annotation_test_environment;\n";
fs.writeFileSync('docs/sql/csworks-annotations-test-setup.sql',sql);
console.log('Generated docs/sql/csworks-annotations-test-setup.sql ('+sql.split('\n').length+' lines)');
