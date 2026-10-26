const fs=require('fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.CSWORKS_PGLITE_PATH||'/tmp/csworks-quote-tests/node_modules/@electric-sql/pglite');
const setup=fs.readFileSync('docs/sql/csworks-formal-quotes-test-setup.sql','utf8');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let n=0;async function check(name,fn){await fn();n++;console.log('PASS',name)}
(async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated,anon,service_role;grant execute on function auth.uid() to public;
 create table storage.buckets(id text primary key,name text not null,public boolean not null default false);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;`);
 const q=async(s,p=[]) => (await db.query(s,p)).rows;
 await check('new quote setup rejects environments without dedicated marker',async()=>{await assert.rejects(()=>db.exec(setup));await db.exec('rollback')});
 await db.exec(fs.readFileSync('docs/sql/csworks-annotations-test-setup.sql','utf8'));
 await check('quote setup rejects incomplete test accounts',async()=>{await assert.rejects(()=>db.exec(setup));await db.exec('rollback')});
 for(const [i,e]of [[1,'csworks-admin@example.com'],[2,'csworks-customer@example.com'],[3,'csworks-other@example.com']])await q('insert into auth.users values($1,$2,now())',[uid(i),e]);
 await db.exec(fs.readFileSync('docs/sql/csworks-annotations-test-seed.sql','utf8'));
 await check('quote setup rejects unexpected accounts',async()=>{await q('insert into auth.users values($1,$2,now())',[uid(4),'unexpected@example.test']);await assert.rejects(()=>db.exec(setup));await db.exec('rollback');await q('delete from profiles where id=$1',[uid(4)]);await q('delete from auth.users where id=$1',[uid(4)])});
 await check('quote setup upgrades existing empty document tables atomically',async()=>{await db.exec(setup);assert.equal((await q("select count(*)::int n from projects where project_code like 'TEST-QUOTE-%'"))[0].n,2);assert.equal((await q('select count(*)::int n from project_quotes'))[0].n,0)});
 await check('existing annotation test projects preserved',async()=>{assert.equal((await q("select count(*)::int n from projects where project_code like 'TEST-ANNOTATION-%'"))[0].n,2)});
 await check('repeat setup rejected without changing test data',async()=>{await assert.rejects(()=>db.exec(setup));await db.exec('rollback');assert.equal((await q('select count(*)::int n from projects'))[0].n,4)});
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${uid(1)}',false)`);
 const r=(await q('select csworks_save_quote($1,null,null,0,$2,$3::jsonb,true,$4) r',['c5200000-0000-4000-8000-000000000001','2026-12-01',JSON.stringify([{item_key:uid(99),number:'01',name:'Synthetic',description:'',amount:1001,hours:1}]),uid(100)]))[0].r;
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${uid(2)}',false)`);
 await check('upgraded dedicated test DB supports original versioned order and tax',async()=>{const o=(await q('select csworks_order_quote($1,$2,$3) r',['c5200000-0000-4000-8000-000000000001',r.quote.id,uid(101)]))[0].r;assert.equal(o.project.status,'ordered');assert.equal((await q('select total_amount from project_orders'))[0].total_amount,1101)});
 await db.close();console.log(n+' dedicated setup checks passed.');
})().catch(e=>{console.error(e);process.exit(1)});
