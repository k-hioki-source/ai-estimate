// Generates only the three reviewed additive migrations, never the test setup or test invoice RPC.
const fs=require('fs');const snapshot=JSON.parse(fs.readFileSync('scripts/fixtures/csworks-production-release-fingerprints.json','utf8'));
const files=['20261026140000_formal_quote_items.sql','20261027010000_illustration_workflow.sql','20261027020000_illustration_delivery.sql'];
const guard=`-- PRODUCTION: cs-works / tnswnyegvepundtepfqn. Reviewed metadata 2026-10-27.
-- Run the complete script once in that project's SQL Editor. Never remove a failed guard.
-- Adds formal quote items, per-illustration reviews and final-delivery mapping.
-- Preserves existing customer/project/document/file rows. No test seeds or invoice-RPC replacement.
-- Fingerprints normalize CRLF to LF; all other source content must match.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $$
declare name text; item record;
begin
 if to_regclass('public.csworks_annotation_test_environment') is not null then raise exception 'STOP: this is a marked test database; use the test setup instead'; end if;
 foreach name in array array['project_quotes','project_quote_items','project_illustrations','project_illustration_versions','project_illustration_operations','project_delivery_assets'] loop
  if to_regclass('public.'||name) is not null then raise exception 'STOP: % already exists; inspect applied migrations rather than repeat',name; end if;
 end loop;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name in ('formal_quote_id','illustration_workflow')) then raise exception 'STOP: partial installation; inspect first'; end if;
 foreach name in array array['projects','profiles','project_orders','project_deliveries','project_invoices','project_messages','project_files','project_review_batches','project_review_batch_files','project_file_annotations'] loop
  if to_regclass('public.'||name) is null then raise exception 'STOP: required table % is missing',name; end if;
 end loop;
 if to_regclass('storage.objects') is null or to_regclass('public.project_review_one_open') is null or not exists(select 1 from pg_catalog.pg_constraint where conrelid='public.project_review_batches'::regclass and conname='project_review_batches_message_id_key' and contype='u') then raise exception 'STOP: annotation schema differs from reviewed prerequisites'; end if;
 for item in select * from jsonb_to_recordset($fingerprints$${JSON.stringify(snapshot.functions)}$fingerprints$::jsonb) as x(signature text,source_md5 text) loop
  if to_regprocedure(item.signature) is null then raise exception 'STOP: required function % is missing',item.signature; end if;
  if (select md5(replace(p.prosrc,E'\\r\\n',E'\\n')) from pg_catalog.pg_proc p where p.oid=to_regprocedure(item.signature)) is distinct from item.source_md5 then raise exception 'STOP: definition of % changed; repeat metadata review',item.signature; end if;
 end loop;
 if not has_function_privilege('authenticated','public.request_project_invoice(uuid)','EXECUTE') or has_function_privilege('anon','public.request_project_invoice(uuid)','EXECUTE') then raise exception 'STOP: invoice request privileges differ from reviewed configuration'; end if;
end $$;
`;
const stages=files.map((name,i)=>`\n-- Stage ${i+1}: ${name}\n`+fs.readFileSync('supabase/migrations/'+name,'utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,'').replace(/^-- DRAFT:.*\n/gm,'').replace(/^-- Additive: test DB first.*\n/gm,''));
const end=`
-- Refresh PostgREST after all schema changes commit together.
notify pgrst, 'reload schema';
commit;
select 'MULTI_ILLUSTRATION_PRODUCTION_READY' as result;
`;
fs.writeFileSync('docs/sql/csworks-multi-illustration-production-setup.sql',guard+stages.join('\n')+end);
console.log('Built guarded Production bundle; no remote execution.');
