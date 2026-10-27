const fs=require('fs'),vm=require('vm');let source=fs.readFileSync('scripts/test-illustration-workflow-test-setup.cjs','utf8');
source=source.replace(' await db.close();console.log',`
 await db.exec('reset role');
 const deliverySetup=fs.readFileSync('docs/sql/csworks-illustration-delivery-test-setup.sql','utf8');
 const before=JSON.stringify(await q('select * from project_illustrations order by id'));
 await check('delivery setup preserves accepted quote/order and existing illustration rows',async()=>{await db.exec(deliverySetup);assert.equal(JSON.stringify(await q('select * from project_orders')),orderBefore);assert.equal(JSON.stringify(await q('select * from project_illustrations order by id')),before);assert.equal((await q('select count(*)::int n from project_delivery_assets'))[0].n,0)});
 await check('repeat delivery setup rejected without changing orders',async()=>{await assert.rejects(()=>db.exec(deliverySetup));await db.exec('rollback');assert.equal(JSON.stringify(await q('select * from project_orders')),orderBefore)});
 await check('missing marker rejects delivery setup',async()=>{await db.exec('begin;alter table csworks_annotation_test_environment rename to hidden_marker');await assert.rejects(()=>db.exec(deliverySetup));await db.exec('rollback')});
 await db.close();console.log`);
source=source.replace(' workflow setup checks passed.',' combined workflow + delivery setup checks passed.');
vm.runInThisContext('(function(require){'+source+'\n})',{filename:__filename})(require);
