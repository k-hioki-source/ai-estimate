'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    setError('');
    setLoading(true);

    const supabase = getSupabaseBrowserClient();

    const redirectTo = `${window.location.origin}/reset-password`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setLoading(false);

    if (error) {
      setError(
        '再設定メールを送信できませんでした。しばらくしてからもう一度お試しください。'
      );
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <main className="authPage">
        <section className="authCard">
          <div className="authBrand">CS Works</div>
          <h1>再設定メールを送信しました</h1>

          <p className="muted">
            <strong>{email}</strong> 宛にパスワード再設定メールを送信しました。
            <br />
            メール内のリンクから新しいパスワードを設定してください。
          </p>

          <Link className="backLink" href="/login">
            ← ログイン画面へ
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="authPage">
      <section className="authCard">
        <div className="authBrand">CS Works</div>
        <h1>パスワードの再設定</h1>

        <p className="muted">
          ご登録のメールアドレスを入力してください。
          パスワード再設定用のメールをお送りします。
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

          {error && <div className="errorBox">{error}</div>}

          <button className="primaryButton" disabled={loading}>
            {loading ? '送信中…' : '再設定メールを送信'}
          </button>
        </form>

        <Link className="backLink" href="/login">
          ← ログイン画面へ
        </Link>
      </section>
    </main>
  );
}
