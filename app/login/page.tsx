'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [returnTo, setReturnTo] = useState('/mypage');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(params.get('returnTo') === '/' ? '/' : '/mypage');
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(
        'ログインできませんでした。メールアドレスとパスワードをご確認ください。'
      );
      return;
    }

    router.push(returnTo);
    router.refresh();
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <div className="authBrand">CS Works</div>
        <h1>ログイン</h1>

        <p className="muted">
          {returnTo === '/'
            ? '作成した概算見積りは一時的に保持されています。ログイン後、見積り画面に戻ってMy Pageへ保存できます。'
            : 'クリエイトサポートへの制作依頼・見積り管理をオンラインで。'}
        </p>

        <form onSubmit={handleSubmit} className="authForm">
          <div>
            <label>メールアドレス</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label>パスワード</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="errorBox">{error}</div>}

          <button className="primaryButton" disabled={loading}>
            {loading ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>

        <p className="authFoot">
          <Link href="/forgot-password">パスワードを忘れた方</Link>
        </p>

        <p className="authFoot">
          初めての方は <Link href={returnTo === '/' ? '/signup?returnTo=/' : '/signup'}>無料会員登録</Link>
        </p>

        <Link className="backLink" href="/">
          ← AI概算見積りへ戻る
        </Link>
      </section>
    </main>
  );
}
