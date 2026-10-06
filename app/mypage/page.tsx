'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type Estimate = Database['public']['Tables']['estimates']['Row'] & { archived_at?: string | null };
type ProjectBase = Database['public']['Tables']['projects']['Row'];
type Project = Omit<ProjectBase, 'status'> & {
  status: ProjectBase['status'] | 'approved' | 'invoice_requested' | 'invoiced';
  unread_messages?: number;
  archived_at?: string | null;
  invoice?: { payment_due_date: string | null; total_amount: number } | null;
};
type Profile = {
  company_name: string; department_name: string; contact_name: string;
  phone: string; postal_code: string; address: string; newsletter_enabled: boolean;
};
const emptyProfile: Profile = { company_name:'', department_name:'', contact_name:'', phone:'', postal_code:'', address:'', newsletter_enabled:true };

function fmt(v:string|null){ if(!v)return '―'; return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)); }
function production(v:string|null){ return v==='photo_trace'?'写真・画像トレース':v==='reference_drawing'?'写真・図面・資料から作図':v==='cad_conversion'?'XVL・3DCADから作成':v||'未設定'; }
function expression(v:string|null){ return v==='line'?'白黒線画':v==='color'?'カラーイラスト':v==='real'?'リアルイラスト':v||'未設定'; }
function statusLabel(s:Project['status']){ return ({quote_requested:'正式見積り依頼済み',quote_reviewing:'見積り確認中',quote_presented:'正式見積り提示済み',ordered:'発注済み',in_production:'制作中',customer_review:'ご確認ください',revision:'修正対応中',approved:'承認済み・納品待ち',delivered:'納品済み・請求書発行待ち',invoice_requested:'請求書発行依頼済み',invoiced:'請求済み・お支払い待ち',completed:'完了',cancelled:'キャンセル'} as Record<string,string>)[s]||s; }
const active = new Set<Project['status']>(['quote_requested','quote_reviewing','quote_presented','ordered','in_production','customer_review','revision','approved','delivered','invoice_requested','invoiced']);

function estimateProgress(project:Project|undefined){if(!project)return {label:'AI概算のみ',tone:'estimateOnly'};return {label:statusLabel(project.status),tone:'projectLinked'};}

