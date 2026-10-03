'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';

type Thread = {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
};

type Message = {
  id: string;
  thread_id: string;
  user_id: string;
  sender_type: 'customer' | 'admin' | 'system';
  message: string;
  read_by_customer_at: string | null;
  created_at: string;
};

function fmt(v: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(v));
}

export default function SupportThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const threadId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const supabase = getSupabaseBrowserClient();
    const { data: u } = await supabase.auth.getUser();

    if (!u.user) {
      router.replace('/login');
      return;
    }
    setUser(u.user);

    const { data: threadData, error: threadError } =
      await (supabase.from('support_threads' as any) as any)
        .select('*')
        .eq('id', threadId)
        .single();

    if (threadError || !threadData) {
      console.error(threadError);
      setError('お問い合わせを読み込めませんでした。');
      setLoading(false);
      return;
    }

    const { data: messageData, error: messageError } =
      await (supabase.from('support_messages' as any) as any)
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

    if (messageError) {
      console.error(messageError);
      setError('メッセージを読み込めませんでした。');
    }

    const rows = (messageData ?? []) as Message[];
    setThread(threadData as Thread);
    setMessages(rows);

    const unreadIds = rows
      .filter(m => m.sender_type === 'admin' && !m.read_by_customer_at)
      .map(m => m.id);

    if (unreadIds.length) {
      await (supabase.from('support_messages' as any) as any)
        .update({ read_by_customer_at: new Date().toISOString() })
        .in('id', unreadIds);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, [threadId]);

  async function sendReply(ev: FormEvent) {
    ev.preventDefault();
    if (!user || !thread || sending || thread.status !== 'open') return;

    const text = reply.trim();
    if (!text) {
      setError('返信内容を入力してください。');
      return;
    }

    setSending(true);
    setError('');
    const supabase = getSupabaseBrowserClient();

    const { data, error: insertError } =
      await (supabase.from('support_messages' as any) as any)
        .insert({
          thread_id: thread.id,
          user_id: user.id,
          sender_type: 'customer',
          message: text
        })
        .select('*')
        .single();

    if (insertError || !data) {
      console.error(insertError);
      setError('返信を送信できませんでした。');
      setSending(false);
      return;
    }

    await (supabase.from('support_threads' as any) as any)
      .update({ updated_at: new Date().toISOString() })
      .eq('id', thread.id);

    setMessages(current => [...current, data as Message]);
    setReply('');
    setSending(false);
  }

  if (loading) {
    return <main className="shell"><section className="panel"><p>お問い合わせを読み込んでいます…</p></section></main>;
  }

  if (!thread) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>お問い合わせ</h1>
          <div className="error">{error || 'お問い合わせが見つかりません。'}</div>
          <Link className="backLink" href="/mypage/support">← お問い合わせ一覧へ</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <div className="brand">CS Works SUPPORT</div>
          <h1>{thread.subject}</h1>
          <div className="meta">
            <span className={`status ${thread.status}`}>
              {thread.status === 'open' ? '対応中' : '終了'}
            </span>
            <span>受付 {fmt(thread.created_at)}</span>
          </div>
        </div>
        <Link className="backLink" href="/mypage/support">← お問い合わせ一覧</Link>
      </header>

      <section className="panel">
        <div className="messages">
          {messages.map(message => (
            <article
              key={message.id}
              className={`message ${message.sender_type}`}
            >
              <div className="messageHead">
                <strong>
                  {message.sender_type === 'customer'
                    ? 'お客様'
                    : message.sender_type === 'admin'
                    ? 'CS Works 運営'
                    : 'システム'}
                </strong>
                <span>{fmt(message.created_at)}</span>
              </div>
              <div className="messageBody">{message.message}</div>
            </article>
          ))}
          {!messages.length ? <div className="empty">メッセージはありません。</div> : null}
        </div>

        {thread.status === 'open' ? (
          <form className="replyForm" onSubmit={sendReply}>
            <label>
              返信する
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={6}
                placeholder="追加のご質問やご連絡をご記入ください。"
              />
            </label>
            {error ? <div className="error">{error}</div> : null}
            <button className="primary" disabled={sending}>
              {sending ? '送信中…' : '返信を送信'}
            </button>
          </form>
        ) : (
          <div className="closedNotice">このお問い合わせは終了しています。</div>
        )}
      </section>

      <style jsx>{`
        .shell{max-width:960px;margin:0 auto;padding:42px 22px 70px;color:#0f172a}
        .header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:22px}
        .header h1{margin:6px 0 10px;font-size:28px}.brand{font-size:12px;font-weight:900;letter-spacing:.12em;color:#2563eb}
        .meta{display:flex;gap:10px;align-items:center;color:#64748b;font-size:12px}.status{padding:5px 9px;border-radius:999px;font-weight:900}
        .status.open{background:#eff6ff;color:#1d4ed8}.status.closed{background:#f1f5f9;color:#64748b}
        .backLink{padding:10px 14px;border:1px solid #dbe3ec;border-radius:10px;color:#0f172a;text-decoration:none;font-weight:800;background:#fff}
        .panel{padding:28px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.05)}
        .messages{display:grid;gap:14px}.message{max-width:82%;padding:15px 16px;border-radius:14px;border:1px solid #e2e8f0;background:#f8fafc}
        .message.customer{margin-left:auto;background:#eff6ff;border-color:#bfdbfe}.message.admin{margin-right:auto;background:#fff}.message.system{max-width:100%;background:#f8fafc;color:#64748b}
        .messageHead{display:flex;justify-content:space-between;gap:14px;margin-bottom:8px;font-size:12px}.messageHead span{color:#64748b;white-space:nowrap}
        .messageBody{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75}
        .replyForm{display:grid;gap:13px;margin-top:28px;padding-top:24px;border-top:1px solid #e2e8f0}.replyForm label{display:grid;gap:8px;font-size:13px;font-weight:900}
        textarea{box-sizing:border-box;width:100%;padding:13px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;line-height:1.7;resize:vertical}
        textarea:focus{outline:2px solid #bfdbfe;border-color:#60a5fa}.primary{justify-self:end;padding:12px 20px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-weight:900;cursor:pointer}.primary:disabled{opacity:.55}
        .error{padding:11px 13px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-weight:700}.empty,.closedNotice{padding:22px;text-align:center;color:#64748b;background:#f8fafc;border-radius:10px}.closedNotice{margin-top:24px}
        @media(max-width:650px){.header{align-items:flex-start;flex-direction:column}.panel{padding:20px 14px}.message{max-width:92%}.messageHead{display:block}.messageHead span{display:block;margin-top:3px}}
      `}</style>
    </main>
  );
}
