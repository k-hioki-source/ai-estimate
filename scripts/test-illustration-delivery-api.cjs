const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,pid=uid(1),iid=uid(2),fid=uid(3);
function compile(file,require,env){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,Buffer,console,process:{env}});return exports;}
function load(state={}){let auth=0;const calls=[],env={NEXT_PUBLIC_CSWORKS_ILLUSTRATION_DELIVERY:state.off?'false':'true',NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic'};const domain=compile('lib/cs-works/delivery.ts',()=>{},env);return{...compile('app/api/cs-works/delivery/route.ts',name=>name==='next/server'?{NextResponse:{json:(body,opts)=>({body,...opts})}}:name==='@supabase/supabase-js'?{createClient:()=>({auth:{getUser:async()=>{auth++;return{data:{user:state.invalid?null:{id:uid(4)}}}}},rpc:async(name,args)=>{calls.push({name,args});return state.code?{error:{code:state.code}}:{data:{ok:true}}}})}:domain,env),calls,auth:()=>auth};}
const body={projectId:pid,action:'attach',illustrationId:iid,requestId:fid,name:'最終.ai',path:pid+'/delivery-final/'+fid,mime:'application/octet-stream',size:100};
const req=(b=body,auth=true)=>({headers:{get:()=>auth?'Bearer synthetic':null},nextUrl:new URL('https://synthetic.invalid?projectId='+pid),body:new ReadableStream({start(c){c.enqueue(Buffer.from(typeof b==='string'?b:JSON.stringify(b)));c.close()}})});
let n=0;const check=async(name,fn)=>{await fn();console.log('PASS',name);n++};
(async()=>{
 await check('flag off blocks GET and POST before auth',async()=>{const r=load({off:true});assert.equal((await r.GET(req())).status,404);assert.equal((await r.POST(req())).status,404);assert.equal(r.auth(),0)});
 await check('missing bearer rejected',async()=>assert.equal((await load().POST(req(body,false))).status,401));
 await check('expired session rejected',async()=>assert.equal((await load({invalid:true}).GET(req())).status,401));
 await check('GET forwards only authenticated project manifest',async()=>{const r=load();assert.equal((await r.GET(req())).status,200);assert.equal(r.calls[0].name,'csworks_get_delivery_manifest');assert.equal(r.calls[0].args.p_project_id,pid)});
 await check('malformed JSON and streamed oversize rejected',async()=>{assert.equal((await load().POST(req('{'))).status,400);assert.equal((await load().POST(req('x'.repeat(10001)))).status,413)});
 for(const bad of [{illustrationId:'bad'},{requestId:'bad'},{path:'other/path'},{name:'x\n.ai'},{size:0},{size:52428801},{size:1.5},{mime:''}])await check('invalid attach '+Object.keys(bad)[0],async()=>{const r=load();assert.equal((await r.POST(req({...body,...bad}))).status,400);assert.equal(r.calls.length,0)});
 await check('per-item attach forwards immutable target and retry ID',async()=>{const r=load();assert.equal((await r.POST(req())).status,200);assert.equal(r.calls[0].name,'csworks_register_delivery_file');assert.equal(r.calls[0].args.p_illustration_id,iid);assert.equal(r.calls[0].args.p_request_id,fid)});
 await check('common file has explicit null target',async()=>{const r=load();await r.POST(req({...body,illustrationId:null}));assert.equal(r.calls[0].args.p_illustration_id,null)});
 await check('remove forwards project-scoped RPC',async()=>{const r=load();await r.POST(req({action:'remove',projectId:pid,fileId:fid}));assert.equal(r.calls[0].name,'csworks_remove_delivery_file');assert.equal(r.calls[0].args.p_file_id,fid)});
 for(const[code,status]of[['42501',403],['40001',409],['23505',409],['22023',400],['42P01',503]])await check('DB '+code+' translated safely',async()=>assert.equal((await load({code}).POST(req())).status,status));
 console.log(n+' delivery API checks passed.');
})().catch(e=>{console.error(e);process.exit(1)});
