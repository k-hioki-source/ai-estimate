// Real API handler and pricing engines, synthetic AI + email, no network or real data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function compile(file,req){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Buffer,console,process:{cwd:()=>process.cwd()}},{filename:file});return exports}
const cache={};function local(file){file=path.resolve(file);return cache[file]??=compile(file,n=>local(path.resolve(path.dirname(file),n+'.ts')))}

async function run(overrides={}) {
 let sent;
 const analysis={workType:'concept_diagram',difficultyScore:85,partDensity:55,lineDifficulty:55,structureComplexity:55,coloringComplexity:55,realLineHours:3,realColorHours:5,isExplodedView:false,hasLeaderLines:false,hasPartNumbers:false,isIndustrialProduct:true,summary:'写真をもとにした製品の販促用リアルイラスト。複雑な曲面と金属質感、陰影を含む。',estimatedHoursMin:24,estimatedHours:26,estimatedHoursMax:30,...overrides.analysis};
 const route=compile('app/api/analyze/route.ts',n=>{
  if(n==='next/server')return{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}};
  if(n.endsWith('/estimate-review-token'))return{issueEstimateReviewTicket:()=>undefined};
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
 const r=await run();assert.equal(r.estimate.estimatedHours,8);assert.equal(r.estimate.total,24000);assert.equal(r.sent.workType,'realistic_illustration');assert.equal(r.sent.masterCategory,'リアルイラスト・写真支給・工程別');assert.equal(r.sent.systemHours,8);assert.equal(r.sent.aiEstimatedHours,8);assert.equal(r.sent.masterEstimatedHours,8);assert.match(r.vision.summary || r.vision.reason || '', /線画3時間/);
 const q=await run({fields:{quantity:'3'}});assert.equal(q.estimate.total,72000);
 const photo=await run({fields:{sourceType:'photo_trace'}});assert.equal(photo.estimate.total,24000);
 const tool=await run({analysis:{partDensity:70,lineDifficulty:70,structureComplexity:70,coloringComplexity:70,realLineHours:5,realColorHours:8}});assert.equal(tool.estimate.estimatedHours,13);assert.equal(tool.estimate.total,39000);
 const simple=await run({analysis:{partDensity:20,lineDifficulty:20,structureComplexity:20,coloringComplexity:20,realLineHours:1.5,realColorHours:2}});assert.equal(simple.estimate.estimatedHours,3.5);
 const complex=await run({analysis:{partDensity:85,lineDifficulty:85,structureComplexity:85,coloringComplexity:85,realLineHours:7,realColorHours:12}});assert.equal(complex.estimate.estimatedHours,19);
 const fallback=await run({analysis:{realLineHours:undefined,realColorHours:undefined}});assert.equal(fallback.estimate.estimatedHours,8);
 const independent=await run({analysis:{realLineHours:4,realColorHours:6}});assert.equal(independent.estimate.estimatedHours,8);
 const reported=await run({analysis:{partDensity:55,lineDifficulty:65,structureComplexity:50,coloringComplexity:75,realLineHours:7,realColorHours:8}});assert.equal(reported.estimate.estimatedHours,8);assert.equal(reported.estimate.total,24000);assert.match(reported.vision.reason,/線画3時間/);assert.match(reported.vision.reason,/陰影5時間/);assert.match(reported.vision.reason,/AI初期推定/);
 const highAiTool=await run({analysis:{partDensity:70,lineDifficulty:75,structureComplexity:70,coloringComplexity:85,realLineHours:8,realColorHours:13}});assert.equal(highAiTool.estimate.estimatedHours,13);
 const lowerAi=await run({analysis:{realLineHours:2,realColorHours:4}});assert.ok(lowerAi.estimate.estimatedHours<8);
 const scope=local(path.resolve('lib/realProductEstimate.ts'));
 const base={style:'real',usage:'sales',sourceType:'reference_drawing',notes:'製品の写真からリアルイラスト',isIndustrialProduct:true};
 for(const extra of ['背景込み','断面図','分解図','内部構造','別アングル','2台を横並び','概念図','3DCG','カバーを外す'])assert.equal(scope.isPhotoAlignedRealProduct({...base,notes:base.notes+extra}),false,extra);
 assert.equal(scope.isPhotoAlignedRealProduct({...base,style:'color'}),false);
 assert.equal(scope.isPhotoAlignedRealProduct({...base,notes:base.notes+' 背景なし'}),true);
 const cut=await run({fields:{notes:'製品の写真をもとに内部構造の断面図をリアルに新規作図する'}});assert.notEqual(cut.sent.masterCategory,r.sent.masterCategory);assert.ok(cut.estimate.estimatedHours>16);
 console.log('PASS variable real-product steps: 3+5=8h/24000; 5+8=13h/39000; simple3.5h/complex19h; AI-step differences, missing-step fallback, quantities and exclusions (AI/email mocked).');
})().catch(e=>{console.error(e);process.exitCode=1});


