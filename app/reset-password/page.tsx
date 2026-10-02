'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('パスワードは8文字以上で設定してください。');
      return;
    }

    if (password !== confirmPassword) {
      setError('確認用パスワードが一致していません。');
      return;
    }

    setLoading(true);

    const supabase = getSupabaseBrowserClient();

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      setError(
        'パスワードを変更できませんでした。再設定メールからもう一度お試しください。'
      );
      return;
    }

    router.push('/login?reset=success');
    router.refresh();
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <div className="authBrand">CS Works</div>
        <h1>新しいパスワードを設定</h1>

        <p className="muted">
          今後CS Worksへのログインに使用するパスワードを設定してください。
        </p>

        <form onSubmit={handleSubmit} className="authForm">
          <div>
            <label>新しいパスワード</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <small>8文字以上</small>
          </div>

          <div>
            <label>新しいパスワード（確認）</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>

          {error && <div className="errorBox">{error}</div>}

          <button className="primaryButton" disabled={loading}>
            {loading ? '変更中…' : 'パスワードを変更'}
          </button>
        </form>

        <Link className="backLink" href="/login">
          ← ログイン画面へ
        </Link>
      </section>
    </main>
  );
}
