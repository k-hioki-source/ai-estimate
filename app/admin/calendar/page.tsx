'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

export default function AdminCalendarPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { router.replace('/login'); return; }
      const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!active) return;
      if (error || data?.role !== 'admin') { router.replace('/mypage'); return; }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router]);

  if (loading) return <main className="authPage"><section className="authCard"><p>確認しています…</p></section></main>;

  return (
    <main className="myPageShell" style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
      <header className="myPageHeader">
        <div><div className="authBrand">CS Works ADMIN</div><h1>Googleカレンダー連携</h1></div>
        <button className="logoutButton" type="button" onClick={() => router.push('/admin')}>案件管理へ戻る</button>
      </header>
      <section className="welcomeCard" style={{ marginTop: 24 }}>
        <h2>Google Meet オンライン相談予約</h2>
        <p>Google Cloud側の設定は完了しています。次の開発段階で、管理者専用のOAuth接続処理と予約可能時間の取得を実装します。</p>
        <p style={{ fontWeight: 700 }}>接続状態：未接続（接続機能は準備中）</p>
      </section>
    </main>
  );
}
