import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
function sql(query) {
 return new Promise((resolve,reject)=>{
  const child=spawn('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',query],{env:process.env});
  let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  child.on('error',reject);child.on('exit',code=>code===0?resolve(out.trim()):reject(Error(err)));
 });
}
assert.equal(await sql('select current_database()'),'coupon_ci','isolated database only');
const u1='30000000-0000-4000-8000-000000000001',u2='30000000-0000-4000-8000-000000000002',admin='30000000-0000-4000-8000-000000000003';
const p1='40000000-0000-4000-8000-000000000001',p2='40000000-0000-4000-8000-000000000002';
await sql(`update public.trial_coupon_settings set enabled=true,starts_at=clock_timestamp()-interval '1 day';
insert into auth.users(id,email,raw_user_meta_data) values
('${u1}','parallel1@example.test','{"company_name":"株式会社 並行会社"}'),
('${u2}','parallel2@example.test','{"company_name":"（株）並行会社"}'),
('${admin}','parallel-admin@example.test','{}');
update public.profiles set role='admin' where id='${admin}';`);
await Promise.all([u1,u2].map(id=>sql(`update auth.users set email_confirmed_at=clock_timestamp() where id='${id}';`)));
assert.equal(await sql('select count(*) from public.trial_coupon_grants'),'1','concurrent company confirmation grants once');
const owner=await sql('select user_id from public.trial_coupon_grants');
assert.ok([u1,u2].includes(owner));
await sql(`insert into public.projects(id,user_id,title) values
('${p1}','${owner}','parallel first'),('${p2}','${owner}','parallel second');
select set_config('request.jwt.claim.sub','${admin}',false);
select public.csworks_save_quote(id,null,null,0,current_date+10,
jsonb_build_array(jsonb_build_object('item_key',gen_random_uuid(),'number','01','name','制作','description','','amount',10000,'hours',1)),true,gen_random_uuid())
from public.projects order by id;`);
const results=await Promise.all([p1,p2].map(pid=>sql(`select set_config('request.jwt.claim.sub','${owner}',false);
select public.csworks_order_quote_checked(project_id,id,gen_random_uuid(),7700,1)
from public.project_quotes where project_id='${pid}';`)));
assert.equal(results.filter(x=>x.includes('"quoteChanged": true')).length,1,'losing order requires updated price confirmation');
assert.equal(await sql('select count(*) from public.project_orders'),'1','concurrent orders create one accepted order');
assert.equal(await sql('select count(*) from public.trial_coupon_grants where consumed_at is not null'),'1','concurrent orders consume once');
assert.equal(await sql('select total_amount from public.project_orders'),'7700','winning order uses discount');
assert.equal(await sql("select subtotal from public.project_quotes where state='presented'"),'10000','losing quote loses coupon');
await sql(`select set_config('request.jwt.claim.sub','${owner}',false);
select public.csworks_order_quote_checked(project_id,id,gen_random_uuid(),11000,edit_version) from public.project_quotes where state='presented';`);
assert.equal(await sql('select count(*) from public.project_orders'),'2','second order succeeds at confirmed revised amount');
assert.equal(await sql('select sum(total_amount) from public.project_orders'),'18700','no double discount');
console.log('PASS: concurrent company grants, concurrent orders, stale-price confirmation, single consumption and revised second order');
