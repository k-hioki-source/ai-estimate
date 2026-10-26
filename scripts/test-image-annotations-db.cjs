// Local PostgreSQL-compatible test fixture only. Never connects to Supabase.
// npm install --prefix /tmp/csworks-annotation-test @electric-sql/pglite
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.CSWORKS_PGLITE_PATH || '/tmp/csworks-annotation-test/node_modules/@electric-sql/pglite');
const db = new PGlite();
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let count=0;
async function check(label, fn) { await fn(); count++; console.log('PASS', label); }
async function query(sql, params=[]) { return (await db.query(sql,params)).rows; }
async function actor(n, role='authenticated') { await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${n ? uid(n) : ''}',false);`); }
async function rejected(sql,params,code) { await assert.rejects(()=>query(sql,params), e => !code || e.code===code); }
const doc={schemaVersion:1,pins:[{id:'pin-1',number:1,x:.25,y:.5,comment:'左端を修正'}],strokes:[{id:'stroke-1',points:[{x:.1,y:.2},{x:.3,y:.4}]}]};
(async()=>{
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon,service_role; grant execute on function auth.uid() to public;
 create table public.profiles(id uuid primary key,role text);
 `);
 await db.exec(fs.readFileSync('scripts/fixtures/csworks-existing-review-schema.sql','utf8'));
 const senderDefault=(await query("select column_default from information_schema.columns where table_schema='public' and table_name='project_messages' and column_name='sender_type'"))[0].column_default;
 await db.exec(fs.readFileSync('scripts/fixtures/csworks-existing-review-functions.sql','utf8'));
 // Inject a synthetic failure outside the unmodified production RPC definitions.
 await db.exec(`create function public.test_workflow_failure() returns trigger language plpgsql as $$begin
  if current_setting('test.fail_rpc',true)='true' then raise exception 'Synthetic workflow failure'; end if;
  return new; end$$;
  create trigger test_workflow_failure before update of status on public.projects for each row execute function public.test_workflow_failure();`);
 await db.exec(fs.readFileSync('supabase/migrations/20261026_image_annotations.sql','utf8'));
 for(const n of [1,2,3]) await query('insert into auth.users values($1);',[uid(n)]);
 for(const [n,r] of [[1,'customer'],[2,'customer'],[3,'admin']]) await query('insert into public.profiles values($1,$2)',[uid(n),r]);
 await query("insert into public.projects(id,user_id,status,title,project_code) values($1,$2,'in_production','Synthetic A','TEST-A'),($3,$4,'in_production','Synthetic B','TEST-B')",[uid(10),uid(1),uid(20),uid(2)]);
 for(const [id,p,name,type,mime] of [[11,10,'first.png','review','image/png'],[12,10,'second.jpg','revision','image/jpeg'],[13,10,'source.png','reference','image/png'],[21,20,'other.png','review','image/png'],[14,10,'manual.pdf','review','application/pdf']]) await query('insert into public.project_files(id,project_id,file_name,file_type,mime_type,storage_path,uploaded_by) values($1,$2,$3,$4,$5,$6,$7)',[uid(id),uid(p),name,type,mime,uid(p)+'/'+name,uid(p===20?2:1)]);
 await actor(1);
 await check('customer cannot start review',()=>rejected('select public.csworks_start_review($1,$2)',[uid(10),[uid(11)]],'42501'));
 await actor(3);
 await check('admin cannot include another project file',()=>rejected('select public.csworks_start_review($1,$2)',[uid(10),[uid(21)]],'42501'));
 const first=(await query('select public.csworks_start_review($1,$2) result',[uid(10),[uid(11),uid(14)]]))[0].result;
 const b1=first.batchId;
 await check('start existing confirmation with selected files',async()=>{assert.equal(first.project.status,'customer_review');assert.equal((await query('select count(*)::int n from public.project_review_batch_files'))[0].n,2)});
 await actor(1);
 await check('normalized pins and red lines persist',async()=>{const r=(await query('select public.csworks_save_annotations($1,$2,$3,0,$4) result',[uid(10),b1,uid(11),doc]))[0].result;assert.equal(r.version,1);assert.deepEqual(r.document,doc)});
 await check('concurrent stale version rejected',()=>rejected('select public.csworks_save_annotations($1,$2,$3,0,$4)',[uid(10),b1,uid(11),doc],'40001'));
 await check('PDF annotations rejected at DB',()=>rejected('select public.csworks_save_annotations($1,$2,$3,0,$4)',[uid(10),b1,uid(14),doc],'42501'));
 await check('reference and non-member file rejected',()=>rejected('select public.csworks_save_annotations($1,$2,$3,0,$4)',[uid(10),b1,uid(13),doc],'42501'));
 await check('out of bounds input rejected at DB',()=>rejected('select public.csworks_save_annotations($1,$2,$3,1,$4)',[uid(10),b1,uid(11),{...doc,pins:[{...doc.pins[0],x:2}]}],'22023'));
 await check('missing schema version rejected',()=>rejected('select public.csworks_save_annotations($1,$2,$3,1,$4)',[uid(10),b1,uid(11),{pins:[],strokes:[]}],'22023'));
 await check('approval blocked while annotation drafts exist',()=>rejected('select public.csworks_submit_review($1,$2,$3,$4,$5)',[uid(10),b1,uid(40),'approval','OK'],'22023'));
 await actor(2);
 await check('other customer cannot see review history',async()=>assert.equal((await query('select * from public.project_review_batches')).length,0));
 await check('other customer cannot edit annotation',()=>rejected('select public.csworks_save_annotations($1,$2,$3,1,$4)',[uid(10),b1,uid(11),doc],'42501'));
 await check('other customer cannot submit review',()=>rejected('select public.csworks_submit_review($1,$2,$3,$4,$5)',[uid(10),b1,uid(41),'revision_request','修正'],'42501'));
 await actor(3);
 await check('admin can read identical annotation',async()=>assert.deepEqual((await query('select document from public.project_file_annotations'))[0].document,doc));
 await check('admin cannot rewrite customer annotation',()=>rejected('select public.csworks_save_annotations($1,$2,$3,1,$4)',[uid(10),b1,uid(11),doc],'42501'));
 await actor(1);
 await check('direct table mutation denied',()=>rejected('update public.project_file_annotations set document=$1',[doc],'42501'));
 await db.exec("select set_config('test.fail_rpc','true',false)");
 await check('workflow failure rolls back message and annotation finalization',async()=>{await rejected('select public.csworks_submit_review($1,$2,$3,$4,$5)',[uid(10),b1,uid(42),'revision_request','修正']);assert.equal((await query('select state from public.project_review_batches'))[0].state,'open')});
 await db.exec("select set_config('test.fail_rpc','false',false)");
 const result=(await query('select public.csworks_submit_review($1,$2,$3,$4,$5) result',[uid(10),b1,uid(42),'revision_request','画像の赤入れをご確認ください。']))[0].result;
 await check('existing revision RPC and history linked atomically',async()=>{assert.equal(result.project.status,'revision');assert.equal(result.message.message_type,'revision_request');assert.equal(result.message.sender_type,'customer');assert.equal((await query('select message_id from public.project_review_batches'))[0].message_id,result.message.id);assert.ok((await query('select finalized_at from public.project_file_annotations'))[0].finalized_at)});
 await check('exported message default is system but review is saved as customer',async()=>{assert.equal(senderDefault,"'system'::text");assert.equal(result.message.sender_type,'customer')});
 await check('idempotent resend returns original history',async()=>assert.equal((await query('select public.csworks_submit_review($1,$2,$3,$4,$5) result',[uid(10),b1,uid(42),'revision_request','画像の赤入れをご確認ください。']))[0].result.message.id,result.message.id));
 await check('submitted annotation cannot change',()=>rejected('select public.csworks_save_annotations($1,$2,$3,1,$4)',[uid(10),b1,uid(11),doc],'40001'));
 await actor(3);
 const b2=(await query('select public.csworks_start_review($1,$2) result',[uid(10),[uid(12)]]))[0].result.batchId;
 await actor(1);
 await check('new draft does not inherit previous file annotations',async()=>{assert.equal((await query('select * from public.project_file_annotations where batch_id=$1',[b2])).length,0);await rejected('select public.csworks_save_annotations($1,$2,$3,0,$4)',[uid(10),b2,uid(11),doc],'42501')});
 await query('select public.csworks_save_annotations($1,$2,$3,0,$4)',[uid(10),b2,uid(12),{schemaVersion:1,pins:[],strokes:[]}]);
 await check('existing approval RPC reused',async()=>{const r=(await query('select public.csworks_submit_review($1,$2,$3,$4,$5) result',[uid(10),b2,uid(43),'approval','']))[0].result;assert.equal(r.project.status,'approved');assert.equal(r.message.sender_type,'customer')});
 await check('approved project annotation immutable',()=>rejected('select public.csworks_save_annotations($1,$2,$3,1,$4)',[uid(10),b2,uid(12),doc],'40001'));
 await db.exec("reset role; update public.projects set status='revision' where title='Synthetic A'");
 await actor(3);
 const b3=(await query('select public.csworks_start_review($1,$2) result',[uid(10),[uid(12)]]))[0].result.batchId;
 await actor(1);
 await check('old instructions stay locked during a new open round',()=>rejected('select public.csworks_save_annotations($1,$2,$3,1,$4)',[uid(10),b1,uid(11),doc],'40001'));
 await check('same file in another round has independent annotation version',async()=>{const r=(await query('select public.csworks_save_annotations($1,$2,$3,0,$4) result',[uid(10),b3,uid(12),doc]))[0].result;assert.equal(r.version,1);assert.notEqual(b2,b3);assert.equal((await query('select version from public.project_file_annotations where batch_id=$1',[b2]))[0].version,1)});
 await check('legacy status transition still freezes active annotations',async()=>{await query('select public.request_project_revision($1)',[uid(10)]);assert.ok((await query('select finalized_at from public.project_file_annotations where batch_id=$1',[b3]))[0].finalized_at);await rejected('select public.csworks_save_annotations($1,$2,$3,1,$4)',[uid(10),b3,uid(12),doc],'40001')});
 await actor(2);
 await check('child annotation and membership RLS deny another customer',async()=>{assert.equal((await query('select * from public.project_file_annotations')).length,0);assert.equal((await query('select * from public.project_review_batch_files')).length,0)});
 await actor(null,'anon');
 await check('anonymous read and RPC denied',async()=>{await rejected('select * from public.project_file_annotations',[],'42501');await rejected('select public.csworks_submit_review($1,$2,$3,$4,$5)',[uid(10),b1,uid(44),'approval',''],'42501')});
 await actor(null,'service_role');
 await check('service-role direct annotation changes denied',()=>rejected('delete from public.project_file_annotations',[],'42501'));
 await db.exec('reset role');
 await check('failed transaction left no stray message',async()=>assert.equal((await query('select count(*)::int n from public.project_messages'))[0].n,2));
 console.log(`${count} database checks passed (synthetic fixture, user-supplied existing RPC definitions).`);
 await db.close();
})().catch(async e=>{console.error(e);await db.close();process.exitCode=1});
