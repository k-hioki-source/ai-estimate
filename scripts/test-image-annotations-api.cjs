// Executes the real API handler with authenticated-client doubles; no network.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const base='lib/cs-works/image-annotations.ts';
function compile(path, require, extra={}) {const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,console,process:{env:{NEXT_PUBLIC_CSWORKS_IMAGE_ANNOTATIONS:'true',NEXT_PUBLIC_SUPABASE_URL:'https://mock.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'mock'}},Buffer,URL,...extra});return exports;}
const uid='00000000-0000-4000-8000-000000000001';
const document={schemaVersion:1,pins:[],strokes:[]};
class Response {static json(body,opts){return {body,...opts}}}
function load(state={}) {
 const calls=[];const domain=compile(base,()=>{});
 if(state.disabled)domain.annotationsEnabled=false;
 const db={auth:{getUser:async()=>({data:{user:state.invalid?null:{id:uid}}})},rpc:async(name,args)=>{calls.push({name,args});return state.error?{error:{code:state.error}}:{data:{version:1}}},from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:state.other?null:{id:uid}}),order(){return q},limit(){return q},in(){return q},then(fn){const rows=state.history?(table==='project_review_batches'?[{id:uid}]:table==='project_review_batch_files'?[{batch_id:uid,file_id:uid}]:table==='project_file_annotations'?[{batch_id:uid,file_id:uid,document}]:[{id:uid}]):[];return Promise.resolve({data:rows,count:state.truncated&&table==='project_review_batch_files'?2:rows.length,error:state.schema?{code:'42P01'}:null}).then(fn)}};return q}};
 const route=compile('app/api/cs-works/image-annotations/route.ts',name=>name==='next/server'?{NextResponse:Response}:name==='@supabase/supabase-js'?{createClient:()=>db}:domain);
 return {...route,calls,domain};
}
function request(body,auth=true){return {headers:{get:k=>k==='authorization'&&auth?'Bearer mock':null},nextUrl:new URL('https://mock.invalid?projectId='+uid),body:new ReadableStream({start(c){c.enqueue(Buffer.from(typeof body==='string'?body:JSON.stringify(body)));c.close()}})}}
let n=0;async function check(label,fn){await fn();console.log('PASS',label);n++}
(async()=>{
 await check('feature disabled has no DB calls',async()=>{const r=load({disabled:true});assert.equal((await r.POST(request({}))).status,404);assert.equal(r.calls.length,0)});
 await check('missing authentication rejected',async()=>assert.equal((await load().POST(request({},false))).status,401));
 await check('invalid session rejected',async()=>assert.equal((await load({invalid:true}).POST(request({}))).status,401));
 await check('malformed JSON rejected',async()=>assert.equal((await load().POST(request('{'))).status,400));
 await check('chunked payload limit enforced',async()=>assert.equal((await load().POST(request('x'.repeat(2000001)))).status,413));
 await check('invalid coordinates rejected before RPC',async()=>{const r=load();assert.equal((await r.POST(request({action:'save',projectId:uid,batchId:uid,fileId:uid,version:0,document:{...document,pins:[{id:'pin',number:1,x:1.1,y:0,comment:'test'}]}}))).status,400);assert.equal(r.calls.length,0)});
 await check('duplicate pins rejected',async()=>{const r=load();assert.equal(r.domain.validateAnnotations({...document,pins:[{id:'p',number:1,x:0,y:0,comment:'A'},{id:'p2',number:1,x:0,y:0,comment:'B'}]}),false)});
 await check('out-of-date version maps to conflict',async()=>assert.equal((await load({error:'40001'}).POST(request({action:'save',projectId:uid,batchId:uid,fileId:uid,version:0,document}))).status,409));
 await check('RPC owner rejection maps to forbidden',async()=>assert.equal((await load({error:'42501'}).POST(request({action:'save',projectId:uid,batchId:uid,fileId:uid,version:0,document}))).status,403));
 await check('save uses validated caller-scoped RPC',async()=>{const r=load();assert.equal((await r.POST(request({action:'save',projectId:uid,batchId:uid,fileId:uid,version:0,document}))).status,200);assert.equal(r.calls[0].name,'csworks_save_annotations')});
 await check('review submit uses original workflow wrapper',async()=>{const r=load();await r.POST(request({action:'submit',projectId:uid,batchId:uid,requestId:uid,reviewAction:'revision_request',comment:'修正'}));assert.equal(r.calls[0].name,'csworks_submit_review')});
 await check('another project context not disclosed',async()=>assert.equal((await load({other:true}).GET(request({}))).status,404));
 await check('complete review context can be read',async()=>{const r=await load({history:true}).GET(request({}));assert.equal(r.status,200);assert.equal(r.body.annotations.length,1)});
 await check('truncated DB responses fail closed',async()=>assert.equal((await load({history:true,truncated:true}).GET(request({}))).status,409));
 await check('missing new DB schema fails closed',async()=>assert.equal((await load({schema:true}).GET(request({}))).status,503));
 await check('image types limited to PNG JPEG',async()=>{const r=load();assert.equal(r.domain.annotationImage('test.pdf','application/pdf'),false);assert.equal(r.domain.annotationImage('test.gif','image/gif'),false);assert.equal(r.domain.annotationImage('test.png','image/png'),true)});
 await check('coordinate mapping stable after scaling',async()=>{const {imagePoint}=load().domain;const a=imagePoint(120,180,{left:20,top:30,width:400,height:300});const b=imagePoint(220,330,{left:20,top:30,width:800,height:600});assert.equal(a.x,b.x);assert.equal(a.y,b.y)});
 console.log(n+' API/domain checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
