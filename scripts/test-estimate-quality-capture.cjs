const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function compile(file,req,env={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Buffer,console,Date,process:{env,cwd:()=>process.cwd()}},{filename:file});return exports;}
const cache={};function local(file){file=path.resolve(file);return cache[file]??=compile(file,n=>local(path.resolve(path.dirname(file),n+'.ts')))}
async function run(consent,fail=false,formal=false,email=''){
 let saved=0,mail;
 const route=compile('app/api/analyze/route.ts',n=>{
  if(n==='next/server')return{NextResponse:{json:(body,o)=>({body,status:o?.status||200})}};
  if(n.endsWith('/email'))return{sendNotificationEmail:async p=>{mail=p;return{estimateId:'SYNTHETIC'}}};
  if(n.endsWith('/estimateQuality'))return{saveQualityReview:async p=>{saved++;assert.equal(p.hours>0,true);assert.equal(p.notes,'synthetic request');if(fail)throw Error('fake failure');}};
  if(n.endsWith('/openai'))return{analyzeImage:async()=>({workType:'standard_trace',difficultyScore:40,partDensity:30,lineDifficulty:35,structureComplexity:30,visibleComponentCount:1,repeatedDetailCount:2,isExplodedView:false,hasLeaderLines:false,hasPartNumbers:false,isIndustrialProduct:true,summary:'合成テスト専用の単純な製品の写真トレースです。',estimatedHoursMin:1,estimatedHours:1.5,estimatedHoursMax:2})};
  if(n==='fs/promises')return{default:{readFile:async()=>Buffer.from('synthetic')}};if(n==='path')return{default:path};
  return local(path.resolve('app/api/analyze',n+'.ts'));
 });
 const map=new Map(Object.entries({sampleImagePath:'sample.png',sourceType:'photo_trace',usage:'manual',style:'line',notes:'synthetic request',quantity:'1',qualityReviewConsent:consent,requestFormalQuote:String(formal),email}));
 const res=await route.POST({formData:async()=>({get:k=>map.get(k)||null})});assert.equal(res.status,200);return{saved,mail,...res.body};
}
(async()=>{
 const no=await run('');assert.equal(no.saved,0);assert.equal(no.mail.qualityReviewMode,false);
 const yes=await run('quality-review-7d-v1');assert.equal(yes.saved,1);assert.equal(yes.qualityReviewSaved,true);assert.equal(yes.mail.qualityReviewMode,true);assert.equal(yes.estimate.total,no.estimate.total);
 const failure=await run('quality-review-7d-v1',true);assert.equal(failure.qualityReviewSaved,false);assert.equal(failure.estimate.total,no.estimate.total);
 assert.equal((await run('true')).saved,0);assert.equal((await run('quality-review-7d-v1',false,true)).saved,0);assert.equal((await run('quality-review-7d-v1',false,false,'a@example.invalid')).saved,0);
 let sent;
 const mail=compile('lib/email.ts',()=>({Resend:class{constructor(){this.emails={send:async p=>{sent=p;return{data:{id:'mock'},error:null}}}}}}),{RESEND_API_KEY:'fake'});
 await mail.sendNotificationEmail({qualityReviewMode:true,estimateId:'TEST',notes:'SECRET_NOTES',aiReason:'SECRET_AI',imageAttachment:{filename:'SECRET_FILENAME',content:'SECRET_IMAGE'},estimatedHours:4,totalPrice:12000});
 const text=JSON.stringify(sent);assert.equal(text.includes('SECRET'),false);assert.equal('attachments'in sent,false);assert.match(text,/estimate-quality/);
 console.log('PASS actual analyze route: consent-only capture, opt-out/formal/email exclusion, failed save preserves estimate, masked review email (synthetic AI/email/database).');
})().catch(e=>{console.error(e);process.exitCode=1});
