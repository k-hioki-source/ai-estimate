// Real API handler and pricing engines, synthetic AI + email, no network or real data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function compile(file,req){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Buffer,console,process:{cwd:()=>process.cwd()}},{filename:file});return exports}
const cache={};function local(file){file=path.resolve(file);return cache[file]??=compile(file,n=>local(path.resolve(path.dirname(file),n+'.ts')))}
async function run(notes,quantity,complex=false,options={}){let sent,analyzed;const route=compile('app/api/analyze/route.ts',n=>{
 if(n==='next/server')return{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}};
 if(n.endsWith('/estimate-review-token'))return{issueEstimateReviewTicket:()=>undefined};
 if(n.endsWith('/email'))return{sendNotificationEmail:async p=>{sent=p;return{estimateId:'SYNTHETIC'}}};
 if(n.endsWith('/openai'))return{analyzeImage:async p=>{analyzed=p;return options.ai??{workType:'standard_trace',difficultyScore:complex?80:40,partDensity:complex?80:30,lineDifficulty:complex?80:35,structureComplexity:complex?80:30,isExplodedView:false,hasLeaderLines:false,hasPartNumbers:false,isIndustrialProduct:true,summary:'写真未確認、依頼文に基づく線画の概算です。',estimatedHoursMin:complex?7:2.5,estimatedHours:p.combinedScope?(complex?9:3):1,estimatedHoursMax:complex?11:3.5}}};
 if(n==='fs/promises')return{default:{readFile:async()=>Buffer.from('synthetic reference sample')}};
 if(n==='path')return{default:path};
 return local(path.resolve('app/api/analyze',n+'.ts'));
 });const fields=new Map(Object.entries({sampleImagePath:'sample.png',sourceType:'photo_trace',usage:'manual',style:'line',notes,quantity:String(quantity),...options.fields}));const res=await route.POST({formData:async()=>({get:k=>fields.get(k)||null})});assert.equal(res.status,200);return{...res.body,sent,analyzed}}
(async()=>{let n=0;const pair=await run('側面図と部分拡大図の2点のイラストをお願いします',2);assert.equal(pair.analyzed.combinedScope,true);assert.equal(pair.analyzed.isReferenceSample,true);assert.equal(pair.sent.aiEstimatedHours,1.5);assert.equal(pair.estimate.total,10500);assert.equal(pair.estimate.estimatedHours*2,3.5);assert.equal(pair.sent.totalPrice,10500);assert.equal(pair.sent.estimatedHours*pair.sent.quantity,3.5);assert.equal(pair.estimateEngines.master.adjustments.some(a=>a.key==='angle'),false);assert.equal(pair.estimateEngines.master.hours,1.75);n+=9;
const repeated=await run('同じ製品の側面図を2点お願いします',2);assert.equal(repeated.analyzed.combinedScope,false);assert.equal(repeated.estimate.total,repeated.estimate.estimatedHours*3000*2);assert.equal(repeated.estimateEngines.master.adjustments.some(a=>a.key==='angle'),false);n+=3;
const complex=await run('細かな部品の多い側面図と部分拡大図の2点のイラスト',2,true);assert.ok(complex.estimate.total>pair.estimate.total);assert.equal(complex.estimate.total,complex.estimate.estimatedHours*3000*2);n+=2;
const cutawayNotes = '製品の仕組みを説明するカラーイラストを1点作成したい。モーターの立体カット図。写真と図面から作図が必要。';
const cutawayOptions = {
  fields: {sourceType:'reference_drawing', usage:'sales', style:'color'},
  ai: {
    workType:'realistic_illustration', difficultyScore:78, partDensity:78,
    lineDifficulty:75, structureComplexity:80, isExplodedView:false,
    hasLeaderLines:true, hasPartNumbers:false, isIndustrialProduct:true,
    summary:'販促向けの質感と複雑な内部機構の表現が必要な立体断面図です。',
    estimatedHoursMin:18, estimatedHours:22, estimatedHoursMax:26
  }
};
const cutaway = await run(cutawayNotes, 1, false, cutawayOptions);
assert.equal(cutaway.sent.workType, 'technical_drawing');
assert.equal(cutaway.sent.estimatedHours, 8);
assert.equal(cutaway.sent.totalPrice, 24000);
assert.equal(cutaway.sent.aiEstimatedHours, 22);
assert.equal(cutaway.estimateEngines.master.baseHours, 6);
assert.equal(cutaway.estimateEngines.master.adjustments.find(a=>a.key==='cutaway_coloring').hours, 2);
assert.match(cutaway.sent.aiReason, /作図6時間.*2時間/);
const realisticCutaway = await run(cutawayNotes + ' 写実的な質感で描写。', 1, false, cutawayOptions);
assert.notEqual(realisticCutaway.estimateEngines.master.categoryKey, 'color_explanatory_cutaway');
n+=8;
console.log(n+' actual API scope checks passed (AI/email mocked; no network).')})().catch(e=>{console.error(e);process.exitCode=1});
