// Real route handler + synthetic authenticated client. No external requests.
const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function compile(path,require,env={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,Buffer,console,URL,process:{env:{NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES:'true',NEXT_PUBLIC_SUPABASE_URL:'https://mock.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'synthetic',...env}}});return exports}
const id='00000000-0000-4000-8000-000000000001';
const item={item_key:id,number:'01',name:'Test',description:'',amount:1001,hours:.25};
const body={projectId:id,requestId:id,action:'present',expectedQuoteId:null,draftId:null,editVersion:0,deadline:'2026-12-01',items:[item]};
function load(state={}){const calls=[];let authCalls=0;const domain=compile('lib/cs-works/formal-quotes.ts',()=>{},state.disabled?{NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES:'false'}:{});const db={auth:{getUser:async()=>{authCalls++;return{data:{user:state.invalid?null:{id}}}}},rpc:async(name,args)=>{calls.push({name,args});return state.error?{error:{code:state.error}}:{data:{ok:true}}}};const route=compile('app/api/cs-works/formal-quotes/route.ts',n=>n==='next/server'?{NextResponse:{json:(body,opts)=>({body,...opts})}}:n==='@supabase/supabase-js'?{createClient:()=>db}:domain);return{...route,calls,domain,authCalls:()=>authCalls}}
function req(body,auth=true){return{headers:{get:()=>auth?'Bearer test':null},nextUrl:new URL('https://mock.invalid?projectId='+id),body:new ReadableStream({start(c){c.enqueue(Buffer.from(typeof body==='string'?body:JSON.stringify(body)));c.close()}})}}
let n=0;async function check(name,fn){await fn();n++;console.log('PASS',name)}
(async()=>{
 await check('disabled GET/POST perform no authentication or database work',async()=>{const r=load({disabled:true});assert.equal((await r.GET(req({}))).status,404);assert.equal((await r.POST(req({}))).status,404);assert.equal(r.authCalls(),0);assert.equal(r.calls.length,0)});
 await check('missing token rejected',async()=>assert.equal((await load().POST(req(body,false))).status,401));
 await check('invalid session rejected',async()=>assert.equal((await load({invalid:true}).POST(req(body))).status,401));
 await check('malformed JSON rejected',async()=>assert.equal((await load().POST(req('{'))).status,400));
 await check('actual streamed body size checked',async()=>assert.equal((await load().POST(req('x'.repeat(600001)))).status,413));
 await check('fractional yen refused before RPC',async()=>{const r=load();assert.equal((await r.POST(req({...body,items:[{...item,amount:1.2}]}))).status,400);assert.equal(r.calls.length,0)});
 await check('duplicate item identifiers refused before RPC',async()=>assert.equal((await load().POST(req({...body,items:[item,item]}))).status,400));
 await check('missing expected version refused before RPC',async()=>assert.equal((await load().POST(req({...body,editVersion:null}))).status,400));
 await check('sum/tax rounds once for the full subtotal',async()=>{const t=load().domain.quoteTotals([item,{...item,item_key:id.replace(/1$/,'2'),number:'02',amount:1008}]);assert.equal(t.subtotal,2009);assert.equal(t.tax,200);assert.equal(t.total,2209)});
 await check('present forwards caller-scoped versioned RPC',async()=>{const r=load();assert.equal((await r.POST(req(body))).status,200);assert.equal(r.calls[0].name,'csworks_save_quote');assert.equal(r.calls[0].args.p_present,true)});
 await check('draft forwards same validated RPC without presentation',async()=>{const r=load();await r.POST(req({...body,action:'save'}));assert.equal(r.calls[0].args.p_present,false)});
 await check('order requires exact quote ID',async()=>{const r=load();assert.equal((await r.POST(req({action:'order',projectId:id,requestId:id}))).status,400);assert.equal(r.calls.length,0)});
 await check('order forwards viewed quote ID and retry ID',async()=>{const r=load();await r.POST(req({action:'order',projectId:id,requestId:id,quoteId:id}));assert.equal(r.calls[0].name,'csworks_order_quote');assert.equal(r.calls[0].args.p_quote_id,id)});
 await check('GET reads authenticated quote context',async()=>{const r=load();await r.GET(req({}));assert.equal(r.calls[0].name,'csworks_get_quotes')});
 for(const [code,status]of [['42501',403],['40001',409],['23505',409],['22023',400],['42P01',503]])await check('DB error '+code+' fails safely',async()=>assert.equal((await load({error:code}).POST(req(body))).status,status));
 console.log(n+' API/domain checks passed.');
})().catch(e=>{console.error(e);process.exit(1)});
