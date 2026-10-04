'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import type { Database } from '../../../../lib/supabase/database.types';

type Estimate = Database['public']['Tables']['estimates']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

function fmt(v:string|null){if(!v)return '―';return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}
function production(v:string|null){return v==='photo_trace'?'写真・画像トレース':v==='reference_drawing'?'写真・図面・資料から作図':v==='cad_conversion'?'XVL・3DCADから作成':v||'未設定'}
function usage(v:string|null){return v==='manual'?'取扱説明書・マニュアル':v==='sales'?'販促・営業資料':v==='education'?'教育・安全教材':v||'未設定'}
function expression(v:string|null){return v==='line'?'白黒線画':v==='color'?'カラーイラスト':v==='real'?'リアルイラスト':v||'未設定'}

async function sendQuoteRequestedNotification(
 supabase: ReturnType<typeof getSupabaseBrowserClient>,
 projectId: string
){
 try{
  const {data:{session}}=await supabase.auth.getSession();
  const token=session?.access_token;
  if(!token)return false;
  const response=await fetch('/api/cs-works/notify',{
   method:'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
   body:JSON.stringify({type:'quote_requested',projectId}),
  });
  if(!response.ok){
   console.error('Quote requested notification failed:',response.status,await response.text());
   return false;
  }
  return true;
 }catch(error){
  console.error('Quote requested notification error:',error);
  return false;
 }
}

