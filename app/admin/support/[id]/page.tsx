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
  closed_at: string | null;
};

type Message = {
  id: string;
  thread_id: string;
  user_id: string;
  sender_type: 'customer' | 'admin' | 'system';
  message: string;
  read_by_admin_at: string | null;
  created_at: string;
};

type Attachment = {
  id: string;
  message_id: string;
  file_name: string;
  storage_path: string;
  file_size: number;
};

type Customer = {
  company_name: string;
  department_name: string;
  contact_name: string;
  email: string;
};

function fmt(v: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(v));
}

export default function AdminSupportThreadPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const threadId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const supabase = getSupabaseBrowserClient();
    const { data: u } = await supabase.auth.getUser();

    if (!u.user) {
      router.replace('/login');
      return;
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', u.user.id)
      .single();

    if (!adminProfile || adminProfile.role !== 'admin') {
      router.replace('/mypage');
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

    const [{ data: messageData, error: messageError }, { data: customerData }] = await Promise.all([
      (supabase.from('support_messages' as any) as any)
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('company_name, department_name, contact_name, email')
        .eq('id', threadData.user_id)
        .single()
    ]);

    if (messageError) {
      console.error(messageError);
      setError('メッセージを読み込めませんでした。');
    }

    const { data: attachmentData, error: attachmentError } =
      await (supabase.from('support_attachments' as any) as any)
        .select('id, message_id, file_name, storage_path, file_size')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

    if (attachmentError) {
      console.error(attachmentError);
      setError('添付ファイルの一覧を取得できませんでした。');
    }
    setAttachments((attachmentData ?? []) as Attachment[]);

    const rows = (messageData ?? []) as Message[];
    setThread(threadData as Thread);
    setMessages(rows);
    if (customerData) setCustomer(customerData as Customer);

    const unreadIds = rows
      .filter(m => m.sender_type === 'customer' && !m.read_by_admin_at)
      .map(m => m.id);

    if (unreadIds.length) {
      await (supabase.from('support_messages' as any) as any)
        .update({ read_by_admin_at: new Date().toISOString() })
        .in('id', unreadIds);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, [threadId]);

  async function downloadAttachment(attachment: Attachment) {
    if (downloadingId) return;
    setDownloadingId(attachment.id);
    setError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: downloadError } = await supabase.storage
        .from('support-attachments')
        .download(attachment.storage_path);
      if (downloadError || !data) throw downloadError ?? new Error('ファイルが取得できません');
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error(e);
      setError('添付ファイルをダウンロードできませんでした。');
    } finally {
      setDownloadingId(null);
    }
  }

  function formatSize(size: number) {
    return size >= 1048576
      ? `${(size / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.ceil(size / 1024))} KB`;
  }

  function chooseReplyFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    const allowed = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf', 'ai', 'eps', 'zip']);
    if (selected.length > 5 || selected.some(file => file.size === 0 || file.size > 20 * 1024 * 1024 || !allowed.has(file.name.split('.').pop()?.toLowerCase() ?? ''))) {
      setError('添付はJPG・PNG・WebP・PDF・AI・EPS・ZIP、最大5ファイル、各20MB以内で選択してください。');
      return;
    }
    setError('');
    setReplyFiles(selected);
  }

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
          sender_type: 'admin',
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

    // 本文の送信は完了済み。添付失敗時も再送信せず、同じ返信に対して案内する。
    setMessages(current => [...current, data as Message]);
    setReply('');
    const uploaded: Attachment[] = [];
    const failures: string[] = [];
    for (const file of replyFiles) {
      const ext = file.name.split('.').pop()!.toLowerCase();
      const path = `${user.id}/${thread.id}/${data.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('support-attachments')
        .upload(path, file, { contentType: 'application/octet-stream', upsert: false });
      if (uploadError) {
        console.error('添付アップロード失敗:', uploadError);
        failures.push(file.name);
        continue;
      }
      const { data: attachmentRow, error: attachmentError } = await (supabase.from('support_attachments' as any) as any)
        .insert({ thread_id: thread.id, message_id: data.id, user_id: user.id,
          file_name: file.name, storage_path: path, file_size: file.size })
        .select('id, message_id, file_name, storage_path, file_size').single();
      if (attachmentError || !attachmentRow) {
        console.error('添付登録失敗:', attachmentError);
        await supabase.storage.from('support-attachments').remove([path]);
        failures.push(file.name);
      } else {
        uploaded.push(attachmentRow as Attachment);
      }
    }
    if (uploaded.length) setAttachments(current => [...current, ...uploaded]);
    setReplyFiles([]);

    // 添付登録完了後に、保存済みの返信IDでお客様宛ての通知を依頼する。
    // 通知が失敗しても本文は保存済みなので、返信を再送信させない。
    let notificationError = '';
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) {
        throw new Error('通知用のログイン情報を取得できませんでした。');
      }
      const notifyResponse = await fetch('/api/support/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ messageId: data.id }),
      });
      if (!notifyResponse.ok) {
        const result = await notifyResponse.json().catch(() => null);
        throw new Error(result?.error || `通知APIエラー (${notifyResponse.status})`);
      }
    } catch (notifyError) {
      console.error('管理者返信のメール通知に失敗:', notifyError);
      notificationError = '返信本文は保存されましたが、お客様へのメール通知に失敗した可能性があります。本文を再送信せず、通知設定やログをご確認ください。';
    }

    const attachmentErrorMessage = failures.length
      ? `返信本文は送信済みですが、${failures.join('、')} の添付に失敗しました。本文を再送信しないでください。`
      : '';
    if (notificationError || attachmentErrorMessage) {
      setError([notificationError, attachmentErrorMessage].filter(Boolean).join('\n'));
    }
    setSending(false);
  }

  async function changeStatus(next: 'open' | 'closed') {
    if (!thread || changingStatus) return;
    setChangingStatus(true);
    setError('');

    const supabase = getSupabaseBrowserClient();
    const now = new Date().toISOString();

    const { data, error: updateError } =
      await (supabase.from('support_threads' as any) as any)
        .update({
          status: next,
          closed_at: next === 'closed' ? now : null,
          updated_at: now
        })
        .eq('id', thread.id)
        .select('*')
        .single();

    if (updateError || !data) {
      console.error(updateError);
      setError('お問い合わせの状態を変更できませんでした。');
      setChangingStatus(false);
      return;
    }

    setThread(data as Thread);
    setChangingStatus(false);
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
          <Link className="backLink" href="/admin/support">← お問い合わせ一覧へ</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <div className="brand">CS Works ADMIN / SUPPORT</div>
          <h1>{thread.subject}</h1>
          <div className="meta">
            <span className={`status ${thread.status}`}>{thread.status === 'open' ? '対応中' : '終了'}</span>
            <span>受付 {fmt(thread.created_at)}</span>
          </div>
        </div>
        <Link className="backLink" href="/admin/support">← お問い合わせ一覧</Link>
      </header>

      <div className="layout">
        <section className="panel">
          <div className="messages">
            {messages.map(message => (
              <article key={message.id} className={`message ${message.sender_type}`}>
                <div className="messageHead">
                  <strong>
                    {message.sender_type === 'customer'
                      ? customer?.contact_name || 'お客様'
                      : message.sender_type === 'admin'
                      ? 'CS Works 運営'
                      : 'システム'}
                  </strong>
                  <span>{fmt(message.created_at)}</span>
                </div>
                <div className="messageBody">{message.message}</div>
                {attachments.filter(a => a.message_id === message.id).map(attachment => (
                  <div className="attachment" key={attachment.id}>
                    <div className="attachmentInfo">
                      <span className="attachmentName">📎 {attachment.file_name}</span>
                      <span className="attachmentSize">{formatSize(attachment.file_size)}</span>
                    </div>
                    <button type="button" className="attachmentButton"
                      disabled={downloadingId !== null}
                      onClick={() => downloadAttachment(attachment)}>
                      {downloadingId === attachment.id ? '取得中…' : 'ダウンロード'}
                    </button>
                  </div>
                ))}
              </article>
            ))}
            {error ? <div className="error">{error}</div> : null}
            {!messages.length ? <div className="empty">メッセージはありません。</div> : null}
          </div>

          {thread.status === 'open' ? (
            <form className="replyForm" onSubmit={sendReply}>
              <label>
                お客様へ返信
                <textarea value={reply} onChange={e => setReply(e.target.value)} rows={7} placeholder="返信内容をご記入ください。" />
              </label>
              <label className="fileField">
                添付ファイル（最大5件・各20MB）
                <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.ai,.eps,.zip"
                  disabled={sending} onChange={chooseReplyFiles} />
              </label>
              {replyFiles.length ? <div className="fileNames">{replyFiles.map((file, i) => <div key={i}>📎 {file.name}</div>)}</div> : null}
              {error ? <div className="error">{error}</div> : null}
              <button className="primary" disabled={sending}>{sending ? '送信中…' : '返信を送信'}</button>
            </form>
          ) : (
            <div className="closedNotice">このお問い合わせは終了しています。再開すると返信できます。</div>
          )}
        </section>

        <aside className="side">
          <section className="sideCard">
            <div className="brand">CUSTOMER</div>
            <h2>お客様情報</h2>
            <dl>
              <div><dt>会社名</dt><dd>{customer?.company_name || '―'}</dd></div>
              <div><dt>部署名</dt><dd>{customer?.department_name || '―'}</dd></div>
              <div><dt>担当者</dt><dd>{customer?.contact_name || '―'}</dd></div>
              <div><dt>メール</dt><dd>{customer?.email || '―'}</dd></div>
            </dl>
          </section>

          <section className="sideCard">
            <div className="brand">STATUS</div>
            <h2>対応状況</h2>
            {thread.status === 'open' ? (
              <>
                <p>対応が完了したら、この問い合わせを終了できます。</p>
                <button className="secondary danger" disabled={changingStatus} onClick={() => changeStatus('closed')}>
                  {changingStatus ? '変更中…' : '対応を終了する'}
                </button>
              </>
            ) : (
              <>
                <p>必要になった場合は、問い合わせを再開できます。</p>
                <button className="secondary" disabled={changingStatus} onClick={() => changeStatus('open')}>
                  {changingStatus ? '変更中…' : '問い合わせを再開する'}
                </button>
              </>
            )}
            {error && thread.status === 'closed' ? <div className="error sideError">{error}</div> : null}
          </section>
        </aside>
      </div>

      <style jsx>{`
        .shell{max-width:1180px;margin:0 auto;padding:42px 22px 70px;color:#0f172a}
        .header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:22px}.header h1{margin:6px 0 10px;font-size:28px}
        .brand{font-size:12px;font-weight:900;letter-spacing:.12em;color:#2563eb}.meta{display:flex;gap:10px;align-items:center;color:#64748b;font-size:12px}
        .status{padding:5px 9px;border-radius:999px;font-weight:900}.status.open{background:#eff6ff;color:#1d4ed8}.status.closed{background:#f1f5f9;color:#64748b}
        .backLink{padding:10px 14px;border:1px solid #dbe3ec;border-radius:10px;color:#0f172a;text-decoration:none;font-weight:800;background:#fff}
        .layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start}.panel,.sideCard{padding:26px;border:1px solid #e2e8f0;border-radius:18px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.05)}
        .side{display:grid;gap:16px}.sideCard{padding:20px}.sideCard h2{margin:6px 0 15px;font-size:18px}.sideCard p{color:#64748b;line-height:1.7;font-size:13px}
        dl{margin:0}dl>div{padding:10px 0;border-bottom:1px solid #eef2f7}dt{font-size:11px;font-weight:800;color:#64748b}dd{margin:4px 0 0;overflow-wrap:anywhere}
        .messages{display:grid;gap:14px}.message{max-width:82%;padding:15px 16px;border-radius:14px;border:1px solid #e2e8f0;background:#f8fafc}.message.customer{margin-right:auto;background:#fff}.message.admin{margin-left:auto;background:#eff6ff;border-color:#bfdbfe}.message.system{max-width:100%;color:#64748b}
        .messageHead{display:flex;justify-content:space-between;gap:14px;margin-bottom:8px;font-size:12px}.messageHead span{color:#64748b;white-space:nowrap}.messageBody{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.75}
        .replyForm{display:grid;gap:13px;margin-top:28px;padding-top:24px;border-top:1px solid #e2e8f0}.replyForm label{display:grid;gap:8px;font-size:13px;font-weight:900}
        textarea{box-sizing:border-box;width:100%;padding:13px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;line-height:1.7;resize:vertical}.primary{justify-self:end;padding:12px 20px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-weight:900;cursor:pointer}
        .secondary{width:100%;padding:11px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:900;cursor:pointer}.secondary.danger{color:#b91c1c;border-color:#fecaca;background:#fffafa}
        button:disabled{opacity:.55;cursor:not-allowed}.error{padding:11px 13px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-weight:700}.sideError{margin-top:10px;font-size:12px}.empty,.closedNotice{padding:22px;text-align:center;color:#64748b;background:#f8fafc;border-radius:10px}.closedNotice{margin-top:24px}
        @media(max-width:850px){.layout{grid-template-columns:1fr}.side{grid-template-columns:1fr 1fr}.header{align-items:flex-start;flex-direction:column}}
        @media(max-width:600px){.side{grid-template-columns:1fr}.panel{padding:20px 14px}.message{max-width:92%}.messageHead{display:block}.messageHead span{display:block;margin-top:3px}}
      `}</style>
    </main>
  );
}
