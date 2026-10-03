'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type Estimate = Database['public']['Tables']['estimates']['Row'] & { archived_at?: string | null };
type ProjectBase = Database['public']['Tables']['projects']['Row'];
type Project = ProjectBase & { unread_messages?: number; archived_at?: string | null };
type Profile = {
  company_name: string; department_name: string; contact_name: string;
  phone: string; postal_code: string; address: string;
};
const emptyProfile: Profile = { company_name:'', department_name:'', contact_name:'', phone:'', postal_code:'', address:'' };

function fmt(v:string|null){ if(!v)return '―'; return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)); }
function production(v:string|null){ return v==='photo_trace'?'写真・画像トレース':v==='reference_drawing'?'写真・図面・資料から作図':v==='cad_conversion'?'XVL・3DCADから作成':v||'未設定'; }
function expression(v:string|null){ return v==='line'?'白黒線画':v==='color'?'カラーイラスト':v==='real'?'リアルイラスト':v||'未設定'; }
function statusLabel(s:Project['status']){ return ({quote_requested:'正式見積り依頼済み',quote_reviewing:'見積り確認中',quote_presented:'正式見積り提示済み',ordered:'発注済み',in_production:'制作中',customer_review:'ご確認ください',revision:'修正対応中',delivered:'納品済み',completed:'完了',cancelled:'キャンセル'} as Record<string,string>)[s]||s; }
const active = new Set<Project['status']>(['quote_requested','quote_reviewing','quote_presented','ordered','in_production','customer_review','revision','delivered']);

