// Validate the deployable test-only setup, its empty-environment guard, and real screen permissions.
// Local synthetic Supabase schemas; no network and no real credentials.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.CSWORKS_PGLITE_PATH||'/tmp/csworks-annotation-test/node_modules/@electric-sql/pglite');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const bootstrap=fs.readFileSync('docs/sql/csworks-annotations-test-setup.sql','utf8');
async function engine(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,storage to authenticated,anon,service_role;grant execute on function auth.uid() to public;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;`);return db;}
(async()=>{const db=await engine();let count=0;
const q=async(sql,p=[])=>(await db.query(sql,p)).rows;
const actor=async(n,role='authenticated')=>db.exec(`reset role;set role ${role};select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
const check=async(name,fn)=>{await fn();count++;console.log('PASS',name)};
try{
 await check('complete empty-project setup executes atomically',async()=>{await db.exec(bootstrap);assert.equal((await q('select project_ref from public.csworks_annotation_test_environment'))[0].project_ref,'jjiebuuasaimaqemhiua')});
 await check('seed refuses missing test accounts',async()=>{await assert.rejects(()=>db.exec(fs.readFileSync('docs/sql/csworks-annotations-test-seed.sql','utf8')));await db.exec('rollback')});
 for(const [n,email]of [[1,'csworks-admin@example.com'],[2,'csworks-customer@example.com'],[3,'csworks-other@example.com']])await q('insert into auth.users values($1,$2,now())',[uid(n),email]);
 await check('Auth trigger creates customer-only profiles',async()=>assert.equal((await q("select count(*)::int n from public.profiles where role='customer'"))[0].n,3));
 await db.exec(fs.readFileSync('docs/sql/csworks-annotations-test-seed.sql','utf8'));
 await check('seed creates isolated projects and a test admin',async()=>{assert.equal((await q('select count(*)::int n from public.projects'))[0].n,2);assert.equal((await q('select role from public.profiles where id=$1',[uid(1)]))[0].role,'admin')});
 const a='c5100000-0000-4000-8000-000000000001',b='c5100000-0000-4000-8000-000000000002';
 await actor(2);
 await check('customer sees only their project via existing screen query',async()=>assert.deepEqual((await q('select id from public.projects')).map(x=>x.id),[a]));
 await check('customer cannot promote profile role',async()=>assert.rejects(()=>q("update public.profiles set role='admin' where id=$1",[uid(2)]),{code:'42501'}));
 await check('customer cannot switch project status directly',async()=>assert.equal((await q("update public.projects set status='approved' where id=$1 returning id",[a])).length,0));
 await actor(1);
 const f=uid(11),p=a+'/sample.png';
 await q("insert into storage.objects(bucket_id,name) values('project-files',$1)",[p]);
 await q("insert into public.project_files(id,project_id,uploaded_by,file_name,storage_path,file_type,mime_type) values($1,$2,$3,'sample.png',$4,'review','image/png')",[f,a,uid(1),p]);
 let batch;
 await check('admin can upload then start the existing confirmation flow',async()=>{batch=(await q('select public.csworks_start_review($1,$2) result',[a,[f]]))[0].result.batchId;assert.ok(batch)});
 await actor(3);
 await check('other customer cannot access image storage',async()=>assert.equal((await q('select * from storage.objects where name=$1',[p])).length,0));
 await actor(2);
 await check('owner can access image storage',async()=>assert.equal((await q('select * from storage.objects where name=$1',[p])).length,1));
 const d={schemaVersion:1,pins:[{id:'p1',number:1,x:.2,y:.5,comment:'修正してください'}],strokes:[]};
 await q('select public.csworks_save_annotations($1,$2,$3,0,$4)',[a,batch,f,d]);
 await check('saved image instructions submit with original workflow RPC',async()=>{const r=(await q('select public.csworks_submit_review($1,$2,$3,$4,$5) result',[a,batch,uid(40),'revision_request','画像をご確認ください']))[0].result;assert.equal(r.message.sender_type,'customer');assert.equal(r.project.status,'revision')});
 await actor(1);
 await check('admin reads same finalized instructions through RLS',async()=>{const r=await q('select document,finalized_at from public.project_file_annotations');assert.deepEqual(r[0].document,d);assert.ok(r[0].finalized_at)});
 await actor(3);
 await check('other customer cannot read finalized instructions',async()=>assert.equal((await q('select * from public.project_file_annotations')).length,0));
 await actor(2);
 await check('anonymous shared-token table remains inaccessible to customer',async()=>assert.rejects(()=>q('select * from public.project_file_shares'),{code:'42501'}));
 await db.exec('reset role');
 await check('repeat setup stops without changing existing test data',async()=>{await assert.rejects(()=>db.exec(bootstrap));await db.exec('rollback');assert.equal((await q('select count(*)::int n from public.projects'))[0].n,2)});
 const wrong=await engine();
 try{await wrong.exec('create table public.profiles(id uuid)');await check('populated project is rejected before creating marker or tables',async()=>{await assert.rejects(()=>wrong.exec(bootstrap));await wrong.exec('rollback');assert.equal((await wrong.query("select to_regclass('public.csworks_annotation_test_environment') marker")).rows[0].marker,null)})}finally{await wrong.close()}
 console.log(count+' dedicated test-setup checks passed (local only).');
}finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
