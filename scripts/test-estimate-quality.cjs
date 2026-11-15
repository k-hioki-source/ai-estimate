const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function compile(file,req,env={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,console,Buffer,process:{env},Date,Number,FormData,URL},{filename:file});return exports;}
let inserted;const quality=compile('lib/estimateQuality.ts',()=>({createClient:()=>({from:()=>({insert:async row=>{inserted=row;return{error:null}}})})}),{NEXT_PUBLIC_SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake',VERCEL_GIT_COMMIT_SHA:'test-version'});
let form=new FormData();assert.equal(quality.qualityConsent(form),false);form.set('qualityReviewConsent','quality-review-7d-v1');assert.equal(quality.qualityConsent(form),true);form.set('requestFormalQuote','true');assert.equal(quality.qualityConsent(form),false);form.delete('requestFormalQuote');form.set('email','a@example.invalid');assert.equal(quality.qualityConsent(form),false);
const ok=quality.validateQualityReview({status:'ok',revision:0},8);assert.equal(ok.review_hours,8);
for(const bad of [{status:'corrected',revision:0,hours:0,reason:'x'},{status:'corrected',revision:0,hours:8,reason:''},{status:'corrected',revision:0,hours:8,reason:'x',lineHours:3,colorHours:4},{status:'deleted',revision:0},{status:'ok',revision:-1}])assert.throws(()=>quality.validateQualityReview(bad,8));
assert.equal(quality.validateQualityReview({status:'corrected',revision:0,hours:8,reason:'線画3+彩色5',lineHours:3,colorHours:5},16).review_color_hours,5);
const state={admin:false,found:true,conflict:false,seen:[]};const id='00000000-0000-4000-8000-000000000001';
function from(){const q={};for(const method of ['select','eq','gt','order','range','update'])q[method]=(...a)=>{state.seen.push([method,...a]);return q};q.maybeSingle=async()=>({data:state.found&&!state.conflict?{id,ai_hours:16,revision:0}:null,error:null});q.then=(f)=>Promise.resolve({data:[],count:0,error:null}).then(f);return q;}
const route=compile('app/api/admin/estimate-quality/route.ts',n=>n==='next/server'?{NextResponse:{json:(body,o)=>({body,status:o?.status||200})}}:n.endsWith('google-calendar-auth')?{requireAdmin:async()=>state.admin?{db:{from},user:{id}}:null}:{validateQualityReview:quality.validateQualityReview});
const req=(url,body)=>({headers:{get:()=>null},nextUrl:new URL(url,'https://local.invalid'),json:async()=>body});
(async()=>{
 assert.equal((await route.GET(req('/'))).status,403);assert.equal((await route.PATCH(req('/',{}))).status,403);
 state.admin=true;assert.equal((await route.GET(req('/?id=bad'))).status,400);assert.equal((await route.GET(req('/?status=invalid'))).status,400);
 assert.equal((await route.GET(req('/'))).status,200);assert.ok(state.seen.some(a=>a[0]==='gt'&&a[1]==='expires_at'));
 assert.equal((await route.PATCH(req('/',{id,status:'corrected',revision:0,hours:8,reason:'x'}))).status,200);
 assert.ok(state.seen.some(a=>a[0]==='eq'&&a[1]==='revision'&&a[2]===0));
 state.found=false;assert.equal((await route.GET(req('/?id='+id))).status,404);
 state.found=true;state.conflict=false; // Update race: read succeeds, second maybeSingle fails.
 let calls=0;const race=compile('app/api/admin/estimate-quality/route.ts',n=>n==='next/server'?{NextResponse:{json:(body,o)=>({body,status:o?.status||200})}}:n.endsWith('google-calendar-auth')?{requireAdmin:async()=>({db:{from:()=>{const q=from();q.maybeSingle=async()=>({data:++calls===1?{id,ai_hours:16}:null,error:null});return q}},user:{id}})}:{validateQualityReview:quality.validateQualityReview});
 assert.equal((await race.PATCH(req('/',{id,status:'ok',revision:0}))).status,409);
 await quality.saveQualityReview({estimateId:'TEST',sourceType:'photo_trace',usage:'manual',style:'line',quantity:1,notes:'synthetic',imageBase64:'eA==',imageMime:'image/jpeg',snapshot:{raw:1},hours:4,price:12000});assert.equal(inserted.consent_version,'quality-review-7d-v1');assert.equal(inserted.engine_version,'test-version');assert.equal('email'in inserted,false);
 await assert.rejects(()=>quality.saveQualityReview({notes:'x',imageBase64:'x',imageMime:'image/svg+xml'}));
 console.log('PASS consent gates, corrected-hour validation, admin API rejection, expiry filters, optimistic concurrency, private payload, image type validation (mock services).');
})().catch(e=>{console.error(e);process.exitCode=1});