export default function MyPage(){
 const router=useRouter();
 const [user,setUser]=useState<User|null>(null); const [profile,setProfile]=useState<Profile>(emptyProfile);
 const [estimates,setEstimates]=useState<Estimate[]>([]); const [projects,setProjects]=useState<Project[]>([]);
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');
 const [projectFilter,setProjectFilter]=useState<'active'|'all'|'completed'|'archived'>('active'); const [projectSearch,setProjectSearch]=useState('');
 const [estimateSearch,setEstimateSearch]=useState(''); const [estimateFilter,setEstimateFilter]=useState<'current'|'archived'>('current');

 useEffect(()=>{(async()=>{
   const supabase=getSupabaseBrowserClient(); const {data:u}=await supabase.auth.getUser();
   if(!u.user){router.replace('/login');return} setUser(u.user);
   const [{data:p},{data:e},{data:pr}]=await Promise.all([
     supabase.from('profiles').select('company_name, department_name, contact_name, phone, postal_code, address').eq('id',u.user.id).single(),
     supabase.from('estimates').select('*').eq('user_id',u.user.id).order('created_at',{ascending:false}),
     supabase.from('projects').select('*').eq('user_id',u.user.id).order('updated_at',{ascending:false}),
   ]);
   if(p)setProfile({company_name:p.company_name??'',department_name:p.department_name??'',contact_name:p.contact_name??'',phone:p.phone??'',postal_code:p.postal_code??'',address:p.address??''});
   
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
    setEstimates(e??[]);
    setProjects(projectRows.map(project=>({...project,unread_messages:unreadByProject[project.id]??0})));
    setLoading(false);
 })()},[router]);

 const visibleProjects=useMemo(()=>{const q=projectSearch.trim().toLowerCase();return projects.filter(p=>{const archived=Boolean(p.archived_at);const matches=projectFilter==='archived'?archived:!archived&&(projectFilter==='all'||(projectFilter==='active'?active.has(p.status):p.status==='completed'));return matches&&(!q||[p.project_code,p.title].some(v=>(v??'').toLowerCase().includes(q)))})},[projects,projectFilter,projectSearch]);
 const visibleEstimates=useMemo(()=>{const q=estimateSearch.trim().toLowerCase();return estimates.filter(e=>{const archived=Boolean(e.archived_at);const matches=estimateFilter==='archived'?archived:!archived;return matches&&(!q||[e.estimate_code,production(e.production_method),expression(e.expression)].some(v=>v.toLowerCase().includes(q)))})},[estimates,estimateFilter,estimateSearch]);
 const actionCount=projects.filter(p=>!p.archived_at&&(p.status==='quote_presented'||p.status==='customer_review'||p.status==='delivered')).length;

 function updateProfile(k:keyof Profile,v:string){setProfile(c=>({...c,[k]:v}))}
 async function saveProfile(ev:FormEvent){ev.preventDefault();if(!user)return;setSaving(true);setMessage('');setError('');const {error:er}=await getSupabaseBrowserClient().from('profiles').update(profile).eq('id',user.id);setSaving(false);if(er){setError('お客様情報を保存できませんでした。');return}setMessage('お客様情報を保存しました。')}
 async function logout(){await getSupabaseBrowserClient().auth.signOut();router.replace('/');router.refresh();}

 if(loading)return <main className="authPage"><section className="authCard"><p>My Pageを読み込んでいます…</p></section></main>;

 return <main className="myPageShell">
   <header className="myPageHeader"><div><div className="authBrand">CS Works</div><h1>My Page</h1></div><button className="logoutButton" onClick={logout}>ログアウト</button></header>
   <section className="welcomeCard"><span className="statusDot"/> ログイン中<h2>{profile.contact_name?`${profile.contact_name} 様`:'CS Worksへようこそ'}</h2><p>{user?.email}</p></section>

   <div className="myPageGrid">
     <section className="dashboardCard"><div className="dashboardIcon">AI</div><h3>AI概算見積り</h3><p>新しい制作内容をAIで概算見積りできます。</p><Link className="dashboardLink" href="/">新しい見積りを作成 →</Link></section>
     <section className="dashboardCard"><div className="dashboardIcon">見積</div><h3>見積り履歴</h3><p>保存済みのAI概算見積りを確認できます。</p><a className="dashboardLink" href="#estimate-history">{estimates.filter(e=>!e.archived_at).length}件の見積りを見る →</a></section>
     <section className="dashboardCard"><div className="dashboardIcon">案件</div><h3>プロジェクト</h3><p>正式見積り・制作・確認・納品の状況を確認できます。</p><a className="dashboardLink" href="#project-list">{projects.filter(p=>!p.archived_at).length}件のプロジェクトを見る →{projects.filter(p=>!p.archived_at).reduce((sum,p)=>sum+(p.unread_messages??0),0)>0?`（💬 未読 ${projects.filter(p=>!p.archived_at).reduce((sum,p)=>sum+(p.unread_messages??0),0)}件）`:actionCount?`（確認事項 ${actionCount}件）`:''}</a></section>
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
       {visibleProjects.map(p=><tr key={p.id} onClick={()=>router.push(`/mypage/projects/${p.id}`)}><td><strong>{p.project_code}</strong></td><td>{p.title}</td><td><span className={`badge ${p.status==='quote_presented'||p.status==='customer_review'?'attention':''}`}>{statusLabel(p.status)}</span></td><td>{(p.unread_messages??0)>0?<span className="messageBadge">💬 {p.unread_messages}</span>:<span className="noMessage">―</span>}</td><td>{p.quoted_amount!=null?`${p.quoted_amount.toLocaleString()}円`:'―'}</td><td>{fmt(p.confirmed_deadline)}</td><td>{fmt(p.updated_at)}</td><td><strong>詳細 →</strong></td></tr>)}
     </tbody></table></div>
     <div className="projectCards">{visibleProjects.map(p=><button key={p.id} onClick={()=>router.push(`/mypage/projects/${p.id}`)}><div className="cardTop"><strong>{p.project_code}</strong><div className="cardBadges"><span className={`badge ${p.status==='quote_presented'||p.status==='customer_review'?'attention':''}`}>{statusLabel(p.status)}</span>{(p.unread_messages??0)>0?<span className="messageBadge">💬 {p.unread_messages}</span>:null}</div></div><h3>{p.title}</h3><div className="cardMeta"><span>{p.quoted_amount!=null?`${p.quoted_amount.toLocaleString()}円`:'見積確認中'}</span><span>納期 {fmt(p.confirmed_deadline)}</span><strong>詳細 →</strong></div></button>)}</div>
     {!visibleProjects.length?<div className="empty">該当するプロジェクトはありません。</div>:null}
   </section>

   <section id="estimate-history" className="widePanel">
     <div className="sectionHead"><div><div className="authBrand">ESTIMATES</div><h2>見積り履歴</h2><p className="muted">保存したAI概算見積りです。正式見積り依頼は見積り詳細から行います。</p></div><input value={estimateSearch} onChange={e=>setEstimateSearch(e.target.value)} placeholder="見積ID・制作方法で検索"/></div>
     <div className="filters">
       <button className={estimateFilter==='current'?'active':''} onClick={()=>setEstimateFilter('current')}>通常 {estimates.filter(e=>!e.archived_at).length}</button>
       <button className={estimateFilter==='archived'?'active':''} onClick={()=>setEstimateFilter('archived')}>アーカイブ {estimates.filter(e=>Boolean(e.archived_at)).length}</button>
     </div>
     <div className="estimateList">{visibleEstimates.map(e=><button type="button" className="estimateRow" key={e.id} onClick={()=>router.push(`/mypage/estimates/${e.id}`)}><div><strong>{e.estimate_code}</strong><span>{production(e.production_method)} ／ {expression(e.expression)}</span></div><div><span>{e.estimated_hours!=null?`${e.estimated_hours}時間`:'―'}</span><strong>{e.estimated_amount!=null?`${e.estimated_amount.toLocaleString()}円`:'個別見積り'}</strong><span>{fmt(e.created_at)}</span><strong className="detailArrow">詳細 →</strong></div></button>)}</div>
     {!visibleEstimates.length?<div className="empty">該当する見積りはありません。</div>:null}
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
       {error?<div className="errorBox full">{error}</div>:null}{message?<div className="success full">{message}</div>:null}
       <button className="primaryButton" disabled={saving}>{saving?'保存中…':'お客様情報を保存'}</button>
     </form>
   </section>

   <style jsx>{`
     .widePanel{box-sizing:border-box;width:100%;margin:28px 0 0;padding:30px 32px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.05)}
     .sectionHead{display:flex;justify-content:space-between;align-items:end;gap:20px;flex-wrap:wrap}.sectionHead input{width:min(360px,100%)}
     .filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.filters button{width:auto!important;display:inline-flex!important;border:1px solid #dbe3ec;border-radius:999px;padding:8px 14px;background:#fff;font-weight:800;cursor:pointer}.filters button.active{background:#0f172a;color:#fff;border-color:#0f172a}
     .projectTableWrap{overflow-x:auto;margin-top:20px}.projectTableWrap table{width:100%;border-collapse:collapse;min-width:900px}.projectTableWrap th,.projectTableWrap td{padding:14px 10px;border-bottom:1px solid #e5eaf0;text-align:left}.projectTableWrap th{background:#f8fafc;font-size:13px}.projectTableWrap tr{cursor:pointer}
     .badge{display:inline-block;padding:5px 9px;border-radius:999px;background:#eefbf3;color:#16733b;font-size:12px;font-weight:800;white-space:nowrap}.badge.attention{background:#fff7ed;color:#c2410c}.messageBadge{display:inline-flex;align-items:center;gap:3px;padding:5px 9px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:900;white-space:nowrap}.noMessage{color:#94a3b8}.cardBadges{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
     .projectCards{display:none}.empty{padding:24px;text-align:center;color:#64748b}
     .estimateList{margin-top:20px}.estimateRow{width:100%!important;display:flex!important;justify-content:space-between;gap:18px;padding:16px 4px;border:0;border-bottom:1px solid #e5eaf0;background:transparent;color:#0f172a;text-align:left;cursor:pointer}.estimateRow:hover{background:#f8fafc}.estimateRow>div{display:flex;gap:16px;align-items:center;flex-wrap:wrap}.estimateRow span{color:#64748b;font-size:13px}.detailArrow{white-space:nowrap}
     .accountForm{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.accountForm .full{grid-column:1/-1}.success{padding:12px 14px;border-radius:10px;background:#eefbf3;color:#16733b;font-weight:700}
     @media(max-width:900px){.projectTableWrap{display:none}.projectCards{display:block;margin-top:18px}.projectCards button{display:block;width:100%;text-align:left;padding:15px;margin-bottom:10px;border:1px solid #dbe3ec;border-radius:12px;background:#fff;color:#0f172a}.cardTop{display:flex;justify-content:space-between;gap:8px}.projectCards h3{font-size:15px;margin:10px 0}.cardMeta{display:flex;gap:10px;flex-wrap:wrap;padding-top:10px;border-top:1px solid #eef2f7;color:#64748b;font-size:12px}.cardMeta strong{margin-left:auto;color:#0f172a}.estimateRow{display:block}.estimateRow>div{margin-top:7px}.accountForm{grid-template-columns:1fr}.accountForm .full{grid-column:auto}}
     @media(max-width:600px){.widePanel{padding:20px 15px;border-radius:14px}.sectionHead input{width:100%}}
   `}</style>
 </main>
}
