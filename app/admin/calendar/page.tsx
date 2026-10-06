'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

export default function AdminCalendarPage() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setOutcome(new URLSearchParams(window.location.search).get('google'));
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { router.replace('/login'); return; }
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!active) return;
      if (data?.role !== 'admin') { router.replace('/mypage'); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setMessage('再ログインしてください'); setLoading(false); return; }
      const response = await fetch('/api/google-calendar/status', {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
      });
      const result = await response.json();
      if (!active) return;
      if (response.ok) { setConnected(!!result.connected); setEmail(result.googleEmail); }
      else setMessage(result.error || '接続状態を取得できませんでした');
      setLoading(false);
    })().catch(() => { if (active) { setMessage('接続状態の取得に失敗しました'); setLoading(false); } });
    return () => { active = false; };
  }, [router]);
  async function connect() {
    setBusy(true); setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('ログインし直してください');
      const response = await fetch('/api/google-calendar/connect', {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || '接続を開始できません');
      window.location.assign(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '接続に失敗しました');
      setBusy(false);
    }
  }
  if (loading) return <main className="authPage"><section className="authCard">確認しています…</section></main>;
  return <main className="myPageShell" style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
    <header className="myPageHeader"><div><div className="authBrand">CS Works ADMIN</div><h1>Googleカレンダー連携</h1></div><button className="logoutButton" type="button" onClick={() => router.push('/admin')}>案件管理へ戻る</button></header>
    <section className="welcomeCard" style={{ marginTop: 24 }}>
      <h2>Google Meet オンライン相談予約</h2>
      <p>管理者のGoogleカレンダーを連携します。顧客向けの予約受付は今後実装します。</p>
      <p style={{ fontWeight: 700 }}>接続状態：{connected ? '接続済み' : '未接続'}</p>
      {email && <p>Googleカレンダー：{email}</p>}
      {outcome === 'connected' && <p>Googleアカウントを接続しました。</p>}
      {outcome && outcome !== 'connected' && <p role="alert">Google連携が完了しませんでした（{outcome}）。</p>}
      {message && <p role="alert">{message}</p>}
      <button type="button" disabled={busy} onClick={connect} style={{ padding: '10px 18px', cursor: 'pointer' }}>{busy ? '接続中…' : connected ? 'Googleアカウントを再接続' : 'Googleアカウントを接続'}</button>
    </section>
  </main>;
}
