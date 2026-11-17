import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3210'],{env:process.env,stdio:['ignore','ignore','pipe']});
let browser;
let errors='';server.stderr.on('data',x=>errors+=x);
server.on('error',e=>{errors+=String(e);});
const base='http://127.0.0.1:3210';
try{
 let ready=false;
 for(let n=0;n<150;n++){
  try{const r=await fetch(base+'/signup');if(r.status===200){ready=true;break;}}catch{}
  if(server.exitCode!==null)throw Error('Server exited: '+errors);
  await delay(200);
 }
 assert.ok(ready,'Next server ready');
 const signup=await (await fetch(base+'/signup')).text();
 assert.ok(signup.includes('会社名・事業者名'),'signup collects company name');

 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await page.route('**/api/cs-works/trial-coupon?promotion=1',r=>r.fulfill({status:200,contentType:'application/json',body:'{"active":true}'}));
 await page.route('https://example.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByText('新規会員登録で、初回お試しクーポン（3,000円分）プレゼント',{exact:true}).waitFor({state:'visible',timeout:20000});
 const home=await page.content();
 assert.ok(home.includes('新規会員登録で、初回お試しクーポン'),'hero badge rendered');
 assert.ok(home.includes('初回お試しクーポンとは何ですか'),'FAQ rendered');
 assert.ok(home.includes('軽微な修正'),'existing revision benefit retained');
 assert.ok(home.includes('NDA'),'existing NDA copy retained');
 await page.goto(base+'/signup',{waitUntil:'domcontentloaded'});
 await page.getByText('会員登録（無料）すると、初回発注に使える『初回お試しクーポン（3,000円分）』が付与されます。正式見積り3,000円以下なら、クーポンで全額まかなえます。',{exact:true}).waitFor();
 await page.getByLabel('会社名・事業者名').fill('株式会社 テスト');
 await page.unroute('**/api/cs-works/trial-coupon?promotion=1');
 await page.route('**/api/cs-works/trial-coupon?promotion=1',r=>r.fulfill({status:200,contentType:'application/json',body:'{"active":false}'}));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'よくある質問',exact:true}).waitFor();
 assert.equal(await page.getByText('新規会員登録で、初回お試しクーポン（3,000円分）プレゼント',{exact:true}).count(),0,'disabled campaign does not advertise coupons');
 assert.equal((await fetch(base+'/api/cs-works/trial-coupon')).status,401,'coupon status requires authentication');
 assert.equal((await fetch(base+'/api/cs-works/trial-coupon?from=2026-11&to=2026-11')).status,401,'report requires authentication');
 assert.equal((await fetch(base+'/api/cs-works/trial-coupon',{method:'POST'})).status,401,'mail cannot be triggered anonymously');
 console.log('PASS: built signup/landing markup and anonymous API access controls');
}finally{if(browser)await browser.close();server.kill('SIGTERM');}
