const fs=require('fs'),vm=require('vm');let source=fs.readFileSync('scripts/test-illustration-workflow-test-setup.cjs','utf8');
source=source.replace(' await db.close();console.log',`
 await db.exec('reset role');
 await db.exec(fs.readFileSync('docs/sql/csworks-illustration-delivery-test-setup.sql','utf8'));
 const fix=fs.readFileSync('docs/sql/csworks-test-invoice-request-fix.sql','utf8');
 const projectBefore=JSON.stringify(await q('select * from projects order by id'));
 await check('test setup reproduces missing invoice request function',async()=>assert.equal((await q("select to_regprocedure('public.request_project_invoice(uuid)') is not null as present"))[0].present,false));
 await check('complement installs RPC without changing projects or orders',async()=>{await db.exec(fix);assert.equal(JSON.stringify(await q('select * from projects order by id')),projectBefore);assert.equal(JSON.stringify(await q('select * from project_orders')),orderBefore)});
 await check('only authenticated role receives invoice request execute privilege',async()=>{assert.equal((await q("select has_function_privilege('authenticated','public.request_project_invoice(uuid)','EXECUTE') as allowed"))[0].allowed,true);for(const role of ['anon','service_role'])assert.equal((await q("select has_function_privilege($1,'public.request_project_invoice(uuid)','EXECUTE') as allowed",[role]))[0].allowed,false)});
 const definition=(await q("select pg_get_functiondef('public.request_project_invoice(uuid)'::regprocedure) as def"))[0].def;
 await check('repeat fix refuses to replace an existing function',async()=>{await assert.rejects(()=>db.exec(fix));await db.exec('rollback');assert.equal((await q("select pg_get_functiondef('public.request_project_invoice(uuid)'::regprocedure) as def"))[0].def,definition)});
 await check('missing environment marker refuses setup',async()=>{await db.exec('begin;alter table csworks_annotation_test_environment rename to hidden_marker');await assert.rejects(()=>db.exec(fix));await db.exec('rollback')});
 await db.exec('set role anon');
 await check('anonymous caller cannot execute request function',async()=>{await assert.rejects(()=>q('select * from request_project_invoice($1)',[pid]),{code:'42501'})});
 await db.close();console.log`);
source=source.replace(' workflow setup checks passed.',' workflow + invoice complement setup checks passed.');
vm.runInThisContext('(function(require){'+source+'\n})',{filename:__filename})(require);
