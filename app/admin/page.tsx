'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type Project = Omit<Database['public']['Tables']['projects']['Row'], 'status'> & {
  status:
    | Database['public']['Tables']['projects']['Row']['status']
    | 'approved'
    | 'invoice_requested'
    | 'invoiced';
};
type Profile = { id:string; company_name:string|null; contact_name:string|null; email:string|null };
type ProjectInvoice = { project_id:string; payment_due_date:string|null; total_amount:number };
type ProjectWithData = Project & { customer?: Profile|null; unread_messages?: number; invoice?: ProjectInvoice|null };

function fmt(v:string|null){ if(!v)return '―'; return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)); }
function label(s:Project['status']){ return ({quote_requested:'正式見積り依頼',quote_reviewing:'見積り確認中',quote_presented:'正式見積り提示済み',ordered:'発注済み',in_production:'制作中',customer_review:'お客様確認中',revision:'修正対応中',approved:'承認済み・納品待ち',delivered:'納品済み・請求書発行待ち',invoice_requested:'請求書発行依頼あり',invoiced:'請求済み・入金待ち',completed:'完了',cancelled:'発注見送り'} as Record<string,string>)[s]||s; }
const active=new Set(['quote_requested','quote_reviewing','quote_presented','ordered','in_production','customer_review','revision','approved','delivered','invoice_requested','invoiced']);

function statusClass(s:Project['status']){
  if(s==='invoice_requested') return 'invoiceRequested';
  if(s==='invoiced') return 'paymentWaiting';
  if(s==='approved') return 'approvedWaiting';
  if(s==='delivered') return 'deliveredWaiting';
  if(s==='quote_requested'||s==='revision') return 'needsAction';
  return '';
}
function needsAdminAction(s:Project['status']){
  return s==='quote_requested'||s==='revision'||s==='approved'||s==='invoice_requested';
}

const filters=[['active','進行中'],['all','すべて'],['quote_requested','見積依頼'],['ordered','発注済み'],['in_production','制作中'],['customer_review','確認中'],['revision','修正'],['approved','承認済・納品待ち'],['delivered','納品済・請求待ち'],['invoice_requested','請求書発行依頼'],['invoiced','入金待ち'],['completed','完了'],['cancelled','発注見送り']] as const;

