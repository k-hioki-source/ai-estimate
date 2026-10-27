// Real API handler and pricing engines, synthetic AI + email, no network or real data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function compile(file,req){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Buffer,console,process:{cwd:()=>process.cwd()}},{filename:file});return exports}
const cache={};function local(file){file=path.resolve(file);return cache[file]??=compile(file,n=>local(path.resolve(path.dirname(file),n+'.ts')))}
async function run(notes,quantity,complex=false){let sent,analyzed;const route=compile('app/api/analyze/route.ts',n=>{
 if(n==='next/server')return{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}};
 if(n.endsWith('/email'))return{sendNotificationEmail:async p=>{sent=p;return{estimateId:'SYNTHETIC'}}};
 if(n.endsWith('/openai'))return{analyzeImage:async p=>{analyzed=p;return{workType:'standard_trace',difficultyScore:complex?80:40,partDensity:complex?80:30,lineDifficulty:complex?80:35,structureComplexity:complex?80:30,isExplodedView:false,hasLeaderLines:false,hasPartNumbers:false,isIndustrialProduct:true,summary:'写真未確認、依頼文に基づく線画の概算です。',estimatedHoursMin:complex?7:2.5,estimatedHours:p.combinedScope?(complex?9:3):1,estimatedHoursMax:complex?11:3.5}}};
 if(n==='fs/promises')return{default:{readFile:async()=>Buffer.from('synthetic reference sample')}};
 if(n==='path')return{default:path};
 return local(path.resolve('app/api/analyze',n+'.ts'));
 });const fields=new Map(Object.entries({sampleImagePath:'sample.png',sourceType:'photo_trace',usage:'manual',style:'line',notes,quantity:String(quantity)}));const res=await route.POST({formData:async()=>({get:k=>fields.get(k)||null})});assert.equal(res.status,200);return{...res.body,sent,analyzed}}
(async()=>{let n=0;const pair=await run('側面図と部分拡大図の2点のイラストをお願いします',2);assert.equal(pair.analyzed.combinedScope,true);assert.equal(pair.analyzed.isReferenceSample,true);assert.equal(pair.sent.aiEstimatedHours,1.5);assert.equal(pair.estimate.total,10500);assert.equal(pair.estimate.estimatedHours*2,3.5);assert.equal(pair.sent.totalPrice,10500);assert.equal(pair.sent.estimatedHours*pair.sent.quantity,3.5);assert.equal(pair.estimateEngines.master.adjustments.some(a=>a.key==='angle'),false);assert.equal(pair.estimateEngines.master.hours,1.75);n+=9;
const repeated=await run('同じ製品の側面図を2点お願いします',2);assert.equal(repeated.analyzed.combinedScope,false);assert.equal(repeated.estimate.total,repeated.estimate.estimatedHours*3000*2);assert.equal(repeated.estimateEngines.master.adjustments.some(a=>a.key==='angle'),false);n+=3;
const complex=await run('細かな部品の多い側面図と部分拡大図の2点のイラスト',2,true);assert.ok(complex.estimate.total>pair.estimate.total);assert.equal(complex.estimate.total,complex.estimate.estimatedHours*3000*2);n+=2;
console.log(n+' actual API scope checks passed (AI/email mocked; no network).')})().catch(e=>{console.error(e);process.exitCode=1});
