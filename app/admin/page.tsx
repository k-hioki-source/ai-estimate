'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type Project = Database['public']['Tables']['projects']['Row'];
type Profile = { id:string; company_name:string|null; contact_name:string|null; email:string|null };
type ProjectWithData = Project & { customer?: Profile|null };

function fmt(v:string|null){ if(!v)return '―'; return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)); }
function label(s:Project['status']){ return ({quote_requested:'正式見積り依頼',quote_reviewing:'見積り確認中',quote_presented:'正式見積り提示済み',ordered:'発注済み',in_production:'制作中',customer_review:'お客様確認中',revision:'修正対応中',delivered:'納品済み',completed:'完了',cancelled:'キャンセル'} as Record<string,string>)[s]||s; }
const active=new Set(['quote_requested','quote_reviewing','quote_presented','ordered','in_production','customer_review','revision','delivered']);
const filters=[['active','進行中'],['all','すべて'],['quote_requested','見積依頼'],['ordered','発注済み'],['in_production','制作中'],['customer_review','確認中'],['revision','修正'],['delivered','納品済み'],['completed','完了']] as const;

export default function AdminPage(){
 const router=useRouter(); const [projects,setProjects]=useState<ProjectWithData[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [search,setSearch]=useState(''); const [filter,setFilter]=useState('active');
 useEffect(()=>{(async()=>{
  const supabase=getSupabaseBrowserClient(); const {data:u}=await supabase.auth.getUser();
  if(!u.user){router.replace('/login');return}
  const {data:me,error:meErr}=await supabase.from('profiles').select('role').eq('id',u.user.id).single();
  if(meErr||!me||me.role!=='admin'){router.replace('/mypage');return}
  const {data:pd,error:pe}=await supabase.from('projects').select('*').order('updated_at',{ascending:false});
  if(pe){setError('プロジェクトを取得できませんでした。');setLoading(false);return}
  const ps=pd??[]; const ids=Array.from(new Set(ps.map(p=>p.user_id))); let profiles:Profile[]=[];
  if(ids.length){const {data}=await supabase.from('profiles').select('id, company_name, contact_name, email').in('id',ids);profiles=data??[]}
  setProjects(ps.map(p=>({...p,customer:profiles.find(x=>x.id===p.user_id)??null})));setLoading(false);
 })()},[router]);
 const counts=useMemo(()=>Object.fromEntries(filters.map(([v])=>[v,v==='all'?projects.length:v==='active'?projects.filter(p=>active.has(p.status)).length:projects.filter(p=>p.status===v).length])),[projects]);
 const visible=useMemo(()=>{const q=search.trim().toLowerCase();return projects.filter(p=>(filter==='all'||(filter==='active'?active.has(p.status):p.status===filter))&&(!q||[p.project_code,p.title,p.customer?.company_name,p.customer?.contact_name,p.customer?.email].some(v=>(v??'').toLowerCase().includes(q))))},[projects,search,filter]);
 if(loading)return <main className="authPage"><section className="authCard"><p>管理画面を読み込んでいます…</p></section></main>;
 return <main className="myPageShell">
  <header className="myPageHeader"><div><div className="authBrand">CS Works ADMIN</div><h1>案件管理</h1></div><button className="logoutButton" onClick={()=>router.push('/mypage')}>My Page</button></header>
  <section className="welcomeCard"><span className="statusDot"/> 管理者<h2>プロジェクト</h2><p>進行中の案件を中心に、検索・絞り込みして管理できます。</p></section>
  {error?<div className="errorBox" style={{marginTop:20}}>{error}</div>:null}
  <section className="authCard" style={{margin:'28px auto 0',maxWidth:'100%'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:16,flexWrap:'wrap',alignItems:'end'}}><div><div className="authBrand">PROJECTS</div><h2>案件一覧</h2><p className="muted">全{projects.length}件 ／ 表示{visible.length}件</p></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="案件番号・会社名・案件名で検索" style={{width:'min(360px, 100%)'}}/></div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}>{filters.map(([v,l])=><button key={v} type="button" onClick={()=>setFilter(v)} style={{border:'1px solid #dbe3ec',borderRadius:999,padding:'8px 12px',background:filter===v?'#0f172a':'#fff',color:filter===v?'#fff':'#334155',fontWeight:700,cursor:'pointer'}}>{l} {counts[v]}</button>)}</div>
   <div style={{overflowX:'auto',marginTop:20}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:900}}><thead><tr style={{background:'#f8fafc',textAlign:'left'}}>{['案件番号','会社名','案件名','ステータス','正式見積','納期','更新日',''].map(h=><th key={h} style={{padding:'12px 10px',borderBottom:'1px solid #dbe3ec',fontSize:13}}>{h}</th>)}</tr></thead><tbody>
   {visible.map(p=><tr key={p.id} onClick={()=>router.push(`/admin/projects/${p.id}`)} style={{cursor:'pointer'}}><td style={cell}><strong>{p.project_code}</strong></td><td style={cell}>{p.customer?.company_name||'未登録'}</td><td style={cell}>{p.title}</td><td style={cell}><span style={{padding:'5px 9px',borderRadius:999,background:'#eefbf3',color:'#16733b',fontSize:12,fontWeight:800}}>{label(p.status)}</span></td><td style={cell}>{p.quoted_amount!=null?`${p.quoted_amount.toLocaleString()}円`:'―'}</td><td style={cell}>{fmt(p.confirmed_deadline)}</td><td style={cell}>{fmt(p.updated_at)}</td><td style={cell}><strong>詳細 →</strong></td></tr>)}
   </tbody></table>{!visible.length?<div style={{padding:28,textAlign:'center',color:'#64748b'}}>該当する案件はありません。</div>:null}</div>
  </section>
 </main>
}
const cell={padding:'14px 10px',borderBottom:'1px solid #e5eaf0'} as const;
