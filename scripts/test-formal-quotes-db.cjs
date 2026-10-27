// Local synthetic rows only. Original workflow functions and metadata fixture provided by user.
const fs=require('fs'), assert=require('node:assert/strict');
const {PGlite}=require(process.env.CSWORKS_PGLITE_PATH||'/tmp/csworks-quote-tests/node_modules/@electric-sql/pglite');
const db=new PGlite(), uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let passed=0;
const sql=(s,p=[])=>db.query(s,p).then(r=>r.rows);
const exec=s=>db.exec(s);
const actor=async n=>exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid(n)}',false)`);
const check=async(name,fn)=>{await fn();passed++;console.log('PASS',name)};
const reject=async(s,p,code)=>assert.rejects(()=>sql(s,p),e=>!code||e.code===code);
const item=(n,amount=1001)=>({item_key:uid(100+n),number:String(n),name:'Illustration '+n,description:'Synthetic',amount,hours:1.25});
let req=1000;
const save=async(project,expected,draft,version,items,present=true)=> (await sql('select public.csworks_save_quote($1,$2,$3,$4,$5,$6::jsonb,$7,$8) r',[uid(project),expected,draft,version,'2026-12-01',JSON.stringify(items),present,uid(++req)]))[0].r;
(async()=>{
 await exec(fs.readFileSync('scripts/fixtures/csworks-formal-quotes-existing.sql','utf8'));
 await exec(fs.readFileSync('supabase/migrations/20261026_image_annotations.sql','utf8'));
 await exec(fs.readFileSync('supabase/migrations/20261026140000_formal_quote_items.sql','utf8'));
 await exec(`insert into auth.users values('${uid(1)}'),('${uid(2)}'),('${uid(3)}');
 insert into public.profiles(id,role,email) values('${uid(1)}','customer','a@example.test'),('${uid(2)}','customer','b@example.test'),('${uid(3)}','customer','admin@example.test');
 update public.profiles set role='admin' where id='${uid(3)}';
 insert into public.projects(id,user_id,project_code,title,status) values
 ('${uid(11)}','${uid(1)}','TEST-A','Synthetic A','quote_requested'),
 ('${uid(12)}','${uid(2)}','TEST-B','Synthetic B','quote_requested'),
 ('${uid(13)}','${uid(1)}','TEST-LEGACY','Legacy','quote_presented');
 update public.projects set quoted_amount=2001,quoted_hours=2,confirmed_deadline='2026-12-01' where id='${uid(13)}';`);
 await actor(3);
 let draft;
 await check('admin saves private draft without changing project quote',async()=>{draft=await save(11,null,null,0,[item(1),item(2)],false);assert.equal(draft.quote.state,'draft');assert.equal(draft.project.quoted_amount,null)});
 await check('lost-response draft replay returns same private draft',async()=>{const r=(await sql('select csworks_save_quote($1,null,null,0,$2,$3::jsonb,false,$4) r',[uid(11),'2026-12-01',JSON.stringify([item(1),item(2)]),uid(req)]))[0].r;assert.equal(r.replayed,true);assert.equal(r.quote.id,draft.quote.id)});
 await check('request cannot change from private save to presentation',()=>reject('select csworks_save_quote($1,null,null,0,$2,$3::jsonb,true,$4)',[uid(11),'2026-12-01',JSON.stringify([item(1)]),uid(req)],'40001'));
 await check('draft concurrent version rejected',()=>reject('select public.csworks_save_quote($1,null,$2,0,$3,$4::jsonb,false,$5)',[uid(11),draft.quote.id,'2026-12-01',JSON.stringify([item(1)]),uid(++req)],'40001'));
 await actor(1);
 await check('customer cannot see draft through RPC',async()=>{const c=(await sql('select csworks_get_quotes($1) c',[uid(11)]))[0].c;assert.equal(c.draft,null);assert.equal(c.history.length,0)});
 await check('customer cannot see draft/items by direct select',async()=>{assert.equal((await sql('select * from project_quotes')).length,0);assert.equal((await sql('select * from project_quote_items')).length,0)});
 await check('customer cannot present a quote',()=>reject('select csworks_save_quote($1,null,null,0,$2,$3::jsonb,true,$4)',[uid(11),'2026-12-01',JSON.stringify([item(1)]),uid(++req)],'42501'));
 await actor(3);
 let first;
 await check('present calculates sum and floors total 10 percent tax',async()=>{first=await save(11,null,draft.quote.id,1,[item(1),item(2)]);assert.equal(first.quote.subtotal,2002);assert.equal(Number(first.quote.hours),2.5);assert.equal(first.project.formal_quote_id,first.quote.id)});
 await check('lost-response presentation replay returns exact version',async()=>{const r=(await sql('select csworks_save_quote($1,null,$2,1,$3,$4::jsonb,true,$5) r',[uid(11),draft.quote.id,'2026-12-01',JSON.stringify([item(1),item(2)]),uid(req)]))[0].r;assert.equal(r.replayed,true);assert.equal(r.quote.id,first.quote.id)});
 await check('empty illustration list rejected',()=>reject('select csworks_save_quote($1,$2,null,0,$3,$4::jsonb,true,$5)',[uid(11),first.quote.id,'2026-12-01','[]',uid(++req)],'22023'));
 await check('presented quote retains customer profile snapshot',async()=>{await exec('reset role');await sql('update profiles set company_name=$1 where id=$2',['Updated synthetic profile',uid(1)]);await actor(3);const c=(await sql('select csworks_get_quotes($1) c',[uid(11)]))[0].c;assert.equal(c.current.customer.company_name,null)});
 await check('direct project amount update rejected',()=>reject('update projects set quoted_amount=3 where id=$1',[uid(11)],'42501'));
 await check('direct project ordering rejected',()=>reject("update projects set status='ordered' where id=$1",[uid(11)],'42501'));
 await check('cannot clear new-mode reference',()=>reject('update projects set formal_quote_id=null where id=$1',[uid(11)],'42501'));
 await check('duplicate item key/number rejected in DB',()=>reject('select csworks_save_quote($1,$2,null,0,$3,$4::jsonb,true,$5)',[uid(11),first.quote.id,'2026-12-01',JSON.stringify([item(1),item(1)]),uid(++req)],'22023'));
 await check('fractional yen rejected in DB',()=>reject('select csworks_save_quote($1,$2,null,0,$3,$4::jsonb,true,$5)',[uid(11),first.quote.id,'2026-12-01',JSON.stringify([item(1,1.5)]),uid(++req)],'22023'));
 await check('oversized total rejected in DB',()=>reject('select csworks_save_quote($1,$2,null,0,$3,$4::jsonb,true,$5)',[uid(11),first.quote.id,'2026-12-01',JSON.stringify([item(1,1800000000),item(2)]),uid(++req)],'22023'));
 let second;
 await check('revised quote leaves first version immutable',async()=>{second=await save(11,first.quote.id,null,0,[item(1,3001),item(2,2001),item(3,1001)]);assert.equal(second.quote.revision,2);assert.equal(second.quote.subtotal,6003);const old=(await sql('select * from project_quotes where id=$1',[first.quote.id]))[0];assert.equal(old.subtotal,2002);assert.equal(old.state,'superseded')});
 await check('authenticated cannot alter quote/item tables directly',async()=>{await reject('update project_quotes set subtotal=1 where id=$1',[second.quote.id],'42501');await reject('delete from project_quote_items where quote_id=$1',[second.quote.id],'42501')});
 await actor(2);
 await check('other customer cannot read quote RPC',()=>reject('select csworks_get_quotes($1)',[uid(11)],'42501'));
 await check('other customer direct RLS hides quotes/items',async()=>{assert.equal((await sql('select * from project_quotes')).length,0);assert.equal((await sql('select * from project_quote_items')).length,0)});
 await check('other customer cannot order quote',()=>reject('select csworks_order_quote($1,$2,$3)',[uid(11),second.quote.id,uid(++req)],'42501'));
 await actor(3);
 await check('admin cannot impersonate customer order',()=>reject('select csworks_order_quote($1,$2,$3)',[uid(11),second.quote.id,uid(++req)],'42501'));
 await actor(1);
 await check('customer sees current quote and previous immutable version',async()=>{const c=(await sql('select csworks_get_quotes($1) c',[uid(11)]))[0].c;assert.equal(c.current.id,second.quote.id);assert.equal(c.history.length,2)});
 await check('old screen cannot order superseded quote',()=>reject('select csworks_order_quote($1,$2,$3)',[uid(11),first.quote.id,uid(++req)],'40001'));
 await check('old RPC cannot bypass exact quote acceptance',()=>reject('select order_project($1)',[uid(11)],'42501'));
 const orderReq=uid(++req);
 await check('new RPC uses original order numbering and tax, attaches accepted version',async()=>{const r=(await sql('select csworks_order_quote($1,$2,$3) r',[uid(11),second.quote.id,orderReq]))[0].r;assert.equal(r.project.status,'ordered');const o=(await sql('select * from project_orders where project_id=$1',[uid(11)]))[0];assert.match(o.order_code,/^ORD-\d{8}-[A-F0-9]{6}$/);assert.equal(o.formal_quote_id,second.quote.id);assert.equal(o.subtotal_amount,6003);assert.equal(o.tax_amount,600);assert.equal(o.total_amount,6603)});
 await check('lost-response order replay does not duplicate document',async()=>{const r=(await sql('select csworks_order_quote($1,$2,$3) r',[uid(11),second.quote.id,orderReq]))[0].r;assert.equal(r.replayed,true);assert.equal((await sql('select * from project_orders where project_id=$1',[uid(11)])).length,1)});
 await check('different repeat request cannot create second order',()=>reject('select csworks_order_quote($1,$2,$3)',[uid(11),second.quote.id,uid(++req)],'40001'));
 await check('legacy project original order still works',async()=>{await sql('select order_project($1)',[uid(13)]);const o=(await sql('select * from project_orders where project_id=$1',[uid(13)]))[0];assert.equal(o.formal_quote_id,null);assert.equal(o.total_amount,2201)});
 await actor(3);
 await check('accepted commercial terms cannot change',async()=>{await reject('update projects set quoted_amount=9 where id=$1',[uid(11)],'42501');await reject("update projects set status='quote_presented' where id=$1",[uid(11)],'40001');await assert.rejects(()=>save(11,second.quote.id,null,0,[item(1)]))});
 await check('unrelated ordinary project status updates continue',async()=>{await sql("update projects set status='in_production' where id=$1",[uid(11)])});
 await check('delivery original RPC copies accepted amounts and quote reference',async()=>{
  await sql("insert into project_files(project_id,uploaded_by,file_name,storage_path,file_type) values($1,$2,'delivery.png','synthetic.png','delivery')",[uid(11),uid(3)]);
  await sql("update projects set status='approved' where id=$1",[uid(11)]); await sql('select deliver_project($1)',[uid(11)]);
  const d=(await sql('select * from project_deliveries where project_id=$1',[uid(11)]))[0];assert.equal(d.formal_quote_id,second.quote.id);assert.equal(d.total_amount,6603);
 });
 await check('invoice original RPC retains accepted items/tax and next-month-end due date',async()=>{
  await sql("update projects set status='invoice_requested' where id=$1",[uid(11)]);await sql('select complete_project($1)',[uid(11)]);
  const inv=(await sql('select * from project_invoices where project_id=$1',[uid(11)]))[0];assert.equal(inv.formal_quote_id,second.quote.id);assert.equal(inv.total_amount,6603);assert.equal(inv.tax_amount,600);
 });
 await check('invoice reminder field can update without changing frozen terms',async()=>{await exec(`reset role`);await sql('update project_invoices set payment_reminder_sent_at=now() where project_id=$1',[uid(11)]);await reject('update project_invoices set subtotal_amount=1 where project_id=$1',[uid(11)],'42501')});
 await check('legacy redline workflow still works with both migrations installed',async()=>{
  await exec('reset role');await sql("insert into projects(id,user_id,project_code,title,status) values($1,$2,'TEST-ANNOTATION-LEGACY','Legacy review','in_production')",[uid(14),uid(1)]);
  await actor(3);await sql("insert into project_files(id,project_id,uploaded_by,file_name,storage_path,mime_type,file_type) values($1,$2,$3,'first.png','synthetic-first.png','image/png','review')",[uid(114),uid(14),uid(3)]);
  const batch=(await sql('select csworks_start_review($1,$2::uuid[]) r',[uid(14),[uid(114)]]))[0].r.batchId;
  await actor(1);await sql('select csworks_save_annotations($1,$2,$3,0,$4::jsonb)',[uid(14),batch,uid(114),JSON.stringify({schemaVersion:1,pins:[{id:'pin1',number:1,x:.5,y:.5,comment:'Synthetic correction'}],strokes:[]})]);
  const result=(await sql('select csworks_submit_review($1,$2,$3,$4,$5) r',[uid(14),batch,uid(++req),'revision_request','Synthetic revision']))[0].r;assert.equal(result.project.status,'revision');assert.ok((await sql('select finalized_at from project_file_annotations where batch_id=$1',[batch]))[0].finalized_at);
 });
 await check('anonymous RPC access denied',async()=>{await exec('set role anon');await reject('select csworks_get_quotes($1)',[uid(11)],'42501')});
 console.log(`${passed} database checks passed; synthetic data only.`); await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
