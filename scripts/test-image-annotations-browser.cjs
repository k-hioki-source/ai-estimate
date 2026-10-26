// Isolated localhost harness rendering the real React editor, with synthetic image/data.
// npm install --prefix /tmp/csworks-annotation-test esbuild @sparticuz/chromium
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const deps=process.env.CSWORKS_TEST_DEPS || '/tmp/csworks-annotation-test/node_modules';
const {build}=require(path.join(deps,'esbuild'));
const {chromium}=require('playwright');
const root=process.cwd(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'csworks-annotations-ui-'));
const fileId='00000000-0000-4000-8000-000000000011',batchId='00000000-0000-4000-8000-000000000010',projectId='00000000-0000-4000-8000-000000000001';
let saved=null,conflict=false,saveCount=0,count=0;
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
function chunk(type,data){const t=Buffer.from(type),len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc])}
const hdr=Buffer.alloc(13);hdr.writeUInt32BE(800,0);hdr.writeUInt32BE(500,4);hdr[8]=8;hdr[9]=2;
const pixels=Buffer.alloc((800*3+1)*500,255);for(let y=0;y<500;y++)pixels[y*(800*3+1)]=0;
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
const entry=`import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import Editor from ${JSON.stringify(path.join(root,'components/cs-works/ProjectImageAnnotations.tsx'))};
import Preview from ${JSON.stringify(path.join(root,'components/cs-works/ProjectFilePreview.tsx'))};
function App(){const [saved,setSaved]=useState(undefined),[open,setOpen]=useState(true);useEffect(()=>{fetch('/fixture').then(r=>r.json()).then(setSaved)},[]);if(saved===undefined)return <p>Loading</p>;return <><button onClick={()=>setOpen(true)}>Open editor</button><Preview url={location.origin+'/image.png'} fileName="sample.png" mimeType="image/png"/>{open&&<Editor projectId="${projectId}" batchId="${batchId}" file={{id:'${fileId}',file_name:'sample.png'}} url="/image.png" editable={!location.search.includes('readonly')} saved={saved} onClose={()=>setOpen(false)}/>}</>};createRoot(document.getElementById('root')).render(<App/>);`;
(async()=>{
 await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,outfile:path.join(tmp,'app.js'),platform:'browser',jsx:'automatic',nodePaths:[path.join(root,'node_modules')],define:{'process.env.NEXT_PUBLIC_CSWORKS_IMAGE_ANNOTATIONS':'"true"','process.env.NODE_ENV':'"development"'},plugins:[{name:'mock-auth-only',setup(b){b.onResolve({filter:/supabase\/client$/},()=>({path:'mock-client',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const getSupabaseBrowserClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'synthetic-test'}}})}});`,loader:'js'}))}}]});
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/fonts.css'){res.setHeader('Content-Type','text/css');return res.end(fs.readFileSync(path.join(deps,'@fontsource/noto-sans-jp/400.css'),'utf8').replaceAll('./files/','/fonts/'))}
  if(req.url.startsWith('/fonts/')){res.setHeader('Content-Type','font/woff2');return res.end(fs.readFileSync(path.join(deps,'@fontsource/noto-sans-jp/files',path.basename(req.url))))}
  if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(tmp,'app.js')))}
  if(req.url==='/image.png'){res.setHeader('Content-Type','image/png');return res.end(png)}
  if(req.url==='/fixture'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(saved))}
  if(req.url==='/api/cs-works/image-annotations'&&req.method==='POST'){
   let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);res.setHeader('Content-Type','application/json');
   if(conflict){res.statusCode=409;return res.end(JSON.stringify({error:'確認状態または保存内容が更新されています。再読み込みして確認してください。'}))}
   assert.equal(body.projectId,projectId);assert.equal(body.fileId,fileId);assert.equal(body.batchId,batchId);assert.equal(body.version,saved?.version??0);
   saved={batch_id:batchId,file_id:fileId,version:(saved?.version??0)+1,document:body.document,finalized_at:null};saveCount++;return res.end(JSON.stringify(saved));
  }
  res.setHeader('Content-Type','text/html');res.end('<html><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><style>body{font-family:Arial,"Noto Sans JP",sans-serif}button,textarea{font-family:inherit}</style><div id="root"></div><script src="/app.js"></script></html>');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const {default:c}=await import(path.join(deps,'@sparticuz/chromium/build/index.js'));
 // A stock Playwright executable can be supplied instead. Chromium binary is a test-only dependency.
 const browser=await chromium.launch({executablePath:process.env.CSWORKS_CHROMIUM_PATH||'/tmp/chromium',args:c.args,headless:true});
 const page=await browser.newPage({viewport:{width:1500,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 async function check(label,fn){await fn();count++;console.log('PASS',label)}
 async function bounds(){return page.getByTestId('annotation-overlay').boundingBox()}
 async function clickAt(x,y){const b=await bounds();await page.mouse.click(b.x+b.width*x,b.y+b.height*y)}
 async function line(){const b=await bounds();await page.mouse.move(b.x+b.width*.1,b.y+b.height*.15);await page.mouse.down();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.45,{steps:8});await page.mouse.up()}
 try{
  await page.goto(origin);await page.getByTestId('annotation-overlay').waitFor();
  await check('comment pin placed on image',async()=>{await clickAt(.25,.4);await page.getByLabel('新しいピンのコメント').fill('左の形状を修正してください');await page.getByRole('button',{name:'ピンを追加',exact:true}).click();assert.equal(await page.locator('[data-pin-number="1"]').count(),1)});
  await check('freehand red stroke drawn',async()=>{await page.getByRole('button',{name:'赤ペン',exact:true}).click();await line();assert.equal(await page.locator('polyline').count(),1);assert.equal(await page.locator('polyline').getAttribute('stroke'),'#dc2626')});
  await check('undo removes latest line',async()=>{await page.getByRole('button',{name:'取り消し',exact:true}).click();assert.equal(await page.locator('polyline').count(),0)});
  await line();
  await check('selected line can be deleted',async()=>{await page.getByRole('button',{name:'線を選択',exact:true}).click();await clickAt(.3,.3);await page.getByRole('button',{name:'選択した線を削除',exact:true}).click();assert.equal(await page.locator('polyline').count(),0)});
  await page.getByRole('button',{name:'赤ペン',exact:true}).click();await line();
  await check('pins and strokes saved to original file ID',async()=>{await page.getByRole('button',{name:'下書き保存',exact:true}).click();await page.getByRole('status').filter({hasText:'下書きを保存しました'}).waitFor();assert.equal(saveCount,1);assert.equal(saved.document.pins[0].x,.25);assert.equal(saved.document.pins[0].y,.4);assert.equal(saved.document.strokes.length,1)});
  await check('zoom keeps existing pin at same normalized position',async()=>{await page.getByRole('button',{name:'画像を拡大',exact:true}).click();const b=await bounds();const p=await page.locator('[data-pin-number="1"] circle').boundingBox();assert.ok(Math.abs(((p.x+p.width/2)-b.x)/b.width-.25)<.002);assert.ok(Math.abs(((p.y+p.height/2)-b.y)/b.height-.4)<.002)});
  await check('pin added while zoomed uses image-relative coordinates',async()=>{await page.getByRole('button',{name:'コメントピン',exact:true}).click();await clickAt(.6,.6);await page.getByLabel('新しいピンのコメント').fill('拡大しても位置を保持');await page.getByRole('button',{name:'ピンを追加',exact:true}).click();await page.getByRole('button',{name:'下書き保存',exact:true}).click();await page.getByRole('status').filter({hasText:'下書きを保存しました'}).waitFor();assert.ok(Math.abs(saved.document.pins[1].x-.6)<.002);assert.ok(Math.abs(saved.document.pins[1].y-.6)<.002)});
  await page.evaluate(()=>window.document.fonts.ready);await page.screenshot({path:path.join(tmp,'editor.png')});
  await check('reload restores saved annotations',async()=>{await page.reload();await page.getByTestId('annotation-overlay').waitFor();assert.equal(await page.locator('[data-pin-number]').count(),2);assert.equal(await page.locator('polyline').count(),1);assert.equal(await page.getByLabel('ピン 1 のコメント').inputValue(),'左の形状を修正してください')});
  await check('unsaved changes survive failed save conflict',async()=>{conflict=true;await page.getByLabel('ピン 1 のコメント').fill('競合しても手元に保持');await page.getByRole('button',{name:'下書き保存',exact:true}).click();await page.getByRole('alert').filter({hasText:'確認状態'}).waitFor();assert.equal(await page.getByLabel('ピン 1 のコメント').inputValue(),'競合しても手元に保持');conflict=false});
  await check('Escape can keep unsaved changes',async()=>{const dialog=page.waitForEvent('dialog').then(d=>d.dismiss());await page.keyboard.press('Escape');await dialog;assert.equal(await page.getByRole('dialog').count(),1)});
  await check('discard confirmation closes unsaved editor',async()=>{const dialog=page.waitForEvent('dialog').then(d=>d.accept());await page.getByRole('button',{name:'閉じる',exact:true}).click();await dialog;assert.equal(await page.getByRole('dialog').count(),0)});
  await check('original preview and filename download remain available',async()=>{const a=page.getByRole('link',{name:'ダウンロード',exact:true});assert.equal(await a.getAttribute('download'),'sample.png');assert.ok((await a.getAttribute('href')).includes('download=sample.png'));await page.getByRole('button',{name:'プレビュー',exact:true}).click();assert.equal(await page.getByAltText('sample.png').count(),1);await page.getByRole('button',{name:'プレビューを閉じる'}).click()});
  await check('admin/read-only mode displays pins without editing tools',async()=>{await page.goto(origin+'/?readonly');await page.getByTestId('annotation-overlay').waitFor();assert.equal(await page.locator('[data-pin-number]').count(),2);assert.equal(await page.getByRole('button',{name:'下書き保存',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'赤ペン',exact:true}).count(),0);await clickAt(.3,.3);assert.equal(await page.getByLabel('新しいピンのコメント').count(),0)});
  await page.screenshot({path:path.join(tmp,'readonly.png')});
  await check('narrow viewport fits image and exposes touch drawing surface',async()=>{await page.setViewportSize({width:390,height:844});await page.goto(origin);await page.getByTestId('annotation-overlay').waitFor();await page.getByRole('button',{name:'赤ペン',exact:true}).click();assert.equal(await page.getByTestId('annotation-overlay').evaluate(el=>getComputedStyle(el).touchAction),'none');assert.equal(await page.getByRole('button',{name:'閉じる',exact:true}).isVisible(),true);assert.ok((await bounds()).width <= 390)});
  await page.evaluate(()=>window.document.fonts.ready);await page.screenshot({path:path.join(tmp,'mobile.png')});
  assert.deepEqual(errors,[]);console.log(`${count} browser checks passed. Screenshots: ${tmp}`);
 } catch(e) { console.error('DOM:',await page.locator('body').innerText()); await page.screenshot({path:path.join(tmp,'failure.png')}); throw e; } finally {await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
