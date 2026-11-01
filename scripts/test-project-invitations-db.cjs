// Isolated in-process PostgreSQL; no remote credentials, real accounts or email.
const fs=require('fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.CSWORKS_PGLITE_PATH||'/tmp/csworks-invitation-tests/node_modules/@electric-sql/pglite');
const db=new PGlite(); const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let passed=0;const q=async(s,p=[])=> (await db.query(s,p)).rows;const ex=s=>db.exec(s);
const actor=async n=>ex(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false)`);
const test=async(n,f)=>{await f();console.log('PASS',n);passed++};const deny=async(s,p=[],code='42501')=>assert.rejects(()=>q(s,p),e=>e.code===code);
const item={item_key:id(90),number:'01',name:'側面図',description:'試験データ',amount:9000,hours:3};
const fields={company_name:'合成テスト会社',contact_name:'顧客A',email:'a@example.test',title:'管理者登録試験',description:'合成データのみ',production_category:'photo_trace',quote_items:[item],quote_deadline:'2026-12-01'};
async function create(data=fields){return (await q('select csworks_save_intake(null,0,$1::jsonb) r',[JSON.stringify(data)]))[0].r}
async function issue(i,hash='a'.repeat(64)){await ex('reset role;set role service_role');return (await q('select csworks_issue_invitation($1,$2,$3,$4) r',[i.id,i.version,id(3),hash]))[0].r}
async function finish(v){await q("select csworks_finish_invitation($1,'captured',null)",[v.id])}
async function accept(hash='a'.repeat(64)){return (await q('select csworks_accept_invitation($1) r',[hash]))[0].r}
(async()=>{
 await ex(fs.readFileSync('scripts/fixtures/csworks-formal-quotes-existing.sql','utf8'));
 await ex(`alter table public.estimates add user_id uuid;alter table auth.users add email text;alter table auth.users add email_confirmed_at timestamptz;
 create schema storage;create table storage.objects(id uuid,bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 insert into auth.users values('${id(1)}','a@example.test',now()),('${id(2)}','b@example.test',now()),('${id(3)}','admin@example.test',now()),('${id(4)}','unconfirmed@example.test',null);
 insert into profiles(id,role,email) values('${id(1)}','customer','spoof@example.test'),('${id(2)}','customer','a@example.test'),('${id(3)}','customer','admin@example.test'),('${id(4)}','customer','unconfirmed@example.test');
 update profiles set role='admin' where id='${id(3)}';`);
 await ex(fs.readFileSync('scripts/fixtures/csworks-production-storage-policies.sql','utf8'));
 for(const file of ['20261026_image_annotations.sql','20261026140000_formal_quote_items.sql','20261027010000_illustration_workflow.sql','20261027020000_illustration_delivery.sql','20261101000000_project_access_hardening.sql','20261101010000_admin_project_invitations.sql'])await ex(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await actor(1);
 await test('customer cannot create intake',()=>deny('select csworks_save_intake(null,0,$1::jsonb)',[JSON.stringify(fields)]));
 await test('customer cannot enumerate intake RPC',()=>deny('select csworks_list_intakes()'));
 await test('customer cannot issue invitation via privileged RPC',()=>deny('select csworks_issue_invitation($1,1,$2,$3)',[id(55),id(3),'a'.repeat(64)]));
 await test('customer direct project amount/status injection denied',()=>deny("insert into projects(user_id,project_code,title,status,quoted_amount) values($1,'BAD','Bad','quote_presented',1)",[id(1)]));
 await test('existing customer normal request remains valid',async()=>{await q("insert into projects(id,user_id,project_code,title,status) values($1,$2,'NORMAL','Normal','quote_requested')",[id(11),id(1)])});
 await actor(3);let i,v;
 await test('admin prepares private quote/intake',async()=>{i=await create();assert.equal(i.version,1);assert.equal((await q('select * from projects where id=$1',[i.project_id])).length,0)});
 await test('stale edit rejected',()=>deny('select csworks_save_intake($1,0,$2::jsonb)',[i.id,JSON.stringify(fields)],'40001'));
 await test('fractional/negative quote values rejected in database',async()=>{await assert.rejects(()=>create({...fields,quote_items:[{...item,amount:0.5}]}));await assert.rejects(()=>create({...fields,quote_items:[{...item,hours:-1}]}))});
 await test('staged attachment uses reserved project path and advances version',async()=>{await q("insert into storage.objects(bucket_id,name) values('project-files',$1)",[i.project_id+'/input.pdf']);await q('select csworks_register_intake_file($1,$2,$3,100,$4)',[i.id,'input.pdf',i.project_id+'/input.pdf','application/pdf']);i=(await q('select * from project_intakes where id=$1',[i.id]))[0];assert.equal(i.version,2)});
 await test('issuance stores hash only and no account is created',async()=>{v=await issue(i);await finish(v);await ex('reset role');assert.equal((await q('select count(*) n from auth.users'))[0].n,4);const row=(await q('select * from project_invitations'))[0];assert.equal(row.token_hash,'a'.repeat(64));assert.equal(row.token,undefined)});
 await test('resend cooldown enforced in DB',()=>issue(i,'b'.repeat(64)).then(()=>assert.fail(),e=>assert.equal(e.code,'54000')));
 await actor(2);
 await test('customer sees no pending intake rows',async()=>assert.equal((await q('select * from project_intakes')).length,0));
 await test('pending attachment bytes and metadata invisible to other customer',async()=>{assert.equal((await q('select * from storage.objects where name=$1',[i.project_id+'/input.pdf'])).length,0);await deny('select * from project_intake_files')});
 await test('customer cannot read token hashes',()=>deny('select * from project_invitations'));
 await test('profile email spoofing cannot accept',async()=>assert.equal((await accept()).error,'invalid_invitation'));
 await actor(4);
 await test('unconfirmed auth email cannot accept',async()=>assert.equal((await accept()).error,'email_confirmation_required'));
 await actor(1);
 await test('tampered token rejected',async()=>assert.equal((await accept('f'.repeat(64))).error,'invalid_invitation'));
 await test('verified Auth email accepts regardless of profile email',async()=>{const r=await accept();assert.equal(r.projectId,i.project_id);const p=(await q('select * from projects where id=$1',[i.project_id]))[0];assert.equal(p.user_id,id(1));assert.equal(p.status,'quote_presented');assert.equal(p.quoted_amount,9000)});
 await test('accepted owner can read staged attachment; other customer cannot',async()=>{assert.equal((await q('select * from storage.objects where name=$1',[i.project_id+'/input.pdf'])).length,1);assert.equal((await q('select * from project_files where project_id=$1',[i.project_id])).length,1);await actor(2);assert.equal((await q('select * from storage.objects where name=$1',[i.project_id+'/input.pdf'])).length,0);await actor(1)});
 await test('one use: repeated acceptance denied and project count stays one',async()=>{assert.equal((await accept()).error,'invalid_invitation');assert.equal((await q('select * from projects where id=$1',[i.project_id])).length,1)});
 await test('customer cannot edit formal quote/identity',async()=>{await deny('update project_quotes set subtotal=1');await q('update projects set user_id=$1 where id=$2',[id(2),i.project_id]);assert.equal((await q('select user_id from projects where id=$1',[i.project_id]))[0].user_id,id(1))});
 let quote=(await q('select formal_quote_id from projects where id=$1',[i.project_id]))[0].formal_quote_id;
 await test('invitation is not order; explicit versioned order works',async()=>{assert.equal((await q('select * from project_orders where project_id=$1',[i.project_id])).length,0);await q('select csworks_order_quote($1,$2,$3)',[i.project_id,quote,id(101)]);const o=(await q('select * from project_orders where project_id=$1',[i.project_id]))[0];assert.equal(o.total_amount,9900);assert.equal(o.formal_quote_id,quote)});
 await test('new formal order cannot use old RPC first',async()=>{await actor(3);let next=await create();let inv=await issue(next,'c'.repeat(64));await finish(inv);await actor(1);await accept('c'.repeat(64));await deny('select order_project($1)',[next.project_id])});
 await test('H01 foreign project path insert denied',()=>deny("insert into project_files(project_id,uploaded_by,file_name,storage_path,file_type) values($1,$2,'x.png',$3,'reference')",[i.project_id,id(1),id(11)+'/x.png']));
 await test('valid own project file metadata accepted',()=>q("insert into project_files(project_id,uploaded_by,file_name,storage_path,file_type) values($1,$2,'x.png',$3,'reference')",[i.project_id,id(1),i.project_id+'/x.png']));
 await test('H03 cannot forge system message',()=>deny("insert into project_messages(project_id,user_id,message,message_type,sender_type) values($1,$2,'fake','system','admin')",[i.project_id,id(1)]));
 await test('normal message sender forced to authenticated role',async()=>{const m=(await q("insert into project_messages(project_id,user_id,message,sender_type) values($1,$2,'hello','admin') returning *",[i.project_id,id(1)]))[0];assert.equal(m.sender_type,'customer');await deny('update project_messages set message=$1 where id=$2',['tampered',m.id])});
 await actor(3);
 await test('admin marks read via RPC',async()=>{await q('select csworks_mark_messages_read($1::uuid[])',[[i.project_id]]);assert.ok((await q('select read_by_admin_at from project_messages where project_id=$1',[i.project_id]))[0].read_by_admin_at)});
 await test('invited order continues through redline, revision, approval and final delivery',async()=>{
  await q('select csworks_begin_illustrations($1)',[i.project_id]);
  const context=async()=>(await q('select csworks_get_illustrations($1) r',[i.project_id]))[0].r;
  const point=(await context()).items[0].id;
  async function attach(n){const path=i.project_id+'/illustrations/'+point+'/'+id(n)+'.png';await actor(3);await q("insert into storage.objects(bucket_id,name) values('project-files',$1)",[path]);return (await q('select csworks_attach_illustration_file($1,$2,$3,$4,$5,$6,100) r',[i.project_id,point,id(n),'proof.png',path,'image/png']))[0].r;}
  let proof=await attach(700);await q('select csworks_start_illustration_review($1,$2::uuid[],$3)',[i.project_id,[point],id(701)]);
  let batch=(await context()).items[0].versions[0].review_batch_id;
  await actor(1);await q('select csworks_save_annotations($1,$2,$3,0,$4::jsonb)',[i.project_id,batch,proof.file_id,JSON.stringify({schemaVersion:1,pins:[{id:'pin',number:1,x:.5,y:.5,comment:'位置修正'}],strokes:[]})]);
  let r=(await q('select csworks_submit_illustration_review($1,$2::jsonb,$3) r',[i.project_id,JSON.stringify([{illustrationId:point,batchId:batch,action:'revision_request',comment:'位置修正'}]),id(702)]))[0].r;assert.equal(r.project.status,'revision');
  proof=await attach(703);await q('select csworks_start_illustration_review($1,$2::uuid[],$3)',[i.project_id,[point],id(704)]);batch=(await context()).items[0].versions[0].review_batch_id;
  await actor(1);r=(await q('select csworks_submit_illustration_review($1,$2::jsonb,$3) r',[i.project_id,JSON.stringify([{illustrationId:point,batchId:batch,action:'approval',comment:''}]),id(705)]))[0].r;assert.equal(r.project.status,'approved');
  await actor(3);const finalPath=i.project_id+'/delivery-final/'+id(706);await q("insert into storage.objects(bucket_id,name) values('project-files',$1)",[finalPath]);await q('select csworks_register_delivery_file($1,$2,$3,$4,$5,$6,100)',[i.project_id,point,id(706),'final.pdf',finalPath,'application/pdf']);await q('select deliver_project($1)',[i.project_id]);assert.equal((await q('select total_amount from project_deliveries where project_id=$1',[i.project_id]))[0].total_amount,9900);
  await actor(1);assert.equal((await q('select csworks_get_delivery_manifest($1) r',[i.project_id]))[0].r.assets.length,1);await actor(3);
 });
 await test('accepted intake cannot be edited',()=>deny('select csworks_save_intake($1,$2,$3::jsonb)',[i.id,i.version,JSON.stringify(fields)],'40001'));
 await test('legacy quote requires admin confirmation; existing quote can be re-presented',async()=>{await ex("reset role;select set_config('request.jwt.claim.sub','',false)");await q("update projects set status='quote_presented',quoted_amount=1000,confirmed_deadline='2026-12-01' where id=$1",[id(11)]);await actor(1);await deny('select order_project($1)',[id(11)]);await actor(3);await q("update projects set quote_presented_at=now() where id=$1",[id(11)]);await actor(1);await q('select order_project($1)',[id(11)])});
 await test('edit revokes earlier URL',async()=>{await actor(3);let next=await create();let inv=await issue(next,'d'.repeat(64));await finish(inv);await actor(3);await q('select csworks_save_intake($1,$2,$3::jsonb)',[next.id,next.version,JSON.stringify({...fields,title:'Changed'})]);await actor(1);assert.equal((await accept('d'.repeat(64))).error,'invalid_invitation')});
 await test('expired token rejected',async()=>{await actor(3);let next=await create({...fields,email:'b@example.test'});let inv=await issue(next,'e'.repeat(64));await finish(inv);await ex('reset role');await q("update project_invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where id=$1",[inv.id]);await actor(2);assert.equal((await accept('e'.repeat(64))).error,'invalid_invitation')});
 await test('no-quote invitation creates quote-requested project; explicit revoke blocks it first',async()=>{await actor(3);let next=await create({...fields,email:'b@example.test',quote_items:null,quote_deadline:''});let inv=await issue(next,'1'.repeat(64));await finish(inv);await actor(3);await q('select csworks_revoke_invitation($1)',[next.id]);await actor(2);assert.equal((await accept('1'.repeat(64))).error,'invalid_invitation');await ex("reset role");await q("update project_invitations set created_at=now()-interval '2 minutes' where id=$1",[inv.id]);inv=await issue(next,'2'.repeat(64));await finish(inv);await actor(2);await accept('2'.repeat(64));assert.equal((await q('select status from projects where id=$1',[next.project_id]))[0].status,'quote_requested')});
 await test('failed promotion rolls back owner/quote/token together',async()=>{await actor(3);let next=await create({...fields,email:'b@example.test'});let inv=await issue(next,'3'.repeat(64));await finish(inv);await ex("reset role;create function public.synthetic_failure() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end$$;create trigger synthetic_failure before insert on public.project_quotes for each row execute function public.synthetic_failure();");await actor(2);await assert.rejects(()=>accept('3'.repeat(64)));await ex('reset role');assert.equal((await q('select * from projects where id=$1',[next.project_id])).length,0);assert.equal((await q('select accepted_at from project_invitations where id=$1',[inv.id]))[0].accepted_at,null);await ex('drop trigger synthetic_failure on project_quotes;drop function synthetic_failure()');await actor(2);assert.equal((await accept('3'.repeat(64))).projectId,next.project_id)});
 await test('attempt limit persists for invalid tokens',async()=>{await actor(2);for(let n=0;n<20;n++)await accept('0'.repeat(64));assert.equal((await accept('0'.repeat(64))).error,'rate_limited')});
 await test('anonymous access denied',async()=>{await ex('reset role;set role anon');await deny('select csworks_accept_invitation($1)',['a'.repeat(64)]);await deny('select * from project_intakes')});
 console.log(`${passed} checks passed; no external systems touched.`);await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
