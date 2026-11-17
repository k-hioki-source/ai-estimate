import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port','3210'],{env:process.env,stdio:['ignore','ignore','pipe']});
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
 assert.ok(signup.includes('初回お試しクーポン'),'signup explains coupon');
 assert.ok(signup.includes('正式見積り3,000円以下'),'signup keeps quote amount condition');
 const home=await (await fetch(base)).text();
 assert.ok(home.includes('新規会員登録で、初回お試しクーポン'),'hero badge rendered');
 assert.ok(home.includes('初回お試しクーポンとは何ですか'),'FAQ rendered');
 assert.ok(home.includes('軽微な修正'),'existing revision benefit retained');
 assert.ok(home.includes('NDA'),'existing NDA copy retained');
 assert.equal((await fetch(base+'/api/cs-works/trial-coupon')).status,401,'coupon status requires authentication');
 assert.equal((await fetch(base+'/api/cs-works/trial-coupon?from=2026-11&to=2026-11')).status,401,'report requires authentication');
 assert.equal((await fetch(base+'/api/cs-works/trial-coupon',{method:'POST'})).status,401,'mail cannot be triggered anonymously');
 console.log('PASS: built signup/landing markup and anonymous API access controls');
}finally{server.kill('SIGTERM');}
