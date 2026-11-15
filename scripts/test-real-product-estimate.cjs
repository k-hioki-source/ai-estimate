// Real API handler and pricing engines, synthetic AI + email, no network or real data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function compile(file,req){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Buffer,console,process:{cwd:()=>process.cwd()}},{filename:file});return exports}
const cache={};function local(file){file=path.resolve(file);return cache[file]??=compile(file,n=>local(path.resolve(path.dirname(file),n+'.ts')))}

async function run(overrides={}) {
 let sent;
 const analysis={workType:'concept_diagram',difficultyScore:85,partDensity:75,lineDifficulty:75,structureComplexity:80,isExplodedView:false,hasLeaderLines:false,hasPartNumbers:false,isIndustrialProduct:true,summary:'写真をもとにした製品の販促用リアルイラスト。複雑な曲面と金属質感、陰影を含む。',estimatedHoursMin:24,estimatedHours:26,estimatedHoursMax:30,...overrides.analysis};
 const route=compile('app/api/analyze/route.ts',n=>{
  if(n==='next/server')return{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}};
  if(n.endsWith('/email'))return{sendNotificationEmail:async p=>{sent=p;return{estimateId:'SYNTHETIC'}}};
  if(n.endsWith('/openai'))return{analyzeImage:async()=>analysis};
  if(n==='fs/promises')return{default:{readFile:async()=>Buffer.from('synthetic image')}};
  if(n==='path')return{default:path};
  return local(path.resolve('app/api/analyze',n+'.ts'));
 });
 const fields=new Map(Object.entries({sampleImagePath:'sample.png',sourceType:'reference_drawing',usage:'sales',style:'real',notes:'支給資料：写真\n用途：販促・WEB掲載\n表現：リアルイラスト\n製品の写真をもとに販促用リアルイラストを1点作成したい。',quantity:'1',...overrides.fields}));
 const res=await route.POST({formData:async()=>({get:k=>fields.get(k)||null})});assert.equal(res.status,200);return{...res.body,sent};
}
(async()=>{
 const r=await run();assert.equal(r.estimate.estimatedHours,16);assert.equal(r.estimate.total,48000);assert.equal(r.sent.workType,'realistic_illustration');assert.equal(r.sent.masterCategory,'リアルイラスト・写真支給・製品単体');assert.equal(r.sent.systemHours,16);assert.equal(r.sent.aiEstimatedHours,16);assert.equal(r.sent.masterEstimatedHours,16);
 const q=await run({fields:{quantity:'3'}});assert.equal(q.estimate.total,144000);
 const photo=await run({fields:{sourceType:'photo_trace'}});assert.equal(photo.estimate.total,48000);
 const scope=local(path.resolve('lib/realProductEstimate.ts'));
 const base={style:'real',usage:'sales',sourceType:'reference_drawing',notes:'製品の写真からリアルイラスト',isIndustrialProduct:true};
 for(const extra of ['背景込み','断面図','分解図','内部構造','別アングル','2台を横並び','概念図','3DCG','カバーを外す'])assert.equal(scope.isPhotoAlignedRealProduct({...base,notes:base.notes+extra}),false,extra);
 assert.equal(scope.isPhotoAlignedRealProduct({...base,style:'color'}),false);
 assert.equal(scope.isPhotoAlignedRealProduct({...base,notes:base.notes+' 背景なし'}),true);
 const cut=await run({fields:{notes:'製品の写真をもとに内部構造の断面図をリアルに新規作図する'}});assert.notEqual(cut.sent.masterCategory,r.sent.masterCategory);assert.ok(cut.estimate.estimatedHours>16);
 console.log('Real product calibration passed: reproduced 85-point/26h AI estimate -> 16h/48,000 yen; quantities, photo source and complex-scope exclusions verified (mock AI/email).');
})().catch(e=>{console.error(e);process.exitCode=1});