export default function EstimateDetailPage(){
 const router=useRouter(); const params=useParams<{id:string}>(); const estimateId=params.id;
 const [user,setUser]=useState<User|null>(null); const [estimate,setEstimate]=useState<Estimate|null>(null); const [project,setProject]=useState<Project|null>(null);
 const [imageUrl,setImageUrl]=useState<string|null>(null); const [loading,setLoading]=useState(true); const [requesting,setRequesting]=useState(false); const [deleting,setDeleting]=useState(false); const [error,setError]=useState('');

 useEffect(()=>{(async()=>{
  const supabase=getSupabaseBrowserClient(); const {data:u}=await supabase.auth.getUser();
  if(!u.user){router.replace('/login');return} setUser(u.user);
  const {data:e,error:ee}=await supabase.from('estimates').select('*').eq('id',estimateId).eq('user_id',u.user.id).single();
  if(ee||!e){setError('見積りが見つかりません。');setLoading(false);return} setEstimate(e);
  const {data:p}=await supabase.from('projects').select('*').eq('user_id',u.user.id).eq('estimate_id',e.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  setProject(p??null);
  if(e.image_path){const {data:signed}=await supabase.storage.from('estimate-images').createSignedUrl(e.image_path,60*30);setImageUrl(signed?.signedUrl??null)}
  setLoading(false);
 })()},[router,estimateId]);

 async function requestQuote(){
  if(!user||!estimate||project)return;
  setRequesting(true);setError('');
  const supabase=getSupabaseBrowserClient();
  const code=`PRJ-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(100000+Math.random()*900000)}`;
  const title=[production(estimate.production_method),expression(estimate.expression)].filter(Boolean).join('・');
  const {data:p,error:pe}=await supabase.from('projects').insert({
    project_code:code,user_id:user.id,estimate_id:estimate.id,title,
    description:estimate.customer_notes??'',status:'quote_requested'
  }).select('*').single();
  if(pe||!p){setError('正式見積り依頼を送信できませんでした。');setRequesting(false);return}
  await supabase.from('estimates').update({status:'quote_requested'}).eq('id',estimate.id).eq('user_id',user.id);

  const mailSent=await sendQuoteRequestedNotification(supabase,p.id);

  setProject(p);setEstimate({...estimate,status:'quote_requested'});setRequesting(false);
  if(!mailSent){
   setError('正式見積り依頼は送信されましたが、管理者へのメール通知のみ失敗しました。');
  }
 }


 async function deleteEstimate(){
   if(!user||!estimate||project||deleting)return;

   const confirmed=window.confirm(
     `見積ID「${estimate.estimate_code}」を削除しますか？\n\nこの操作は元に戻せません。参考画像も削除されます。`
   );
   if(!confirmed)return;

   setDeleting(true);setError('');
   const supabase=getSupabaseBrowserClient();

   // 直前に案件化されていないか再確認
   const {data:linkedProject,error:checkError}=await supabase
     .from('projects')
     .select('id')
     .eq('user_id',user.id)
     .eq('estimate_id',estimate.id)
     .limit(1)
     .maybeSingle();

   if(checkError){
     console.error('Estimate delete check error:',checkError);
     setError('削除前の確認に失敗しました。');
     setDeleting(false);
     return;
   }
   if(linkedProject){
     setProject(linkedProject as Project);
     setError('この見積りはすでにプロジェクトに使用されているため削除できません。');
     setDeleting(false);
     return;
   }

   // DB側でも「案件未使用」を検証して削除
   const {data:deleted,error:deleteError}=await (supabase as any)
     .rpc('delete_unused_estimate',{p_estimate_id:estimate.id});

   if(deleteError||deleted!==true){
     console.error('Estimate delete error:',deleteError);
     setError('見積りを削除できませんでした。プロジェクトに使用されていないか確認してください。');
     setDeleting(false);
     return;
   }

   // DB削除成功後に参考画像を削除。失敗しても見積り削除自体は完了扱い。
   if(estimate.image_path){
     const {error:imageDeleteError}=await supabase.storage
       .from('estimate-images')
       .remove([estimate.image_path]);
     if(imageDeleteError)console.error('Estimate image delete error:',imageDeleteError);
   }

   router.replace('/mypage');
   router.refresh();
 }

 if(loading)return <main className="authPage"><section className="authCard"><p>見積りを読み込んでいます…</p></section></main>;
 return <main className="myPageShell">
  <header className="myPageHeader"><div><div className="authBrand">CS Works</div><h1>見積り詳細</h1></div><button className="logoutButton" onClick={()=>router.push('/mypage')}>My Pageへ戻る</button></header>
  {error&&!estimate?<div className="errorBox" style={{marginTop:24}}>{error}</div>:null}
  {estimate?<section className="detailPanel">
    <div className="detailHead"><div><div className="authBrand">ESTIMATE</div><h2>{estimate.estimate_code}</h2><p className="muted">作成日時：{fmt(estimate.created_at)}</p></div>{project?<span className="statusBadge">プロジェクト作成済み</span>:null}</div>
    <div className="summaryGrid">
      <div><span>制作方法</span><strong>{production(estimate.production_method)}</strong></div>
      <div><span>用途</span><strong>{usage(estimate.usage)}</strong></div>
      <div><span>表現</span><strong>{expression(estimate.expression)}</strong></div>
      <div><span>点数</span><strong>{estimate.quantity}点</strong></div>
      <div><span>想定制作時間</span><strong>{estimate.estimated_hours!=null?`${estimate.estimated_hours}時間`:'―'}</strong></div>
      <div><span>AI概算金額</span><strong>{estimate.estimated_amount!=null?`${estimate.estimated_amount.toLocaleString()}円`:'個別見積り'}</strong></div>
      <div><span>難易度</span><strong>{estimate.complexity_score!=null?`${estimate.complexity_score}`:'―'}</strong></div>
      <div><span>AI精度</span><strong>{estimate.confidence!=null?`${estimate.confidence}%`:'―'}</strong></div>
    </div>
    {imageUrl?<div className="block"><h3>参考画像</h3><img src={imageUrl} alt="見積り参考画像" className="referenceImage"/></div>:null}
    {estimate.ai_comment?<div className="block"><h3>AI判定コメント</h3><p>{estimate.ai_comment}</p></div>:null}
    {estimate.customer_notes?<div className="block"><h3>お客様コメント</h3><p>{estimate.customer_notes}</p></div>:null}
    {error?<div className="errorBox">{error}</div>:null}
    <div className="actions">
      {project?<button className="primaryButton" onClick={()=>router.push(`/mypage/projects/${project.id}`)}>プロジェクトを確認する</button>
      :<button className="primaryButton" disabled={requesting} onClick={requestQuote}>{requesting?'送信中…':'正式見積りを依頼する'}</button>}
      <button className="secondaryButton" onClick={()=>router.push('/mypage')}>見積り一覧へ戻る</button>
      {!project?<button className="deleteButton" disabled={deleting||requesting} onClick={deleteEstimate}>{deleting?'削除中…':'この見積りを削除'}</button>:null}
    </div>
  </section>:null}
  <style jsx>{`
   .detailPanel{box-sizing:border-box;width:100%;margin:28px 0 0;padding:30px 32px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.05)}
   .detailHead{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.statusBadge{padding:7px 11px;border-radius:999px;background:#eefbf3;color:#16733b;font-size:12px;font-weight:800}
   .summaryGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:24px}.summaryGrid div{padding:15px;border:1px solid #e5eaf0;border-radius:12px;background:#f8fafc}.summaryGrid span{display:block;color:#64748b;font-size:12px;margin-bottom:5px}.summaryGrid strong{font-size:15px}
   .block{margin-top:24px;padding-top:22px;border-top:1px solid #e5eaf0}.block h3{margin:0 0 10px}.block p{white-space:pre-wrap;line-height:1.7}.referenceImage{display:block;max-width:100%;max-height:520px;object-fit:contain;border:1px solid #e5eaf0;border-radius:12px}
   .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:28px}.actions button{width:auto!important}.secondaryButton{padding:12px 18px;border:1px solid #dbe3ec;border-radius:10px;background:#fff;font-weight:800;cursor:pointer}.deleteButton{margin-left:auto;padding:12px 18px;border:1px solid #fecaca;border-radius:10px;background:#fff;color:#b91c1c;font-weight:800;cursor:pointer}.deleteButton:hover{background:#fef2f2}.deleteButton:disabled{opacity:.55;cursor:default}
   @media(max-width:900px){.summaryGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
   @media(max-width:600px){.detailPanel{padding:20px 15px;border-radius:14px}.summaryGrid{grid-template-columns:1fr}.detailHead{display:block}.statusBadge{display:inline-block;margin-top:8px}}
  `}</style>
 </main>
}
