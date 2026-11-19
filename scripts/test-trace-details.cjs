// Real API handler and pricing engines, synthetic AI + email, no network or real data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function compile(file,req){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,Buffer,console,process:{cwd:()=>process.cwd()}},{filename:file});return exports}
const cache={};function local(file){file=path.resolve(file);return cache[file]??=compile(file,n=>local(path.resolve(path.dirname(file),n+'.ts')))}

async function run(parts,details,quantity=1,sample=false, lineArtScope, style='line', sourceType='photo_trace'){let sent;const route=compile('app/api/analyze/route.ts',n=>{
 if(n==='next/server')return{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}};
 if(n.endsWith('/estimate-review-token'))return{issueEstimateReviewTicket:()=>undefined};
 if(n.endsWith('/email'))return{sendNotificationEmail:async p=>{sent=p;return{estimateId:'SYNTHETIC'}}};
 if(n.endsWith('/openai'))return{analyzeImage:async()=>({workType:'simple_trace',difficultyScore:35,partDensity:35,lineDifficulty:40,structureComplexity:45,lineArtScope,visibleComponentCount:parts,repeatedDetailCount:details,isExplodedView:false,hasLeaderLines:false,hasPartNumbers:false,isIndustrialProduct:true,summary:'単体製品の外形だけの簡易トレースと誤認した応答を再現します。',estimatedHoursMin:.8,estimatedHours:1,estimatedHoursMax:1.5})};
 if(n==='fs/promises')return{default:{readFile:async()=>Buffer.from('synthetic reference')}};
 if(n==='path')return{default:path};return local(path.resolve('app/api/analyze',n+'.ts'));
 });const fields=new Map(Object.entries({sourceType,usage:'manual',style,notes:'製品写真から、取扱説明書用の白黒線画を1点作成したい。',quantity:String(quantity)}));
 if(sample)fields.set('sampleImagePath','sample.png');else fields.set('image',{size:1,type:'image/jpeg',name:'synthetic.jpg',arrayBuffer:async()=>Buffer.from('synthetic')});
 const res=await route.POST({formData:async()=>({get:k=>fields.get(k)||null})});assert.equal(res.status,200);return{...res.body,sent};}
(async()=>{
 const many=await run(6,120);assert.equal(many.estimate.estimatedHours,4);assert.equal(many.estimate.total,12000);assert.equal(many.sent.workType,'standard_trace');assert.equal(many.sent.masterCategory,'写真トレース・複数部品と反復細部');assert.match(many.vision.reason,/6ユニット/);
 const simple=await run(1,4);assert.ok(simple.estimate.estimatedHours<2);assert.equal(simple.sent.workType,'simple_trace');
 const more=await run(10,320);assert.ok(more.estimate.estimatedHours>many.estimate.estimatedHours);
 const repeated=await run(6,120,2);assert.equal(repeated.estimate.total,24000);assert.equal(repeated.sent.quantity,2);
 const sample=await run(6,120,1,true);assert.ok(sample.estimate.estimatedHours<2,'Reference sample details cannot prove actual customer scope');
 const scope={material:'photo',workflow:'trace',precision:false,retainedDetails:[],unclearRequiredDetails:false};
 const detailed={...scope,precision:true,retainedDetails:['overlaps','repeated_shapes','surface_patterns','small_features']};
 const scooter=await run(1,48,1,false,detailed);
 assert.equal(scooter.estimate.estimatedHours,3);
 assert.equal(scooter.estimate.total,9000);
 assert.equal(scooter.sent.workType,'standard_trace');
 const outline=await run(1,4,1,false,scope);
 assert.equal(outline.estimate.estimatedHours,1);
 const precision=await run(1,4,1,false,{...scope,precision:true});
 assert.equal(precision.estimate.estimatedHours,1.5);
 const blurry=await run(1,48,1,false,{...detailed,unclearRequiredDetails:true});
 assert.equal(blurry.estimate.estimatedHours,3.5);
 assert.equal(blurry.confidence.level,'中');
 const materials=await Promise.all(['logo','line_underlay','3d_capture','photo'].map(material=>
   run(1,48,1,false,{...detailed,material})));
 assert.deepEqual(materials.map(result=>result.estimate.estimatedHours),[1.5,2,2.5,3]);
 const simpleColor=await run(1,4,1,false,{...scope,precision:true},'color');
 assert.equal(simpleColor.estimate.estimatedHours,2.5);
 const plan=await run(1,4,1,false,{...scope,material:'drawing',workflow:'draw_from_plan'},'line','reference_drawing');
 assert.equal(plan.estimate.estimatedHours,2.5);
 const reconstruction=await run(1,4,1,false,{...scope,workflow:'reconstruct'},'line','reference_drawing');
 assert.equal(reconstruction.estimate.estimatedHours,4);
 const dense=await run(1,120,1,false,detailed);
 assert.equal(dense.estimate.estimatedHours,4);
 const gatedSample=await run(1,48,1,true,detailed);
 assert.ok(gatedSample.estimate.estimatedHours<2,'structured detail from example images is ignored');
 console.log('PASS detail-trace API: low-score/simple AI + 6 units/120 details ->4h/12000; simple remains simple; denser scope increases; unit count not order quantity; samples excluded.');
})().catch(e=>{console.error(e);process.exitCode=1});
