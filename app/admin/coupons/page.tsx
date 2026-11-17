'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {trialCouponEnabled,trialCouponRequest} from '../../../lib/cs-works/trial-coupon-client';
type Month={month:string;registrations:number;grants:number;redemptions:number;full_redemptions:number;partial_redemptions:number;repeat_customers:number;first_revenue_ex_tax:number;repeat_revenue_ex_tax:number};
type Member={user_id:string;company_name:string;consumed_at:string;has_second_order:boolean};
const monthNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
export default function CouponsPage(){
 const [from,setFrom]=useState(monthNow),[to,setTo]=useState(monthNow);
 const [rows,setRows]=useState<Month[]>([]),[members,setMembers]=useState<Member[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){
  setBusy(true);setError('');try{
   const result=await trialCouponRequest<{months:Month[];repeatMembers:Member[]}>('?from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to));
   setRows(result.months);setMembers(result.repeatMembers);
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{if(trialCouponEnabled)void load();},[]);
 function download(){
  const columns=['month','registrations','grants','redemptions','full_redemptions','partial_redemptions','repeat_customers','first_revenue_ex_tax','repeat_revenue_ex_tax'] as const;
  const csv=['月,新規登録,付与,利用,全額適用,一部割引,2回目発注あり,初回売上税抜,継続売上税抜',...rows.map(r=>columns.map(k=>r[k]).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='trial-coupon-'+from+'-'+to+'.csv';a.click();URL.revokeObjectURL(url);
 }
 if(!trialCouponEnabled)return <main className="container"><p>クーポン機能は準備中です。</p><Link href="/admin">管理画面へ</Link></main>;
 return <main className="container" style={{padding:'32px 16px'}}>
 <Link href="/admin">← 管理画面</Link><h1>初回お試しクーポンの月次集計</h1>
 <p>利用数は発注確定月、売上は納品月の値引後・税抜金額です。2回目発注の有無は集計時点の状況を表示します。</p>
 <label>開始月 <input type="month" value={from} onChange={e=>setFrom(e.target.value)}/></label>{' '}
 <label>終了月 <input type="month" value={to} onChange={e=>setTo(e.target.value)}/></label>{' '}
 <button onClick={()=>void load()} disabled={busy}>{busy?'集計中…':'集計する'}</button>{' '}
 <button onClick={download} disabled={!rows.length||busy}>月次CSVを保存</button>
 {error&&<p role="alert">{error}</p>}
 <div style={{overflowX:'auto',marginTop:24}}><table><thead><tr>{['月','新規登録','付与','利用','全額適用','一部割引','2回目発注あり','初回売上（税抜）','継続売上（税抜）'].map(x=><th key={x} style={{padding:8}}>{x}</th>)}</tr></thead>
 <tbody>{rows.map(r=><tr key={r.month}>{[r.month,r.registrations,r.grants,r.redemptions,r.full_redemptions,r.partial_redemptions,r.repeat_customers,r.first_revenue_ex_tax.toLocaleString()+'円',r.repeat_revenue_ex_tax.toLocaleString()+'円'].map((x,i)=><td key={i} style={{padding:8}}>{x}</td>)}</tr>)}</tbody></table></div>
 <h2>利用会員の2回目発注</h2><p>上記期間にクーポンを利用した会員です。</p>
 <table><thead><tr><th>会社名</th><th>クーポン利用日</th><th>2回目発注</th></tr></thead><tbody>{members.map(m=><tr key={m.user_id}><td>{m.company_name}</td><td>{new Date(m.consumed_at).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}</td><td>{m.has_second_order?'あり':'なし'}</td></tr>)}</tbody></table>
 </main>;
}
