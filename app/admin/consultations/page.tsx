'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type Booking = { id:string; title:string; notes:string|null; starts_at:string; ends_at:string; status:string; google_meet_url:string|null; company_name:string|null; contact_name:string|null; customer_email:string|null; };
const dateFmt = (v:string) => new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v));
const dateKey = (v:string) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));

export default function AdminConsultationsPage(){
  const router=useRouter();
  const [bookings,setBookings]=useState<Booking[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [tab,setTab]=useState<'upcoming'|'past'|'cancelled'>('upcoming');
  const [month,setMonth]=useState(()=>dateKey(new Date().toISOString()).slice(0,7));
  const [selected,setSelected]=useState<string|null>(null);
  useEffect(()=>{(async()=>{
    const supabase=getSupabaseBrowserClient();
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){router.replace('/login');return;}
    try{
      const response=await fetch('/api/admin/consultations',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
      if(response.status===401){router.replace('/login');return;}
      if(response.status===403){router.replace('/mypage');return;}
      if(!response.ok)throw new Error('予約一覧の取得に失敗しました');
      const data=await response.json() as {bookings:Booking[]};
      setBookings(data.bookings??[]);
    }catch(e){setError(e instanceof Error?e.message:'予約一覧の取得に失敗しました');}
    finally{setLoading(false);}
  })()},[router]);
  const now=Date.now();
  const visible=useMemo(()=>bookings.filter(b=>tab==='cancelled'?b.status==='cancelled':tab==='upcoming'?b.status==='confirmed'&&Date.parse(b.ends_at)>now:b.status!=='cancelled'&&Date.parse(b.ends_at)<=now),[bookings,tab,now]);
  const year=Number(month.slice(0,4)), m=Number(month.slice(5,7));
  const firstDay=new Date(Date.UTC(year,m-1,1)).getUTCDay();
  const daysInMonth=new Date(Date.UTC(year,m,0)).getUTCDate();
  const days=Array.from({length:firstDay+daysInMonth},(_,i)=>i<firstDay?null:i-firstDay+1);
  const dayBookings=selected?bookings.filter(b=>dateKey(b.starts_at)===selected):[];
  function changeMonth(delta:number){const d=new Date(Date.UTC(year,m-1+delta,1));setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`);setSelected(null);}
  return <main style={{maxWidth:1150,margin:'24px auto',padding:'0 16px 60px',color:'#0f172a'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><div style={{color:'#64748b',fontSize:12,fontWeight:800}}>CS WORKS ADMIN</div><h1>オンライン相談・予約管理</h1></div><button type="button" onClick={()=>router.push('/admin')} style={buttonStyle}>← 管理者トップへ</button></div>
    {loading?<p>読み込み中…</p>:error?<p role="alert" style={{color:'#b91c1c'}}>{error}</p>:<>
      <section style={panel}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><h2 style={{margin:0,fontSize:20}}>予約カレンダー</h2><div style={{display:'flex',alignItems:'center',gap:10}}><button type="button" style={buttonStyle} onClick={()=>changeMonth(-1)}>‹</button><strong>{month.replace('-','年')}月</strong><button type="button" style={buttonStyle} onClick={()=>changeMonth(1)}>›</button></div></div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:5,marginTop:20}}>{['日','月','火','水','木','金','土'].map(w=><div key={w} style={{textAlign:'center',fontSize:12,color:'#64748b'}}>{w}</div>)}{days.map((day,i)=>day===null?<div key={`empty-${i}`}/>:<button type="button" key={day} onClick={()=>setSelected(`${month}-${String(day).padStart(2,'0')}`)} style={{minHeight:66,padding:5,background:selected===`${month}-${String(day).padStart(2,'0')}`?'#dbeafe':'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,textAlign:'left',cursor:'pointer',color:'#0f172a'}}><strong>{day}</strong><div style={{fontSize:11,color:'#1d4ed8'}}>{bookings.filter(b=>b.status==='confirmed'&&dateKey(b.starts_at)===`${month}-${String(day).padStart(2,'0')}`).length||''}{bookings.some(b=>b.status==='confirmed'&&dateKey(b.starts_at)===`${month}-${String(day).padStart(2,'0')}`)?'件':''}</div></button>)}</div>
        {selected?<div style={{marginTop:16}}><strong>{selected} の予約</strong>{dayBookings.length?dayBookings.map(b=><p key={b.id} style={{margin:'8px 0',fontSize:13}}>{dateFmt(b.starts_at)}　{b.title}　（{b.status==='cancelled'?'キャンセル':b.status}）</p>):<p style={{fontSize:13,color:'#64748b'}}>この日の予約はありません。</p>}</div>:null}
      </section>
      <section style={panel}><h2 style={{marginTop:0,fontSize:20}}>予約一覧</h2><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{([['upcoming','今後の予約'],['past','過去の相談'],['cancelled','キャンセル']] as const).map(([key,label])=><button type="button" key={key} style={{...buttonStyle,background:tab===key?'#0f172a':'#fff',color:tab===key?'#fff':'#0f172a'}} onClick={()=>setTab(key)}>{label}</button>)}</div>
        {visible.length?visible.map(b=><article key={b.id} style={{borderBottom:'1px solid #e2e8f0',padding:'16px 0'}}><strong>{dateFmt(b.starts_at)} ～ {new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(new Date(b.ends_at))}</strong><p style={{margin:'7px 0'}}>{b.title} ／ {b.company_name||'会社名未登録'}　{b.contact_name||'氏名未登録'}</p><div style={{fontSize:13,color:'#64748b'}}>{b.customer_email||''}</div>{b.notes?<p style={{fontSize:13,whiteSpace:'pre-wrap'}}>相談内容：{b.notes}</p>:null}<div style={{display:'flex',gap:14,marginTop:8,alignItems:'center'}}>{b.status==='confirmed'&&b.google_meet_url?<a href={b.google_meet_url} target="_blank" rel="noopener noreferrer">Google Meetに参加 ↗</a>:null}<span style={{fontSize:12,color:'#64748b'}}>予約ID：{b.id}</span></div></article>):<p style={{color:'#64748b'}}>該当する予約はありません。</p>}
      </section>
    </>}
  </main>;
}
const panel={background:'#fff',border:'1px solid #e2e8f0',borderRadius:16,padding:24,marginTop:20} as const;
const buttonStyle={border:'1px solid #cbd5e1',borderRadius:9,background:'#fff',padding:'9px 13px',cursor:'pointer',fontWeight:700} as const;
