// Real API handler and pricing engines, synthetic AI + email, no network or real data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function compile(file,req){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Buffer,console,process:{cwd:()=>process.cwd()}},{filename:file});return exports}
const cache={};function local(file){file=path.resolve(file);return cache[file]??=compile(file,n=>local(path.resolve(path.dirname(file),n+'.ts')))}
async function run(notes,quantity,complex=false,style='color',sourceType='photo_trace',flags={}){let sent,analyzed;const route=compile('app/api/analyze/route.ts',n=>{
 if(n==='next/server')return{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}};
 if(n.endsWith('/email'))return{sendNotificationEmail:async p=>{sent=p;return{estimateId:'SYNTHETIC'}}};
 if(n.endsWith('/openai'))return{analyzeImage:async p=>{analyzed=p;return{workType:'realistic_illustration',difficultyScore:complex?80:40,partDensity:complex?80:30,lineDifficulty:complex?80:35,structureComplexity:complex?80:30,isExplodedView:false,hasLeaderLines:false,hasPartNumbers:false,isIndustrialProduct:true,summary:'赤いコンパクトカメラ。レンズの同心円と金属感・反射・グラデーションがあります。',estimatedHoursMin:complex?7:2.5,estimatedHours:p.combinedScope?(complex?9:3):1,estimatedHoursMax:16,...flags,estimatedHours:12}}};
 if(n==='fs/promises')return{default:{readFile:async()=>Buffer.from('synthetic reference sample')}};
 if(n==='path')return{default:path};
 return local(path.resolve('app/api/analyze',n+'.ts'));
 });const fields=new Map(Object.entries({sampleImagePath:'sample.png',sourceType,usage:'manual',style,notes,quantity:String(quantity)}));const res=await route.POST({formData:async()=>({get:k=>fields.get(k)||null})});assert.equal(res.status,200);return{...res.body,sent,analyzed}}
(async()=>{
 const camera=await run('単体カメラ、背景なし',1);
 assert.equal(camera.vision.subjectType,'standard_trace');
 assert.equal(camera.estimateEngines.master.categoryKey,'color_simple');
 assert.equal(camera.estimateEngines.master.baseHours,1.5);
 assert.equal(camera.estimateEngines.master.adjustments.find(a=>a.key==='coloring').hours,1);
 assert.equal(camera.estimate.estimatedHours,2.5);
 assert.equal(camera.estimate.total,7500);
 assert.equal(camera.sent.totalPrice,7500);
 assert.equal(camera.sent.aiEstimatedHours,12); // retain original AI estimate for diagnosis
 const three=await run('単体カメラ、背景なし',3);
 assert.equal(three.estimate.total,22500);
 for (const [notes,complex,style,source,flags] of [
  ['',true,'color','photo_trace',{}],
  ['',false,'real','photo_trace',{}],
  ['背景込み',false,'color','photo_trace',{}],
  ['断面図',false,'color','reference_drawing',{}],
  ['',false,'color','photo_trace',{isExplodedView:true}],
  ['',false,'color','cad_conversion',{}],
  ['複数の製品',false,'color','photo_trace',{}]
 ]) {
  const result=await run(notes,1,complex,style,source,flags);
  assert.notEqual(result.estimateEngines.master.categoryKey,'color_simple');
 }
 console.log('Simple color API regression passed: 2.5h/7500 yen, quantities, real, complex, backgrounds, sections, exploded and CAD (AI/email mocked).');
})().catch(e=>{console.error(e);process.exitCode=1});
