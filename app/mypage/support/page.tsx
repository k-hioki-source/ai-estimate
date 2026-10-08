'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type SupportThread = {
  id: string;
  subject: string;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  unread?: number;
};

function fmt(v: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(v));
}

export default function SupportPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        router.replace('/login');
        return;
      }
      setUser(u.user);

      const { data: threadData, error: threadError } =
        await (supabase.from('support_threads' as any) as any)
          .select('id, subject, status, created_at, updated_at')
          .eq('user_id', u.user.id)
          .order('updated_at', { ascending: false });

      if (threadError) {
        console.error(threadError);
        setError('お問い合わせ履歴を読み込めませんでした。');
        setLoading(false);
        return;
      }

      const rows = (threadData ?? []) as SupportThread[];
      const ids = rows.map(t => t.id);
      const unread: Record<string, number> = {};

      if (ids.length) {
        const { data: messageData } =
          await (supabase.from('support_messages' as any) as any)
            .select('thread_id')
            .in('thread_id', ids)
            .eq('sender_type', 'admin')
            .is('read_by_customer_at', null);

        for (const m of messageData ?? []) {
          unread[m.thread_id] = (unread[m.thread_id] ?? 0) + 1;
        }
      }

      setThreads(rows.map(t => ({ ...t, unread: unread[t.id] ?? 0 })));
      setLoading(false);
    })();
  }, [router]);

  function selectFiles(next: FileList | null) {
    const selected = Array.from(next ?? []);
    if (selected.length > 5 || selected.some(f => f.size === 0 || f.size > 20 * 1024 * 1024)) {
      setError('添付は最大5ファイル、1ファイル20MBまでです。');
      return;
    }
    const allowed = /\.(jpg|jpeg|png|webp|pdf|ai|eps|zip)$/i;
    if (selected.some(f => !allowed.test(f.name))) {
      setError('対応形式：JPG、PNG、WebP、PDF、AI、EPS、ZIP');
      return;
    }
    setError('');
    setFiles(selected);
  }

  async function createInquiry(ev: FormEvent) {
    ev.preventDefault();
    if (!user || sending) return;

    const cleanSubject = subject.trim();
    const cleanBody = body.trim();
    if (!cleanSubject || !cleanBody) {
      setError('件名とお問い合わせ内容を入力してください。');
      return;
    }

    setSending(true);
    setError('');
    setUploadStatus('');
    const supabase = getSupabaseBrowserClient();

    const { data: thread, error: threadError } =
      await (supabase.from('support_threads' as any) as any)
        .insert({ user_id: user.id, subject: cleanSubject, status: 'open' })
        .select('id')
        .single();

    if (threadError || !thread) {
      console.error(threadError);
      setError('お問い合わせを作成できませんでした。');
      setSending(false);
      return;
    }

    const { data: savedMessage, error: messageError } =
      await (supabase.from('support_messages' as any) as any)
        .insert({
          thread_id: thread.id,
          user_id: user.id,
          sender_type: 'customer',
          message: cleanBody
        })
        .select('id')
        .single();

    if (messageError || !savedMessage) {
      console.error(messageError);
      setError('お問い合わせ本文を送信できませんでした。');
      setSending(false);
      return;
    }

    // 添付は非公開Storageへ保存し、メッセージIDに紐付けます。
    // SQLセットアップ前は添付を選ばずに通常の問い合わせを利用できます。
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadStatus(`添付ファイルを保存中（${i + 1}/${files.length}）`);
      const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const storagePath = `${user.id}/${thread.id}/${savedMessage.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('support-attachments')
        .upload(storagePath, file, { upsert: false, contentType: 'application/octet-stream' });
      if (uploadError) {
        console.error(uploadError);
        window.alert(`お問い合わせ本文は送信されましたが、「${file.name}」の添付に失敗しました。詳細画面でご確認ください。`);
        router.push(`/mypage/support/${thread.id}`);
        return;
      }
      const { error: attachmentError } = await (supabase.from('support_attachments' as any) as any)
        .insert({ thread_id: thread.id, message_id: savedMessage.id, user_id: user.id,
          file_name: file.name, storage_path: storagePath, file_size: file.size });
      if (attachmentError) {
        console.error(attachmentError);
        await supabase.storage.from('support-attachments').remove([storagePath]);
        window.alert(`お問い合わせ本文は送信されましたが、「${file.name}」の添付登録に失敗しました。詳細画面でご確認ください。`);
        router.push(`/mypage/support/${thread.id}`);
        return;
      }
    }
    router.push(`/mypage/support/${thread.id}`);
  }

  if (loading) {
    return <main className="supportShell"><section className="panel"><p>お問い合わせを読み込んでいます…</p></section></main>;
  }

  return (
    <main className="supportShell">
      <header className="supportHeader">
        <div>
          <div className="brand">CS Works</div>
          <h1>運営に相談・問い合わせ</h1>
          <p>案件になる前のご相談や、CS Worksの使い方などをお問い合わせいただけます。</p>
        </div>
        <Link className="backLink" href="/mypage">← My Page</Link>
      </header>

      <div className="supportGrid">
        <section className="panel">
          <div className="brand">NEW INQUIRY</div>
          <h2>新しいお問い合わせ</h2>
          <p className="muted">制作内容のご相談、見積り前のご質問、請求やサービスについてなど、お気軽にご連絡ください。</p>

          <form className="form" onSubmit={createInquiry}>
            <label>
              件名
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="例：製品説明用の3DCG制作について"
                maxLength={120}
              />
            </label>
            <label>
              お問い合わせ内容
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="ご相談内容をご記入ください。"
                rows={8}
              />
            </label>
            <label className="attachmentField">
              参考資料を添付（任意）
              <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.ai,.eps,.zip"
                disabled={sending} onChange={e => selectFiles(e.target.files)} />
              <span className="attachmentHint">最大5ファイル／各20MB。JPG・PNG・WebP・PDF・AI・EPS・ZIP対応</span>
              {files.length > 0 ? <span className="attachmentNames">{files.map(f => f.name).join(' ／ ')}</span> : null}
            </label>
            {uploadStatus ? <div className="uploadStatus">{uploadStatus}</div> : null}
            {error ? <div className="error">{error}</div> : null}
            <button className="primary" disabled={sending}>
              {sending ? '送信中…' : '運営に問い合わせる'}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="brand">HISTORY</div>
          <h2>お問い合わせ履歴</h2>
          <p className="muted">過去の相談・問い合わせと運営からの返信を確認できます。</p>

          <div className="threadList">
            {threads.map(thread => (
              <button
                type="button"
                key={thread.id}
                className="thread"
                onClick={() => router.push(`/mypage/support/${thread.id}`)}
              >
                <div className="threadTop">
                  <strong>{thread.subject}</strong>
                  <span className={`status ${thread.status}`}>
                    {thread.status === 'open' ? '対応中' : '終了'}
                  </span>
                </div>
                <div className="threadMeta">
                  <span>更新 {fmt(thread.updated_at)}</span>
                  {thread.unread ? <span className="unread">返信 {thread.unread}件</span> : null}
                  <strong>内容を見る →</strong>
                </div>
              </button>
            ))}
            {!threads.length ? <div className="empty">まだお問い合わせはありません。</div> : null}
          </div>
        </section>
      </div>

      <style jsx>{`
        .supportShell{max-width:1180px;margin:0 auto;padding:42px 22px 70px;color:#0f172a}
        .supportHeader{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:24px}
        .supportHeader h1{margin:5px 0 8px;font-size:30px}.supportHeader p{margin:0;color:#64748b}
        .brand{font-size:12px;font-weight:900;letter-spacing:.12em;color:#2563eb}
        .backLink{padding:10px 14px;border:1px solid #dbe3ec;border-radius:10px;color:#0f172a;text-decoration:none;font-weight:800;background:#fff}
        .supportGrid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:22px}
        .panel{padding:28px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.05)}
        .panel h2{margin:6px 0 8px}.muted{margin:0 0 20px;color:#64748b;line-height:1.7}
        .form{display:grid;gap:16px}.form label{display:grid;gap:7px;font-size:13px;font-weight:800}
        .form input,.form textarea{box-sizing:border-box;width:100%;padding:12px 13px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;color:#0f172a;background:#fff}
        .form textarea{resize:vertical;line-height:1.7}.form input:focus,.form textarea:focus{outline:2px solid #bfdbfe;border-color:#60a5fa}
        .attachmentHint{font-size:12px;color:#64748b;font-weight:400}.attachmentNames{font-size:12px;color:#1d4ed8;overflow-wrap:anywhere}.uploadStatus{font-size:13px;color:#1d4ed8;font-weight:700}
        .primary{padding:13px 16px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-weight:900;cursor:pointer}.primary:disabled{opacity:.55;cursor:not-allowed}
        .error{padding:11px 13px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-weight:700;font-size:13px}
        .threadList{display:grid;gap:10px}.thread{width:100%;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;text-align:left;color:#0f172a;cursor:pointer}
        .thread:hover{background:#f8fafc}.threadTop,.threadMeta{display:flex;align-items:center;gap:10px}.threadTop{justify-content:space-between}
        .threadMeta{margin-top:11px;color:#64748b;font-size:12px;flex-wrap:wrap}.threadMeta strong{margin-left:auto;color:#0f172a}
        .status{padding:4px 8px;border-radius:999px;font-size:11px;font-weight:900;white-space:nowrap}.status.open{background:#eff6ff;color:#1d4ed8}.status.closed{background:#f1f5f9;color:#64748b}
        .unread{padding:4px 8px;border-radius:999px;background:#fff7ed;color:#c2410c;font-weight:900}.empty{padding:30px 10px;text-align:center;color:#94a3b8}
        @media(max-width:800px){.supportGrid{grid-template-columns:1fr}.supportHeader{align-items:flex-start;flex-direction:column}.panel{padding:20px 16px;border-radius:14px}}
      `}</style>
    </main>
  );
}
