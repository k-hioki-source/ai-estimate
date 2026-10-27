// Actual React components on localhost; synthetic auth/server, no remote customer data.
const fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),assert=require('node:assert/strict');
const deps=process.env.CSWORKS_QUOTE_TEST_DEPS||'/tmp/csworks-quote-tests/node_modules';
const {build}=require(path.join(deps,'esbuild')); const {chromium}=require(path.join(deps,'playwright'));
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'csworks-quotes-ui-'));
const projectId='00000000-0000-4000-8000-000000000011';
let context={current:null,draft:null,history:[]},calls=[],conflict=false,failGet=false,n=0;
const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Editor from ${JSON.stringify(path.join(root,'components/cs-works/FormalQuoteEditor.tsx'))};import Details from ${JSON.stringify(path.join(root,'components/cs-works/FormalQuoteDetails.tsx'))};
function App(){const[p,setP]=useState({id:'${projectId}',status:'quote_requested'});return location.search.includes('document')?<Details projectId='${projectId}' quoteId={new URLSearchParams(location.search).get('quote')}/>:<Editor project={location.search.includes('accepted')?{...p,status:'ordered'}:p} onPresented={async project=>setP(project)}><p>Legacy quote form</p></Editor>};createRoot(document.getElementById('root')).render(<App/>);`;
async function bundle(enabled){await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,outfile:path.join(tmp,'app.js'),platform:'browser',jsx:'automatic',nodePaths:[path.join(root,'node_modules')],define:{'process.env.NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES':JSON.stringify(enabled?'true':'false'),'process.env.NODE_ENV':'"development"'},plugins:[{name:'synthetic-auth',setup(b){b.onResolve({filter:/supabase\/client$/},()=>({path:'auth',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const getSupabaseBrowserClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}});`,loader:'js'}))}}]})}
(async()=>{
 await bundle(true);
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/fonts.css'){res.setHeader('Content-Type','text/css');return res.end(fs.readFileSync(path.join(deps,'@fontsource/noto-sans-jp/400.css'),'utf8').replaceAll('./files/','/fonts/'))}
  if(req.url.startsWith('/fonts/')){res.setHeader('Content-Type','font/woff2');return res.end(fs.readFileSync(path.join(deps,'@fontsource/noto-sans-jp/files',path.basename(req.url))))}
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(tmp,'app.js')))}
  if(req.url.startsWith('/api/cs-works/formal-quotes')){
   res.setHeader('Content-Type','application/json');
   if(req.method==='GET'){calls.push('GET');if(failGet){res.statusCode=503;return res.end(JSON.stringify({error:'明細を取得できません'}))}return res.end(JSON.stringify(context))}
   let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw);calls.push(b);
   if(conflict){res.statusCode=409;return res.end(JSON.stringify({error:'見積りが更新されています。再読み込みしてください。'}))}
   assert.equal(b.projectId,projectId);assert.equal(b.expectedQuoteId,context.current?.id??null);
   assert.equal(b.draftId,context.draft?.id??null);assert.equal(b.editVersion,context.draft?.edit_version??0);
   await new Promise(r=>setTimeout(r,100));
   const q={id:context.draft?.id??'00000000-0000-4000-8000-'+String(100+context.history.length).padStart(12,'0'),project_id:projectId,revision:context.draft?.revision??context.history.length+1,edit_version:(context.draft?.edit_version??0)+1,state:b.action==='present'?'presented':'draft',title:'Synthetic project',description:'',deadline:b.deadline,subtotal:b.items.reduce((s,x)=>s+x.amount,0),hours:b.items.reduce((s,x)=>s+x.hours,0),items:b.items};
   if(b.action==='present'){context={current:q,draft:null,history:[q,...context.history]}}else context.draft=q;
   return res.end(JSON.stringify({quote:q,project:{id:projectId,status:b.action==='present'?'quote_presented':'quote_requested',formal_quote_id:context.current?.id??null},replayed:false}));
  }
  res.setHeader('Content-Type','text/html');res.end('<html><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><style>body{font-family:Arial,"Noto Sans JP",sans-serif;margin:16px}input,textarea,button{font:inherit;padding:6px}button{cursor:pointer}table{table-layout:auto}</style><div id="root"></div><script src="/app.js"></script></html>')
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const c=(await import(path.join(deps,'@sparticuz/chromium/build/index.js'))).default;
 const browser=await chromium.launch({executablePath:process.env.CSWORKS_CHROMIUM_PATH||await c.executablePath(),args:c.args,headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 const check=async(name,fn)=>{await fn();n++;console.log('PASS',name)};
 try{
 await page.goto(origin);
 await check('legacy form preserved until admin chooses line items',async()=>{await page.getByText('Legacy quote form').waitFor();assert.equal(await page.getByRole('button',{name:'下書き保存',exact:true}).count(),0)});
 await page.getByRole('button',{name:'イラストごとの明細で見積もる'}).click();
 await check('two independently priced illustrations calculate total and tax',async()=>{
  await page.getByLabel('明細1の名前').fill('全体図');await page.getByLabel('明細1の金額').fill('1001');await page.getByLabel('明細1の工数').fill('1.25');
  await page.getByRole('button',{name:'＋ イラストを追加'}).click();await page.getByLabel('明細2の名前').fill('分解図');await page.getByLabel('明細2の金額').fill('2002');await page.getByLabel('明細2の工数').fill('2.5');await page.locator('input[type=date]').fill('2026-12-01');await page.getByText(/税込合計：3,303円/).waitFor();
 });
 await check('save private draft and reload restores item identifiers and values',async()=>{
  await page.getByRole('button',{name:'下書き保存',exact:true}).click();await page.getByRole('status').filter({hasText:'下書きを保存しました'}).waitFor();const keys=context.draft.items.map(x=>x.item_key);await page.reload();await page.getByLabel('明細1の名前').waitFor();assert.equal(await page.getByLabel('明細2の金額').inputValue(),'2002');assert.deepEqual(context.draft.items.map(x=>x.item_key),keys);
 });
 await check('presentation confirms once and locks in a version',async()=>{page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'この明細で正式見積りを提示'}).click();await page.getByRole('status').filter({hasText:'正式見積りを提示しました'}).waitFor();assert.equal(context.history.length,1);assert.equal(context.current.subtotal,3003);assert.equal(await page.getByText('Legacy quote form').count(),0)});
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(tmp,'quote-editor.png'),fullPage:true});
 await check('failed conflict keeps unsaved values',async()=>{conflict=true;await page.getByLabel('明細2の金額').fill('5000');await page.getByRole('button',{name:'下書き保存',exact:true}).click();await page.getByRole('alert').filter({hasText:'見積りが更新'}).waitFor();assert.equal(await page.getByLabel('明細2の金額').inputValue(),'5000');assert.equal(context.current.items[1].amount,2002);conflict=false});
 await page.getByRole('button',{name:'下書き保存',exact:true}).click();await page.getByRole('status').filter({hasText:'下書きを保存しました'}).waitFor();
 await check('mobile editor keeps controls within viewport',async()=>{await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await page.getByLabel('明細2の名前').scrollIntoViewIfNeeded();assert.equal(await page.getByLabel('明細2の名前').isVisible(),true)});
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(tmp,'quote-mobile.png'),fullPage:true});
 await check('accepted quote is read-only with no editing buttons',async()=>{await page.goto(origin+'/?accepted');await page.getByText('全体図',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'下書き保存',exact:true}).count(),0);assert.equal(await page.getByRole('textbox').count(),0)});
 await check('document renders specified immutable quote version',async()=>{await page.goto(origin+'/?document&quote='+context.current.id);await page.getByText('全体図',{exact:true}).waitFor();assert.equal(await page.getByText('2,002円',{exact:true}).count(),1);assert.equal(await page.getByRole('textbox').count(),0)});
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(tmp,'quote-document.png'),fullPage:true});
 await check('document retrieval failure shows explicit error',async()=>{failGet=true;await page.reload();await page.getByRole('alert').waitFor();assert.equal(await page.getByText('全体図',{exact:true}).count(),0);failGet=false});
 await check('feature flag off retains legacy UI without any quote request',async()=>{await bundle(false);calls=[];await page.goto(origin);await page.getByText('Legacy quote form').waitFor();assert.equal(calls.length,0)});
 assert.deepEqual(errors,[]);console.log(`${n} browser checks passed. Screenshots: ${tmp}`);
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