export default function AdminPage(){
 const router=useRouter(); const [projects,setProjects]=useState<ProjectWithData[]>([]); const [supportUnread,setSupportUnread]=useState(0); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [search,setSearch]=useState(''); const [filter,setFilter]=useState('active');
 useEffect(()=>{(async()=>{
  const supabase=getSupabaseBrowserClient(); const {data:u}=await supabase.auth.getUser();
  if(!u.user){router.replace('/login');return}
  const {data:me,error:meErr}=await supabase.from('profiles').select('role').eq('id',u.user.id).single();
  if(meErr||!me||me.role!=='admin'){router.replace('/mypage');return}
  const {count:supportUnreadCount,error:supportUnreadError}=await (supabase.from('support_messages' as any) as any)
    .select('id',{count:'exact',head:true})
    .eq('sender_type','customer')
    .is('read_by_admin_at',null);
  if(supportUnreadError) console.error('Support unread load error:',supportUnreadError);
  else setSupportUnread(supportUnreadCount??0);

  const {data:pd,error:pe}=await supabase.from('projects').select('*').order('updated_at',{ascending:false});
  if(pe){setError('プロジェクトを取得できませんでした。');setLoading(false);return}
  const ps=pd??[]; const ids=Array.from(new Set(ps.map(p=>p.user_id))); let profiles:Profile[]=[];
  if(ids.length){const {data}=await supabase.from('profiles').select('id, company_name, contact_name, email').in('id',ids);profiles=data??[]}

  const projectIds=ps.map(p=>p.id);
  const unreadByProject:Record<string,number>={};

  if(projectIds.length){
    const {data:messageData,error:messageError}=await (supabase.from('project_messages' as any) as any)
      .select('project_id, sender_type, message_type, read_by_admin_at')
      .in('project_id',projectIds)
      .eq('message_type','message')
      .eq('sender_type','customer')
      .is('read_by_admin_at',null);

    if(messageError){
      console.error('Unread message load error:',messageError);
    }else{
      for(const message of (messageData??[])){
        unreadByProject[message.project_id]=(unreadByProject[message.project_id]??0)+1;
      }
    }
  }

  const invoiceByProject:Record<string,ProjectInvoice>={};
  if(projectIds.length){
    const {data:invoiceData,error:invoiceError}=await (supabase.from('project_invoices' as any) as any)
      .select('project_id, payment_due_date, total_amount')
      .in('project_id',projectIds);
    if(invoiceError){ console.error('Invoice load error:',invoiceError); }
    else for(const invoice of ((invoiceData??[]) as ProjectInvoice[])){ invoiceByProject[invoice.project_id]=invoice; }
  }

  setProjects(ps.map(p=>({
    ...p,
    customer:profiles.find(x=>x.id===p.user_id)??null,
    unread_messages:unreadByProject[p.id]??0,
    invoice:invoiceByProject[p.id]??null
  })));
  setLoading(false);
 })()},[router]);
 const actionItems=useMemo(()=>{const items:{key:string;projectId:string;projectCode:string;company:string;title:string;detail:string;kind:string}[]=[];for(const p of projects){const company=p.customer?.company_name||p.customer?.contact_name||'お客様';if((p.unread_messages??0)>0)items.push({key:`msg-${p.id}`,projectId:p.id,projectCode:p.project_code,company,title:'新しいメッセージがあります',detail:`未読 ${p.unread_messages}件`,kind:'message'});if(p.status==='quote_requested')items.push({key:`quote-${p.id}`,projectId:p.id,projectCode:p.project_code,company,title:'正式見積り依頼が届いています',detail:p.title??'',kind:'quote'});if(p.status==='revision')items.push({key:`revision-${p.id}`,projectId:p.id,projectCode:p.project_code,company,title:'修正対応が必要です',detail:p.title??'',kind:'revision'});if(p.status==='approved')items.push({key:`approved-${p.id}`,projectId:p.id,projectCode:p.project_code,company,title:'お客様が制作内容を承認しました',detail:'納品対応を進めてください',kind:'approved'});if(p.status==='invoice_requested')items.push({key:`invoice-${p.id}`,projectId:p.id,projectCode:p.project_code,company,title:'請求書発行依頼があります',detail:'請求書を発行してください',kind:'invoice'});}return items},[projects]);
 const counts=useMemo(()=>Object.fromEntries(filters.map(([v])=>[v,v==='all'?projects.length:v==='active'?projects.filter(p=>active.has(p.status)).length:projects.filter(p=>p.status===v).length])),[projects]);
 const visible=useMemo(()=>{const q=search.trim().toLowerCase();return projects.filter(p=>(filter==='all'||(filter==='active'?active.has(p.status):filter==='needs_action'?(p.status==='quote_requested'||p.status==='revision'||p.status==='approved'||p.status==='invoice_requested'):p.status===filter))&&(!q||[p.project_code,p.title,p.customer?.company_name,p.customer?.contact_name,p.customer?.email].some(v=>(v??'').toLowerCase().includes(q))))},[projects,search,filter]);
 if(loading)return <main className="authPage"><section className="authCard"><p>管理画面を読み込んでいます…</p></section></main>;
 return <main className="myPageShell">
  <header className="myPageHeader"><div><div className="authBrand">CS Works ADMIN</div><h1>案件管理</h1></div><div className="adminHeaderActions"><button className="supportButton" onClick={()=>router.push('/admin/site')}>トップページ管理</button><button className="supportButton" onClick={()=>router.push('/admin/email')}>メール配信</button><button className="supportButton" onClick={()=>router.push('/admin/support')}>お問い合わせ{supportUnread>0?<span className="supportUnread">{supportUnread}</span>:null}</button><button className="logoutButton" onClick={()=>router.push('/mypage')}>My Page</button></div></header>
  <section className="welcomeCard"><span className="statusDot"/> 管理者<h2>プロジェクト</h2><p>進行中の案件を中心に、検索・絞り込みして管理できます。</p></section>
   {actionItems.length>0?<section className="actionCenter"><div className="actionCenterHead"><div><div className="authBrand">ACTION</div><h2>新着・要対応</h2><p>現在、確認・対応が必要な内容をまとめています。</p></div><span className="actionCountBadge">{actionItems.length}件</span></div><div className="actionItems">{actionItems.map(item=><button type="button" key={item.key} className="actionItem" onClick={()=>router.push(`/admin/projects/${item.projectId}`)}><span className={`actionIcon ${item.kind}`}>{item.kind==='message'?'💬':item.kind==='quote'?'見積':item.kind==='revision'?'修正':item.kind==='approved'?'承認':'請求'}</span><span className="actionText"><strong>{item.title}</strong><span>{item.company}　{item.projectCode}　{item.detail}</span></span><strong className="actionArrow">確認する →</strong></button>)}</div></section>:null}
  {error?<div className="errorBox" style={{marginTop:20}}>{error}</div>:null}
  <section className="adminProjectList">
   <div style={{display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap',alignItems:'end'}}><div><div className="authBrand">PROJECTS</div><h2>案件一覧</h2><p className="muted">全{projects.length}件 ／ 表示{visible.length}件</p></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="案件番号・会社名・案件名で検索" style={{width:'min(360px, 100%)'}}/></div>
   <div className="desktopFilters adminFilters">
     <button type="button" onClick={()=>setFilter('active')} className={`adminFilterButton ${filter==='active'?'isActive':''}`}>進行中 <span>{counts.active}</span></button>
     <button type="button" onClick={()=>setFilter('needs_action')} className={`adminFilterButton ${filter==='needs_action'?'isActive':''}`}>要対応 <span>{projects.filter(p=>p.status==='quote_requested'||p.status==='revision'||p.status==='approved'||p.status==='invoice_requested').length}</span></button>
     <button type="button" onClick={()=>setFilter('all')} className={`adminFilterButton ${filter==='all'?'isActive':''}`}>すべて <span>{counts.all}</span></button>
     {filters.filter(([v])=>!['active','all'].includes(v) && counts[v]>0).map(([v,l])=><button key={v} type="button" onClick={()=>setFilter(v)} className={`adminFilterButton ${filter===v?'isActive':''}`}>{l} <span>{counts[v]}</span></button>)}
   </div>
   <div className="mobileControls">
     <div className="mobileQuickFilters">
       <button type="button" onClick={()=>setFilter('active')} className={`adminFilterButton ${filter==='active'?'isActive':''}`}>進行中 {counts.active}</button>
       <button type="button" onClick={()=>setFilter('needs_action')} className={`adminFilterButton ${filter==='needs_action'?'isActive':''}`}>要対応 {projects.filter(p=>p.status==='quote_requested'||p.status==='revision'||p.status==='approved'||p.status==='invoice_requested').length}</button>
       <button type="button" onClick={()=>setFilter('completed')} className={`adminFilterButton ${filter==='completed'?'isActive':''}`}>完了 {counts.completed}</button>
     </div>
     <label className="mobileSelectLabel">ステータス
       <select value={filter} onChange={e=>setFilter(e.target.value)}>
         <option value="all">すべて</option>
         <option value="active">進行中</option>
         <option value="needs_action">要対応</option>
         <option value="quote_requested">見積依頼</option>
         <option value="ordered">発注済み</option>
         <option value="in_production">制作中</option>
         <option value="customer_review">確認中</option>
         <option value="revision">修正</option>
         <option value="delivered">納品済み</option>
         <option value="completed">完了</option><option value="cancelled">発注見送り</option>
       </select>
     </label>
   </div>
   <div className="mobileProjectList">
     {visible.map(p=><button type="button" key={p.id} className="mobileProjectCard" onClick={()=>router.push(`/admin/projects/${p.id}`)}>
       <div className="mobileProjectTop"><strong>{p.project_code}</strong><div className="mobileBadges"><span className={`statusBadge ${statusClass(p.status)}`}>{label(p.status)}</span>{(p.unread_messages??0)>0?<span className="messageBadge">💬 {p.unread_messages}</span>:null}</div></div>
       <div className="mobileProjectTitle">{p.title}</div>
       <div className="mobileProjectCompany">{p.customer?.company_name||'会社名未登録'}</div>
        {p.status==='invoiced'&&p.invoice?.payment_due_date?<div className={`paymentDue ${new Date(`${p.invoice.payment_due_date}T23:59:59`).getTime()<Date.now()?'overdue':''}`}>支払期限 {fmt(p.invoice.payment_due_date)}{new Date(`${p.invoice.payment_due_date}T23:59:59`).getTime()<Date.now()?'・期限超過':''}</div>:null}
       <div className="mobileProjectMeta"><span>{p.quoted_amount!=null?`${p.quoted_amount.toLocaleString()}円`:'見積未確定'}</span><span>納期 {fmt(p.confirmed_deadline)}</span><strong>詳細 →</strong></div>
     </button>)}
     {!visible.length?<div className="mobileEmpty">該当する案件はありません。</div>:null}
   </div>
   <div className="adminTableWrap"><table className="adminTable"><thead><tr style={{background:'#f8fafc',textAlign:'left'}}>{['案件番号','会社名','案件名','ステータス','メッセージ','正式見積','納期','更新日',''].map(h=><th key={h} style={{padding:'12px 10px',borderBottom:'1px solid #dbe3ec',fontSize:13}}>{h}</th>)}</tr></thead><tbody>
   {visible.map(p=><tr key={p.id} onClick={()=>router.push(`/admin/projects/${p.id}`)} style={{cursor:'pointer'}}><td style={cell}><strong>{p.project_code}</strong></td><td style={cell}>{p.customer?.company_name||'未登録'}</td><td style={cell}>{p.title}</td><td style={cell}><span className={`statusBadge ${statusClass(p.status)}`}>{label(p.status)}</span>{needsAdminAction(p.status)?<div className="actionHint">{p.status==='approved'?'納品してください':p.status==='invoice_requested'?'請求書を発行してください':'要対応'}</div>:null}{p.status==='invoiced'&&p.invoice?.payment_due_date?<div className={`paymentDue ${new Date(`${p.invoice.payment_due_date}T23:59:59`).getTime()<Date.now()?'overdue':''}`}>支払期限 {fmt(p.invoice.payment_due_date)}{new Date(`${p.invoice.payment_due_date}T23:59:59`).getTime()<Date.now()?'・期限超過':''}</div>:null}</td><td style={cell}>{(p.unread_messages??0)>0?<span className="messageBadge">💬 {p.unread_messages}</span>:<span className="noMessage">―</span>}</td><td style={cell}>{p.quoted_amount!=null?`${p.quoted_amount.toLocaleString()}円`:'―'}</td><td style={cell}>{fmt(p.confirmed_deadline)}</td><td style={cell}>{fmt(p.updated_at)}</td><td style={cell}><strong>詳細 →</strong></td></tr>)}
   </tbody></table>{!visible.length?<div style={{padding:28,textAlign:'center',color:'#64748b'}}>該当する案件はありません。</div>:null}</div>
  </section>
  <style jsx>{`
    .actionCenter{box-sizing:border-box;width:100%;margin:22px 0 0;padding:24px 28px;border:1px solid #bfdbfe;border-radius:18px;background:#f8fbff;box-shadow:0 10px 28px rgba(37,99,235,.06)}.actionCenterHead{display:flex;align-items:center;justify-content:space-between;gap:20px}.actionCenterHead h2{margin:3px 0 4px;font-size:20px}.actionCenterHead p{margin:0;color:#64748b;font-size:13px}.actionCountBadge{padding:7px 11px;border-radius:999px;background:#2563eb;color:#fff;font-size:13px;font-weight:900}.actionItems{margin-top:16px;border-top:1px solid #dbeafe}.actionItem{width:100%!important;display:flex!important;align-items:center;gap:14px;padding:14px 4px!important;border:0!important;border-bottom:1px solid #dbeafe!important;background:transparent!important;color:#0f172a!important;text-align:left!important;cursor:pointer}.actionItem:hover{background:#eff6ff!important}.actionIcon{display:inline-flex;align-items:center;justify-content:center;flex:0 0 42px;height:34px;border-radius:9px;background:#fff;border:1px solid #dbeafe;font-size:11px;font-weight:900}.actionIcon.message{font-size:17px}.actionText{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.actionText strong{font-size:14px}.actionText span{color:#64748b;font-size:12px}.actionArrow{white-space:nowrap;color:#1d4ed8;font-size:12px}
    .adminProjectList{box-sizing:border-box;width:100%;margin:28px 0 0;padding:30px 32px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.06)}
    .adminFilters{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
    .adminFilterButton{width:auto!important;max-width:none!important;display:inline-flex!important;align-items:center;justify-content:center;gap:4px;flex:0 0 auto!important;border:1px solid #dbe3ec;border-radius:999px;padding:8px 13px;background:#fff;color:#334155;font-weight:700;cursor:pointer;white-space:nowrap}
    .adminFilterButton span{font-variant-numeric:tabular-nums}
    .adminFilterButton.isActive{background:#0f172a;color:#fff;border-color:#0f172a}
    .adminFilterButton.isZero:not(.isActive){opacity:.42}
    .mobileControls,.mobileProjectList{display:none}
    .adminTableWrap{overflow-x:auto;margin-top:20px}
    .adminTable{width:100%;border-collapse:collapse;min-width:1050px}
    .adminTable th:nth-child(1){width:175px}
    .adminTable th:nth-child(2){width:190px}
    .adminTable th:nth-child(3){min-width:260px}
    .adminTable th:nth-child(4){width:145px}
    .adminTable th:nth-child(5){width:115px}
    .adminTable th:nth-child(6){width:110px}
    .adminTable th:nth-child(7){width:110px}
    .statusBadge{display:inline-block;padding:5px 9px;border-radius:999px;background:#eefbf3;color:#16733b;font-size:12px;font-weight:800;white-space:nowrap}
    .statusBadge.needsAction{background:#fff7ed;color:#c2410c}
    .statusBadge.approvedWaiting{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
    .statusBadge.deliveredWaiting{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
    .statusBadge.invoiceRequested{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
    .statusBadge.paymentWaiting{background:#fff7ed;color:#9a3412;border:1px solid #fdba74}
    .paymentDue{margin-top:5px;color:#9a3412;font-size:11px;font-weight:800;white-space:nowrap}
    .paymentDue.overdue{color:#b91c1c}
    .actionHint{margin-top:4px;color:#c2410c;font-size:11px;font-weight:800}
     .messageBadge{display:inline-flex;align-items:center;gap:3px;padding:5px 9px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:12px;font-weight:900;white-space:nowrap}
     .noMessage{color:#94a3b8}
     .mobileBadges{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
     .adminHeaderActions{display:flex;gap:8px;align-items:center}
     .supportButton{display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border:1px solid #dbe3ec;border-radius:10px;background:#fff;color:#0f172a;font-weight:800;cursor:pointer;white-space:nowrap;width:auto!important;max-width:none!important;flex:0 0 auto}
     .supportUnread{display:inline-flex;min-width:20px;height:20px;padding:0 6px;align-items:center;justify-content:center;border-radius:999px;background:#dc2626;color:#fff;font-size:11px;font-weight:900;box-sizing:border-box}
    @media (min-width:900px){
      :global(.myPageShell){max-width:1440px!important}
    }
    @media (max-width:1099px){
      .adminProjectList{padding:22px 20px;border-radius:16px}
      .desktopFilters,.adminTableWrap{display:none}
      :global(.adminProjectList input){width:100%!important}
      .mobileControls,.mobileProjectList{display:block}
      .mobileControls{margin-top:18px}
      .mobileQuickFilters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      .mobileQuickFilters .adminFilterButton{width:100%;padding:9px 5px;font-size:13px}
      .mobileSelectLabel{display:block;margin-top:12px;font-size:12px;font-weight:800;color:#64748b}
      .mobileSelectLabel select{display:block;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #dbe3ec;border-radius:10px;background:#fff;color:#0f172a;font-size:14px}
      .mobileProjectList{margin-top:18px}
      .mobileProjectCard{display:block;width:100%;text-align:left;border:1px solid #dbe3ec;border-radius:12px;background:#fff;padding:14px;margin-bottom:10px;color:#0f172a;cursor:pointer}
      .mobileProjectTop{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;font-size:12px}
      .mobileProjectTitle{margin-top:10px;font-size:15px;font-weight:800;line-height:1.45}
      .mobileProjectCompany{margin-top:5px;color:#475569;font-size:13px}
      .mobileProjectMeta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #eef2f7;color:#64748b;font-size:12px}
      .mobileProjectMeta strong{margin-left:auto;color:#0f172a}
      .mobileEmpty{padding:24px;text-align:center;color:#64748b}
    }
    @media (max-width:600px){
      .actionCenter{padding:20px 15px}.actionArrow{display:none}
      .adminProjectList{padding:18px 14px;border-radius:14px}
    }
  `}</style>
 </main>
}
const cell={padding:'14px 10px',borderBottom:'1px solid #e5eaf0'} as const;
