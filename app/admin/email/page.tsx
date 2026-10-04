'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type BroadcastHistory = {
  id: string;
  subject: string;
  recipient_count: number;
  status: string;
  sent_at: string | null;
  created_at: string;
};

type OverviewResponse = {
  ok?: boolean;
  recipientCount?: number;
  histories?: BroadcastHistory[];
  error?: string;
};

export default function AdminEmailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [recipientCount, setRecipientCount] = useState(0);
  const [histories, setHistories] = useState<BroadcastHistory[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const getAccessToken = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token ?? '';
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace('/login');
        return;
      }

      const { data: me, error: meError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();

      if (meError || !me || me.role !== 'admin') {
        router.replace('/mypage');
        return;
      }

      const token = await getAccessToken();
      const res = await fetch('/api/admin/email-broadcast', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = (await res.json()) as OverviewResponse;

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'メール配信情報を取得できませんでした。');
      }

      setRecipientCount(json.recipientCount ?? 0);
      setHistories(json.histories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'メール配信情報を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, router]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function send(mode: 'test' | 'broadcast') {
    setError('');
    setMessage('');

    if (!subject.trim()) {
      setError('件名を入力してください。');
      return;
    }
    if (!body.trim()) {
      setError('本文を入力してください。');
      return;
    }

    if (mode === 'broadcast') {
      if (recipientCount === 0) {
        setError('現在、配信対象の会員がいません。');
        return;
      }

      const confirmed = window.confirm(
        `配信対象 ${recipientCount}名へメールを送信します。\n\n件名：${subject.trim()}\n\n本当に配信しますか？`
      );
      if (!confirmed) return;
    }

    mode === 'test' ? setTestSending(true) : setBroadcastSending(true);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('ログイン情報を確認できませんでした。');

      const res = await fetch('/api/admin/email-broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode,
          subject: subject.trim(),
          body: body.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'メール送信に失敗しました。');
      }

      if (mode === 'test') {
        setMessage(`テストメールを ${json.sentTo} に送信しました。`);
      } else {
        setMessage(`${json.sentCount}件のメール配信が完了しました。`);
        await loadOverview();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'メール送信に失敗しました。');
    } finally {
      setTestSending(false);
      setBroadcastSending(false);
    }
  }

  if (loading) {
    return (
      <main className="authPage">
        <section className="authCard"><p>メール配信画面を読み込んでいます…</p></section>
      </main>
    );
  }

  return (
    <main className="myPageShell">
      <header className="myPageHeader">
        <div>
          <div className="authBrand">CS Works ADMIN</div>
          <h1>会員メール配信</h1>
        </div>
        <div className="headerActions">
          <button type="button" className="navButton" onClick={() => router.push('/admin')}>案件管理</button>
          <button type="button" className="navButton" onClick={() => router.push('/admin/site')}>トップページ管理</button>
          <button type="button" className="navButton" onClick={() => router.push('/admin/support')}>お問い合わせ</button>
        </div>
      </header>

      <section className="mailCard">
        <div className="sectionHead">
          <div>
            <div className="authBrand">BROADCAST</div>
            <h2>ニュース・メンテナンス情報を配信</h2>
            <p>「お知らせメールを受け取る」がONの会員だけに配信します。</p>
          </div>
          <div className="recipientBox">
            <span>現在の配信対象</span>
            <strong>{recipientCount}名</strong>
          </div>
        </div>

        <label className="field">
          <span>件名</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="例：CS Works 新機能のお知らせ"
            maxLength={200}
          />
        </label>

        <label className="field">
          <span>本文</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`例：
いつもCS Worksをご利用いただきありがとうございます。

新しい機能を追加しましたのでお知らせいたします。

今後ともよろしくお願いいたします。`}
            rows={12}
          />
        </label>

        <div className="preview">
          <span className="previewLabel">PREVIEW</span>
          <strong>{subject || 'メールの件名がここに表示されます'}</strong>
          <div className="previewBody">{body || 'メール本文がここに表示されます。'}</div>
          <div className="signature">
            ━━━━━━━━━━━━━━━━<br />
            株式会社クリエイトサポート<br />
            CS Works｜イラスト・CG制作管理サービス<br />
            <br />
            CS Works<br />
            https://estimate.create-support.co.jp/<br />
            <br />
            株式会社クリエイトサポート<br />
            https://www.create-support.co.jp/<br />
            ━━━━━━━━━━━━━━━━
          </div>
        </div>

        {error ? <div className="errorBox">{error}</div> : null}
        {message ? <div className="successBox">{message}</div> : null}

        <div className="actions">
          <button
            type="button"
            className="testButton"
            disabled={testSending || broadcastSending}
            onClick={() => void send('test')}
          >
            {testSending ? 'テスト送信中…' : '自分宛てにテスト送信'}
          </button>
          <button
            type="button"
            className="sendButton"
            disabled={testSending || broadcastSending || recipientCount === 0}
            onClick={() => void send('broadcast')}
          >
            {broadcastSending ? '配信中…' : `${recipientCount}名へ配信する`}
          </button>
        </div>

        <p className="warning">
          本配信を押すと確認画面が表示されます。確認後、対象会員へ個別メールとして送信します。
        </p>
      </section>

      <section className="historyCard">
        <div className="authBrand">HISTORY</div>
        <h2>配信履歴</h2>
        {histories.length ? (
          <div className="historyList">
            {histories.map((item) => (
              <div className="historyItem" key={item.id}>
                <div>
                  <strong>{item.subject}</strong>
                  <span>
                    {new Intl.DateTimeFormat('ja-JP', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    }).format(new Date(item.sent_at || item.created_at))}
                  </span>
                </div>
                <div className="historyMeta">
                  <span>{item.recipient_count}件</span>
                  <b>{item.status === 'sent' ? '配信済み' : item.status}</b>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">まだ配信履歴はありません。</p>
        )}
      </section>

      <style jsx>{`
        .headerActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
        .navButton{width:auto!important;white-space:nowrap;padding:10px 14px;border:1px solid #dbe3ec;border-radius:10px;background:#fff;color:#0f172a;font-weight:800;cursor:pointer}
        .mailCard,.historyCard{box-sizing:border-box;width:100%;margin-top:24px;padding:30px 32px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.06)}
        .sectionHead{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:26px}
        .sectionHead h2,.historyCard h2{margin:5px 0 7px;color:#0f172a}
        .sectionHead p{margin:0;color:#64748b;line-height:1.7}
        .recipientBox{flex:0 0 auto;min-width:145px;padding:16px 18px;border:1px solid #bfdbfe;border-radius:14px;background:#eff6ff;text-align:center}
        .recipientBox span,.recipientBox strong{display:block}
        .recipientBox span{color:#64748b;font-size:12px;font-weight:800}
        .recipientBox strong{margin-top:4px;color:#1d4ed8;font-size:28px}
        .field{display:block;margin-top:20px}
        .field>span{display:block;margin-bottom:7px;color:#0f172a;font-size:13px;font-weight:900}
        .field input,.field textarea{box-sizing:border-box;width:100%;padding:12px 14px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a;font:inherit}
        .field textarea{resize:vertical;line-height:1.75}
        .preview{box-sizing:border-box;width:100%;height:auto;min-height:0;margin-top:24px;padding:22px;border:1px solid #cfe0f4;border-radius:16px;background:#f8fbff;color:#334155;overflow:visible}
        .previewLabel{display:block;margin-bottom:7px;color:#2563eb;font-size:11px;font-weight:900;letter-spacing:.12em}
        .preview>strong{display:block;color:#0f172a;font-size:17px}
        .previewBody{margin-top:18px;white-space:pre-wrap;line-height:1.8}
        .signature{margin-top:24px;color:#64748b;font-size:12px;line-height:1.7}
        .actions{display:flex;gap:12px;justify-content:flex-end;margin-top:28px}
        .testButton,.sendButton{width:auto!important;min-height:46px;padding:11px 20px;border-radius:10px;font-weight:900;cursor:pointer}
        .testButton{border:1px solid #93c5fd;background:#fff;color:#1d4ed8}
        .sendButton{border:1px solid #2563eb;background:#2563eb;color:#fff}
        .testButton:disabled,.sendButton:disabled{cursor:not-allowed;opacity:.55}
        .warning{margin:12px 0 0;color:#64748b;font-size:12px;text-align:right}
        .errorBox,.successBox{margin-top:20px;padding:13px 15px;border-radius:10px;font-weight:800}
        .errorBox{background:#fef2f2;color:#b91c1c}
        .successBox{background:#ecfdf5;color:#047857}
        .historyList{margin-top:18px;border-top:1px solid #e5e7eb}
        .historyItem{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:16px 2px;border-bottom:1px solid #e5e7eb}
        .historyItem strong,.historyItem span{display:block}
        .historyItem strong{color:#0f172a}
        .historyItem span{margin-top:4px;color:#64748b;font-size:12px}
        .historyMeta{display:flex;align-items:center;gap:12px;flex:0 0 auto}
        .historyMeta span{margin:0}
        .historyMeta b{padding:5px 9px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:12px}
        @media(max-width:760px){
          .sectionHead,.historyItem{align-items:stretch;flex-direction:column}
          .recipientBox{width:auto}
          .actions{align-items:stretch;flex-direction:column}
          .testButton,.sendButton{width:100%!important}
          .warning{text-align:left}
          .mailCard,.historyCard{padding:22px 18px;border-radius:16px}
        }
      `}</style>
    </main>
  );
}