export default function MyPage(){
 const router=useRouter();
 const [user,setUser]=useState<User|null>(null); const [profile,setProfile]=useState<Profile>(emptyProfile);
 const [estimates,setEstimates]=useState<Estimate[]>([]); const [projects,setProjects]=useState<Project[]>([]);
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
 const [projectFilter,setProjectFilter]=useState<'active'|'all'|'completed'|'archived'>('active'); const [projectSearch,setProjectSearch]=useState('');
 const [estimateSearch,setEstimateSearch]=useState(''); const [estimateFilter,setEstimateFilter]=useState<'current'|'archived'>('current'); const [estimatePage,setEstimatePage]=useState(1);
 const ESTIMATES_PER_PAGE=10;

 useEffect(()=>{(async()=>{
   const supabase=getSupabaseBrowserClient(); const {data:u}=await supabase.auth.getUser();
   if(!u.user){router.replace('/login');return} setUser(u.user);
   const [{data:p},{data:e},{data:pr}]=await Promise.all([
     supabase.from('profiles').select('company_name, department_name, contact_name, phone, postal_code, address, newsletter_enabled').eq('id',u.user.id).single(),
     supabase.from('estimates').select('*').eq('user_id',u.user.id).order('created_at',{ascending:false}),
     supabase.from('projects').select('*').eq('user_id',u.user.id).order('updated_at',{ascending:false}),
   ]);
   if(p)setProfile({company_name:p.company_name??'',department_name:p.department_name??'',contact_name:p.contact_name??'',phone:p.phone??'',postal_code:p.postal_code??'',address:p.address??'',newsletter_enabled:p.newsletter_enabled!==false});
   
    const projectRows=(pr??[]) as ProjectBase[];
    const projectIds=projectRows.map(project=>project.id);
    const unreadByProject:Record<string,number>={};
    if(projectIds.length){
      const {data:messageData,error:messageError}=await (supabase.from('project_messages' as any) as any)
        .select('project_id, sender_type, message_type, read_by_customer_at')
        .in('project_id',projectIds)
        .eq('message_type','message')
        .eq('sender_type','admin')
        .is('read_by_customer_at',null);
      if(messageError) console.error('Customer unread message load error:',messageError);
      else for(const item of (messageData??[])) unreadByProject[item.project_id]=(unreadByProject[item.project_id]??0)+1;
    }
    const invoiceByProject:Record<string,{payment_due_date:string|null;total_amount:number}>={};
    if(projectIds.length){
      const {data:invoiceData,error:invoiceError}=await (supabase.from('project_invoices' as any) as any)
        .select('project_id, payment_due_date, total_amount')
        .in('project_id',projectIds);
      if(invoiceError) console.error('Customer invoice load error:',invoiceError);
      else for(const invoice of (invoiceData??[])){
        invoiceByProject[invoice.project_id]={
          payment_due_date:invoice.payment_due_date??null,
          total_amount:invoice.total_amount??0
        };
      }
    }
    setEstimates(e??[]);
    setProjects(projectRows.map(project=>({
      ...project,
      unread_messages:unreadByProject[project.id]??0,
      invoice:invoiceByProject[project.id]??null
    })));
    setLoading(false);
 })()},[router]);

 const visibleProjects=useMemo(()=>{const q=projectSearch.trim().toLowerCase();return projects.filter(p=>{const archived=Boolean(p.archived_at);const matches=projectFilter==='archived'?archived:!archived&&(projectFilter==='all'||(projectFilter==='active'?active.has(p.status):p.status==='completed'));return matches&&(!q||[p.project_code,p.title].some(v=>(v??'').toLowerCase().includes(q)))})},[projects,projectFilter,projectSearch]);
 const visibleEstimates=useMemo(()=>{const q=estimateSearch.trim().toLowerCase();return estimates.filter(e=>{const archived=Boolean(e.archived_at);const matches=estimateFilter==='archived'?archived:!archived;return matches&&(!q||[e.estimate_code,production(e.production_method),expression(e.expression)].some(v=>v.toLowerCase().includes(q)))})},[estimates,estimateFilter,estimateSearch]);
 const estimatePageCount=Math.max(1,Math.ceil(visibleEstimates.length/ESTIMATES_PER_PAGE));
 const pagedEstimates=useMemo(()=>visibleEstimates.slice((estimatePage-1)*ESTIMATES_PER_PAGE,estimatePage*ESTIMATES_PER_PAGE),[visibleEstimates,estimatePage]);
 useEffect(()=>{setEstimatePage(1)},[estimateSearch,estimateFilter]);
 useEffect(()=>{if(estimatePage>estimatePageCount)setEstimatePage(estimatePageCount)},[estimatePage,estimatePageCount]);
 const projectByEstimate=useMemo(()=>{const map=new Map<string,Project>();for(const p of projects){if(p.estimate_id)map.set(p.estimate_id,p)}return map},[projects]);
 const actionItems=useMemo(()=>{const items:{key:string;projectId:string;projectCode:string;title:string;detail:string;kind:string}[]=[];for(const p of projects){if(p.archived_at)continue;if((p.unread_messages??0)>0)items.push({key:`msg-${p.id}`,projectId:p.id,projectCode:p.project_code,title:'新しいメッセージがあります',detail:`未読 ${p.unread_messages}件`,kind:'message'});if(p.status==='quote_presented')items.push({key:`quote-${p.id}`,projectId:p.id,projectCode:p.project_code,title:'正式見積りをご確認ください',detail:p.quoted_amount!=null?`${p.quoted_amount.toLocaleString()}円`:'正式見積りが届いています',kind:'quote'});if(p.status==='customer_review')items.push({key:`review-${p.id}`,projectId:p.id,projectCode:p.project_code,title:'制作内容の確認をお願いします',detail:p.title??'',kind:'review'});if(p.status==='delivered')items.push({key:`delivery-${p.id}`,projectId:p.id,projectCode:p.project_code,title:'納品内容をご確認ください',detail:p.title??'',kind:'delivery'});}return items},[projects]);
 const actionCount=projects.filter(p=>!p.archived_at&&(p.status==='quote_presented'||p.status==='customer_review'||p.status==='delivered')).length;

 function updateProfile(k:keyof Profile,v:string){setProfile(c=>({...c,[k]:v}))}
 async function saveProfile(ev:FormEvent){ev.preventDefault();if(!user)return;setSaving(true);setMessage('');setError('');const {error:er}=await getSupabaseBrowserClient().from('profiles').update(profile).eq('id',user.id);setSaving(false);if(er){setError('お客様情報を保存できませんでした。');return}setMessage('お客様情報を保存しました。')}
 async function logout(){await getSupabaseBrowserClient().auth.signOut();router.replace('/');router.refresh();}

 if(loading)return <main className="authPage"><section className="authCard"><p>My Pageを読み込んでいます…</p></section></main>;

 return <main className="myPageShell">
   <header className="myPageHeader"><div><div className="authBrand">CS Works</div><h1>My Page</h1></div><button className="logoutButton" onClick={logout}>ログアウト</button></header>
   <section className="welcomeCard"><span className="statusDot"/> ログイン中<h2>{profile.contact_name?`${profile.contact_name} 様`:'CS Worksへようこそ'}</h2><p>{user?.email}</p></section>
   {actionItems.length>0?<section className="actionCenter"><div className="actionCenterHead"><div><div className="authBrand">ACTION</div><h2>お知らせ・要対応</h2><p>現在ご確認いただきたい内容をまとめています。</p></div><span className="actionCountBadge">{actionItems.length}件</span></div><div className="actionItems">{actionItems.map(item=><button type="button" key={item.key} className="actionItem" onClick={()=>router.push(`/mypage/projects/${item.projectId}`)}><span className={`actionIcon ${item.kind}`}>{item.kind==='message'?'💬':item.kind==='quote'?'見積':item.kind==='review'?'確認':'納品'}</span><span className="actionText"><strong>{item.title}</strong><span>{item.projectCode}　{item.detail}</span></span><strong className="actionArrow">確認する →</strong></button>)}</div></section>:null}

   <div className="myPageGrid">
     <section className="dashboardCard"><div className="dashboardIcon">AI</div><h3>AI概算見積り</h3><p>新しい制作内容をAIで概算見積りできます。</p><Link className="dashboardLink" href="/">新しい見積りを作成 →</Link></section>
     <section className="dashboardCard"><div className="dashboardIcon">見積</div><h3>見積り履歴</h3><p>保存済みのAI概算見積りを確認できます。</p><a className="dashboardLink" href="#estimate-history">{estimates.filter(e=>!e.archived_at).length}件の見積りを見る →</a></section>
     <section className="dashboardCard"><div className="dashboardIcon">案件</div><h3>プロジェクト</h3><p>正式見積り・制作・確認・納品の状況を確認できます。</p><a className="dashboardLink" href="#project-list">{projects.filter(p=>!p.archived_at).length}件のプロジェクトを見る →{projects.filter(p=>!p.archived_at).reduce((sum,p)=>sum+(p.unread_messages??0),0)>0?`（💬 未読 ${projects.filter(p=>!p.archived_at).reduce((sum,p)=>sum+(p.unread_messages??0),0)}件）`:actionCount?`（確認事項 ${actionCount}件）`:''}</a></section>
   <section className="dashboardCard supportCard"><div className="dashboardIcon">相談</div><h3>運営に相談・問い合わせ</h3><p>制作のご相談や、見積り前のご質問はこちらから。</p><Link className="dashboardLink" href="/mypage/support">相談・問い合わせをする →</Link></section>
    <section className="dashboardCard"><div className="dashboardIcon">MTG</div><h3>オンライン相談予約</h3><p>空いている日時を選んで、Google Meetで打ち合わせを予約できます。</p><Link className="dashboardLink" href="/mypage/consultations">相談日時を予約する →</Link></section>
    </div>

   <section id="project-list" className="widePanel">
     <div className="sectionHead"><div><div className="authBrand">PROJECTS</div><h2>プロジェクト</h2><p className="muted">進行中の案件を中心に表示します。案件を選ぶと詳細・発注・確認・納品へ進めます。</p></div><input value={projectSearch} onChange={e=>setProjectSearch(e.target.value)} placeholder="案件番号・案件名で検索"/></div>
     <div className="filters">
       <button className={projectFilter==='active'?'active':''} onClick={()=>setProjectFilter('active')}>進行中 {projects.filter(p=>!p.archived_at&&active.has(p.status)).length}</button>
       <button className={projectFilter==='all'?'active':''} onClick={()=>setProjectFilter('all')}>すべて {projects.filter(p=>!p.archived_at).length}</button>
       <button className={projectFilter==='completed'?'active':''} onClick={()=>setProjectFilter('completed')}>完了 {projects.filter(p=>!p.archived_at&&p.status==='completed').length}</button>
       <button className={projectFilter==='archived'?'active':''} onClick={()=>setProjectFilter('archived')}>アーカイブ {projects.filter(p=>Boolean(p.archived_at)).length}</button>
     </div>
     <div className="projectTableWrap"><table><thead><tr><th>案件番号</th><th>案件名</th><th>ステータス</th><th>メッセージ</th><th>正式見積</th><th>納期</th><th>更新日</th><th></th></tr></thead><tbody>
       {visibleProjects.map(p=><tr key={p.id} onClick={()=>router.push(`/mypage/projects/${p.id}`)}><td><strong>{p.project_code}</strong></td><td>{p.title}</td><td><span className={`badge ${p.status==='quote_presented'||p.status==='customer_review'?'attention':p.status==='invoiced'?'paymentWaiting':''}`}>{statusLabel(p.status)}</span>{p.status==='invoiced'&&p.invoice?.payment_due_date?<div className={`paymentDue ${new Date(`${p.invoice.payment_due_date}T23:59:59`).getTime()<Date.now()?'overdue':''}`}>支払期限 {fmt(p.invoice.payment_due_date)}{new Date(`${p.invoice.payment_due_date}T23:59:59`).getTime()<Date.now()?'・期限超過':''}</div>:null}</td><td>{(p.unread_messages??0)>0?<span className="messageBadge">💬 {p.unread_messages}</span>:<span className="noMessage">―</span>}</td><td>{p.quoted_amount!=null?`${p.quoted_amount.toLocaleString()}円`:'―'}</td><td>{fmt(p.confirmed_deadline)}</td><td>{fmt(p.updated_at)}</td><td><strong>詳細 →</strong></td></tr>)}
     </tbody></table></div>
     <div className="projectCards">{visibleProjects.map(p=><button key={p.id} onClick={()=>router.push(`/mypage/projects/${p.id}`)}><div className="cardTop"><strong>{p.project_code}</strong><div className="cardBadges"><span className={`badge ${p.status==='quote_presented'||p.status==='customer_review'?'attention':p.status==='invoiced'?'paymentWaiting':''}`}>{statusLabel(p.status)}</span>{(p.unread_messages??0)>0?<span className="messageBadge">💬 {p.unread_messages}</span>:null}</div></div><h3>{p.title}</h3>{p.status==='invoiced'&&p.invoice?.payment_due_date?<div className={`paymentDue cardPaymentDue ${new Date(`${p.invoice.payment_due_date}T23:59:59`).getTime()<Date.now()?'overdue':''}`}>支払期限 {fmt(p.invoice.payment_due_date)}{new Date(`${p.invoice.payment_due_date}T23:59:59`).getTime()<Date.now()?'・期限超過':''}</div>:null}<div className="cardMeta"><span>{p.quoted_amount!=null?`${p.quoted_amount.toLocaleString()}円`:'見積確認中'}</span><span>納期 {fmt(p.confirmed_deadline)}</span><strong>詳細 →</strong></div></button>)}</div>
     {!visibleProjects.length?<div className="empty">該当するプロジェクトはありません。</div>:null}
   </section>

   <section id="estimate-history" className="widePanel">
     <div className="sectionHead"><div><div className="authBrand">ESTIMATES</div><h2>見積り履歴</h2><p className="muted">保存したAI概算見積りと、その後の進行状況を確認できます。案件化済みの見積りはプロジェクトへ直接移動できます。</p></div><input value={estimateSearch} onChange={e=>{setEstimateSearch(e.target.value);setEstimatePage(1)}} placeholder="見積ID・制作方法で検索"/></div>
     <div className="filters">
       <button className={estimateFilter==='current'?'active':''} onClick={()=>{setEstimateFilter('current');setEstimatePage(1)}}>通常 {estimates.filter(e=>!e.archived_at).length}</button>
       <button className={estimateFilter==='archived'?'active':''} onClick={()=>{setEstimateFilter('archived');setEstimatePage(1)}}>アーカイブ {estimates.filter(e=>Boolean(e.archived_at)).length}</button>
     </div>
     <div className="estimateList">{pagedEstimates.map(e=>{const linkedProject=projectByEstimate.get(e.id);const progress=estimateProgress(linkedProject);return <div className="estimateRow" key={e.id}><button type="button" className="estimateMain" onClick={()=>router.push(`/mypage/estimates/${e.id}`)}><div className="estimateIdentity"><strong>{e.estimate_code}</strong><span>{production(e.production_method)} ／ {expression(e.expression)}</span></div><div className="estimateMeta"><span>{e.estimated_hours!=null?`${e.estimated_hours}時間`:'―'}</span><strong>{e.estimated_amount!=null?`${e.estimated_amount.toLocaleString()}円`:'個別見積り'}</strong><span>{fmt(e.created_at)}</span></div></button><div className="estimateProgressArea"><span className={`estimateStatus ${progress.tone}`}>{progress.label}</span>{linkedProject?<button type="button" className="estimateProjectLink" onClick={()=>router.push(`/mypage/projects/${linkedProject.id}`)}>案件を見る →</button>:<button type="button" className="estimateDetailLink" onClick={()=>router.push(`/mypage/estimates/${e.id}`)}>見積り詳細 →</button>}</div></div>})}</div>
     {!visibleEstimates.length?<div className="empty">該当する見積りはありません。</div>:null}
     {visibleEstimates.length>ESTIMATES_PER_PAGE?<div className="estimatePager"><button type="button" disabled={estimatePage<=1} onClick={()=>setEstimatePage(p=>Math.max(1,p-1))}>← 前へ</button><span>{estimatePage} / {estimatePageCount}</span><button type="button" disabled={estimatePage>=estimatePageCount} onClick={()=>setEstimatePage(p=>Math.min(estimatePageCount,p+1))}>次へ →</button></div>:null}
   </section>

   <section className="widePanel"><div className="authBrand">ACCOUNT</div><h2>お客様情報</h2><p className="muted">正式見積りや制作依頼に使用する情報です。</p>
     <form onSubmit={saveProfile} className="authForm accountForm">
       <div><label>会社名</label><input value={profile.company_name} onChange={e=>updateProfile('company_name',e.target.value)}/></div>
       <div><label>部署名</label><input value={profile.department_name} onChange={e=>updateProfile('department_name',e.target.value)}/></div>
       <div><label>担当者名</label><input value={profile.contact_name} onChange={e=>updateProfile('contact_name',e.target.value)}/></div>
       <div><label>メールアドレス</label><input value={user?.email??''} disabled/></div>
       <div><label>電話番号</label><input value={profile.phone} onChange={e=>updateProfile('phone',e.target.value)}/></div>
       <div><label>郵便番号</label><input value={profile.postal_code} onChange={e=>updateProfile('postal_code',e.target.value)}/></div>
       <div className="full"><label>住所</label><input value={profile.address} onChange={e=>updateProfile('address',e.target.value)}/></div>
       <div className="full newsletterSetting"><div><strong>メール通知設定</strong><span>CS Worksからニュース・新機能・メンテナンス情報などのお知らせを受け取ります。</span></div><label className="newsletterToggle"><input type="checkbox" checked={profile.newsletter_enabled} onChange={e=>setProfile(c=>({...c,newsletter_enabled:e.target.checked}))}/><span>{profile.newsletter_enabled?'受け取る':'受け取らない'}</span></label></div>
       {error?<div className="errorBox full">{error}</div>:null}{message?<div className="success full">{message}</div>:null}
       <button className="primaryButton" disabled={saving}>{saving?'保存中…':'お客様情報を保存'}</button>
     </form>
   </section>

   <style jsx>{`
      :global(.myPageGrid){display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:18px!important}
      :global(.dashboardCard){box-sizing:border-box;min-width:0;height:100%;display:flex!important;flex-direction:column}
      :global(.dashboardCard p){flex:1}
      @media(max-width:1100px){:global(.myPageGrid){grid-template-columns:repeat(2,minmax(0,1fr))!important}}
      @media(max-width:650px){:global(.myPageGrid){grid-template-columns:1fr!important}}

     .actionCenter{box-sizing:border-box;width:100%;margin:22px 0 24px;padding:24px 28px;border:1px solid #bfdbfe;border-radius:18px;background:#f8fbff;box-shadow:0 10px 28px rgba(37,99,235,.06)}.actionCenterHead{display:flex;align-items:center;justify-content:space-between;gap:20px}.actionCenterHead h2{margin:3px 0 4px;font-size:20px}.actionCenterHead p{margin:0;color:#64748b;font-size:13px}.actionCountBadge{padding:7px 11px;border-radius:999px;background:#2563eb;color:#fff;font-size:13px;font-weight:900}.actionItems{margin-top:16px;border-top:1px solid #dbeafe}.actionItem{width:100%!important;display:flex!important;align-items:center;gap:14px;padding:14px 4px!important;border:0!important;border-bottom:1px solid #dbeafe!important;background:transparent!important;color:#0f172a!important;text-align:left!important;cursor:pointer}.actionItem:hover{background:#eff6ff!important}.actionIcon{display:inline-flex;align-items:center;justify-content:center;flex:0 0 42px;height:34px;border-radius:9px;background:#fff;border:1px solid #dbeafe;font-size:11px;font-weight:900}.actionIcon.message{font-size:17px}.actionText{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.actionText strong{font-size:14px}.actionText span{color:#64748b;font-size:12px}.actionArrow{white-space:nowrap;color:#1d4ed8;font-size:12px}
     .widePanel{box-sizing:border-box;width:100%;margin:28px 0 0;padding:30px 32px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.05)}
     .sectionHead{display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap}.sectionHead input{width:min(360px,100%)}
     .filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.filters button{width:auto!important;display:inline-flex!important;border:1px solid #dbe3ec;border-radius:999px;padding:8px 14px;background:#fff;font-weight:800;cursor:pointer}.filters button.active{background:#0f172a;color:#fff;border-color:#0f172a}
     .projectTableWrap{overflow-x:auto;margin-top:20px}.projectTableWrap table{width:100%;border-collapse:collapse;min-width:900px}.projectTableWrap th,.projectTableWrap td{padding:14px 10px;border-bottom:1px solid #e5eaf0;text-align:left}.projectTableWrap th{background:#f8fafc;font-size:13px}.projectTableWrap tr{cursor:pointer}
     .badge{display:inline-block;padding:5px 9px;border-radius:999px;background:#eefbf3;color:#16733b;font-size:12px;font-weight:800;white-space:nowrap}.badge.attention{background:#fff7ed;color:#c2410c}.badge.paymentWaiting{background:#fff7ed;color:#9a3412;border:1px solid #fdba74}.paymentDue{margin-top:5px;color:#9a3412;font-size:11px;font-weight:800;white-space:nowrap}.paymentDue.overdue{color:#b91c1c}.cardPaymentDue{margin:0 0 10px}.messageBadge{display:inline-flex;align-items:center;gap:3px;padding:5px 9px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:900;white-space:nowrap}.noMessage{color:#94a3b8}.cardBadges{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
     .projectCards{display:none}.empty{padding:24px;text-align:center;color:#64748b}
     .estimateList{margin-top:20px}.estimateRow{display:flex;justify-content:space-between;gap:18px;padding:16px 4px;border-bottom:1px solid #e5eaf0;color:#0f172a}.estimateRow:hover{background:#f8fafc}.estimateMain{flex:1;min-width:0;display:flex!important;justify-content:space-between;gap:18px;align-items:center;padding:0!important;border:0!important;background:transparent!important;color:#0f172a!important;text-align:left!important;cursor:pointer}.estimateIdentity,.estimateMeta{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.estimateIdentity span,.estimateMeta span{color:#64748b;font-size:13px}.estimateProgressArea{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.estimateStatus{display:inline-flex;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:900;white-space:nowrap}.estimateStatus.estimateOnly{background:#f1f5f9;color:#475569}.estimateStatus.projectLinked{background:#eefbf3;color:#16733b}.estimateProjectLink,.estimateDetailLink{width:auto!important;padding:7px 10px!important;border-radius:9px!important;font-size:12px!important;font-weight:900!important;cursor:pointer}.estimateProjectLink{border:1px solid #bfdbfe!important;background:#eff6ff!important;color:#1d4ed8!important}.estimateDetailLink{border:1px solid #dbe3ec!important;background:#fff!important;color:#334155!important}
     .estimatePager{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:20px;padding-top:18px;border-top:1px solid #e5eaf0}.estimatePager button{width:auto!important;padding:8px 13px!important;border:1px solid #dbe3ec!important;border-radius:9px!important;background:#fff!important;color:#334155!important;font-size:12px!important;font-weight:900!important;cursor:pointer}.estimatePager button:hover:not(:disabled){background:#f8fafc!important;border-color:#94a3b8!important}.estimatePager button:disabled{opacity:.38;cursor:not-allowed}.estimatePager span{min-width:64px;text-align:center;color:#475569;font-size:13px;font-weight:900}
     .newsletterSetting{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:4px;padding:16px 18px;border:1px solid #dbeafe;border-radius:14px;background:#f8fbff}.newsletterSetting strong,.newsletterSetting span{display:block}.newsletterSetting strong{color:#0f172a;font-size:14px}.newsletterSetting>div>span{margin-top:4px;color:#64748b;font-size:12px;line-height:1.6}.newsletterToggle{display:flex!important;align-items:center;gap:8px;flex:0 0 auto;margin:0!important;font-weight:800;color:#1d4ed8;cursor:pointer}.newsletterToggle input{width:18px!important;height:18px!important;margin:0!important;accent-color:#2563eb}
      .accountForm{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.accountForm .full{grid-column:1/-1}.success{padding:12px 14px;border-radius:10px;background:#eefbf3;color:#16733b;font-weight:700}
     @media(max-width:900px){.projectTableWrap{display:none}.projectCards{display:block;margin-top:18px}.projectCards button{display:block;width:100%;text-align:left;padding:15px;margin-bottom:10px;border:1px solid #dbe3ec;border-radius:12px;background:#fff;color:#0f172a}.cardTop{display:flex;justify-content:space-between;gap:8px}.projectCards h3{font-size:15px;margin:10px 0}.cardMeta{display:flex;gap:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid #eef2f7;color:#64748b;font-size:12px}.cardMeta strong{margin-left:auto;color:#0f172a}.estimateRow{display:block}.estimateMain{display:block!important}.estimateMeta{margin-top:8px}.estimateProgressArea{margin-top:12px;justify-content:flex-start}.accountForm{grid-template-columns:1fr}.accountForm .full{grid-column:auto}}
     @media(max-width:600px){.actionCenter{padding:20px 15px}.actionArrow{display:none}.widePanel{padding:20px 15px;border-radius:14px}.sectionHead input{width:100%}}
   `}</style>
 </main>
}
