// Builds an upgrade for the already-created, dedicated annotation test environment ONLY.
const fs=require('fs');const fixture=fs.readFileSync('scripts/fixtures/csworks-formal-quotes-existing.sql','utf8');
let out=`-- TEST ONLY. Dashboard must show cs-works-test / jjiebuuasaimaqemhiua.
-- Never run on cs-works. Refuses missing test marker, non-test accounts, nonempty documents, repeat runs.
-- Extends empty synthetic document tables; preserves existing annotation tests and files.
-- This is not a Production migration. Run as one script, not selected statements.
begin;
do $$ begin
 if to_regclass('public.csworks_annotation_test_environment') is null then raise exception 'STOP: annotation test environment marker required'; end if;
 if not exists(select 1 from public.csworks_annotation_test_environment where project_ref='jjiebuuasaimaqemhiua') then raise exception 'STOP: wrong test marker'; end if;
 if exists(select 1 from auth.users where email is null or email not in ('csworks-admin@example.com','csworks-customer@example.com','csworks-other@example.com')) or (select count(*) from auth.users)<>3 then raise exception 'STOP: exactly the three dedicated test users are required'; end if;
 if exists(select 1 from public.projects where project_code not like 'TEST-%') then raise exception 'STOP: unexpected project data'; end if;
 if exists(select 1 from public.project_orders) or exists(select 1 from public.project_deliveries) or exists(select 1 from public.project_invoices) then raise exception 'STOP: synthetic document tables must be empty'; end if;
 if to_regclass('public.project_quotes') is not null then raise exception 'STOP: quote setup already applied; do not repeat'; end if;
end $$;
`;
for(const table of ['project_orders','project_deliveries','project_invoices']){
 const block=fixture.match(new RegExp('create table public\\.'+table+' \\(\\n([\\s\\S]*?)\\n\\);'));
 if(!block)throw Error('Missing '+table);
 for(const line of block[1].split('\n')){
  const col=line.trim().replace(/,$/,'');out+=`alter table public.${table} add column if not exists ${col};\n`;
  const name=col.match(/^"([^"]+)"/)[1];if(col.includes(' not null'))out+=`alter table public.${table} alter column "${name}" set not null;\n`;
 }
 for(const match of fixture.matchAll(new RegExp('alter table public\\.'+table+' add constraint (\\S+) ([^;]+);','g'))){
  out+=`do $$ begin if not exists(select 1 from pg_constraint where conrelid='public.${table}'::regclass and conname='${match[1]}') then alter table public.${table} add constraint ${match[1]} ${match[2]}; end if; end $$;\n`;
 }
}
for(const name of ['is_admin','order_project','deliver_project','complete_project','confirm_project_payment']){
 const match=fixture.match(new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\([\\s\\S]*?\\$function\\$;'));
 if(!match)throw Error('Missing '+name);out+='\n'+match[0]+'\n';
 out+=`revoke all on function public.${name}(${name==='is_admin'?'':'uuid'}) from public,anon,service_role;\ngrant execute on function public.${name}(${name==='is_admin'?'':'uuid'}) to authenticated;\n`;
}
let migration=fs.readFileSync('supabase/migrations/20261026140000_formal_quote_items.sql','utf8');
migration=migration.replace(/^begin;$/m,'').replace(/^commit;$/m,'');out+='\n'+migration;
out+=`
insert into public.projects(id,user_id,project_code,title,description,status)
select 'c5200000-0000-4000-8000-000000000001'::uuid,id,'TEST-QUOTE-A','複数枚正式見積りテストA','専用テスト案件。実顧客データではありません。','quote_requested' from auth.users where email='csworks-customer@example.com';
insert into public.projects(id,user_id,project_code,title,description,status)
select 'c5200000-0000-4000-8000-000000000002'::uuid,id,'TEST-QUOTE-B','複数枚正式見積りテストB','別顧客の権限確認用。','quote_requested' from auth.users where email='csworks-other@example.com';
commit;
select 'FORMAL_QUOTE_TEST_READY' as result;
`;
fs.writeFileSync('docs/sql/csworks-formal-quotes-test-setup.sql',out);
console.log('Built dedicated-test upgrade (no external execution).');
