'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { invitationRequest, invitationUIEnabled } from '@/lib/cs-works/invitations-client';
const key = 'csworks.pendingInvitation';
export default function InvitationPage() {
 const router = useRouter(); const [token,setToken]=useState(''),[email,setEmail]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{ if (!invitationUIEnabled) return; const fragment=location.hash.slice(1); if (/^[A-Za-z0-9_-]{43}$/.test(fragment)) { sessionStorage.setItem(key,JSON.stringify({token:fragment,until:Date.now()+7*86400000})); history.replaceState(null,'','/invite'); }
 try { const saved=JSON.parse(sessionStorage.getItem(key)||'null'); if (saved?.until>Date.now()) setToken(saved.token); else sessionStorage.removeItem(key); } catch { sessionStorage.removeItem(key); }
 const db=getSupabaseBrowserClient(); db.auth.getUser().then(r=>{setEmail(r.data.user?.email||'');setReady(true)}); const {data}=db.auth.onAuthStateChange((_event,session)=>setEmail(session?.user.email||'')); return ()=>data.subscription.unsubscribe(); },[]);
 async function accept(){setBusy(true);setError('');try{const r=await invitationRequest('/api/cs-works/invitations/accept',{token});sessionStorage.removeItem(key);router.replace('/mypage/projects/'+r.projectId)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if (!invitationUIEnabled) return <main className="authPage"><p>現在この機能は利用できません。</p></main>;
 return <main className="authPage"><section className="authCard"><div className="authBrand">CS Works</div><h1>案件のご招待</h1><p>クリエイトサポートが用意した案件を受け取ります。招待の承諾だけでは発注されません。</p>
 {!ready?<p>ログイン情報を確認中…</p>:!token?<p>招待メールのリンクをもう一度開いてください。別のタブでメール確認を完了した場合も、元の招待リンクから再開できます。</p>:email?<><p>ログイン中：<strong>{email}</strong></p><p>招待先と同じメールアドレスのアカウントであることをご確認ください。承諾後に案件内容・見積りを確認できます。</p><button className="primaryButton" disabled={busy} onClick={accept}>{busy?'確認中…':'案件を受け取る'}</button><p><button disabled={busy} onClick={async()=>{await getSupabaseBrowserClient().auth.signOut();setEmail('')}}>別のアカウントでログインする</button></p></>:<><p>招待メールが届いたアドレスで登録またはログインしてください。</p><p><Link className="primaryButton" href="/login?returnTo=/invite">登録済みの方：ログイン</Link></p><p><Link href="/signup?returnTo=/invite">初めての方：無料会員登録</Link></p></>}
 {error&&<p role="alert" className="errorBox">{error}</p>}<p><Link href="/mypage">My Pageへ</Link></p></section></main>;
}
