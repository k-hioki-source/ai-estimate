'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export default function SignupPage() {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [confirm,setConfirm]=useState('');
  const [error,setError]=useState(''); const [done,setDone]=useState(false); const [loading,setLoading]=useState(false);
  async function handleSubmit(e:FormEvent){
    e.preventDefault(); setError('');
    if(password.length<8){setError('パスワードは8文字以上で設定してください。');return;}
    if(password!==confirm){setError('確認用パスワードが一致しません。');return;}
    setLoading(true); const supabase=getSupabaseBrowserClient();
    const redirectTo=`${window.location.origin}/mypage`;
    const {error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}}); setLoading(false);
    if(error){setError(error.message.includes('already')?'このメールアドレスはすでに登録されています。':'会員登録を完了できませんでした。入力内容をご確認ください。');return;}
    setDone(true);
  }
  if(done) return <main className="authPage"><section className="authCard"><div className="authBrand">CS Works</div><h1>確認メールを送信しました</h1><p className="authLead"><strong>{email}</strong> 宛に確認メールを送りました。メール内のリンクをクリックすると登録が完了します。</p><Link className="primaryButton authButtonLink" href="/login">ログイン画面へ</Link><Link className="backLink" href="/">← AI概算見積りへ戻る</Link></section></main>;
  return <main className="authPage"><section className="authCard"><div className="authBrand">CS Works</div><h1>無料会員登録</h1><p className="muted">まずはメールアドレスでアカウントを作成します。会社情報は次の段階で登録できるようにします。</p>
    <form onSubmit={handleSubmit} className="authForm">
      <div><label>メールアドレス</label><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></div>
      <div><label>パスワード</label><input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} /><div className="fieldHint">8文字以上</div></div>
      <div><label>パスワード（確認）</label><input type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)} /></div>
      {error&&<div className="errorBox">{error}</div>}<button className="primaryButton" disabled={loading}>{loading?'登録中…':'無料会員登録'}</button>
    </form><p className="authFoot">すでに会員の方は <Link href="/login">ログイン</Link></p><Link className="backLink" href="/">← AI概算見積りへ戻る</Link></section></main>;
}
