'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type Announcement = {
  id: string;
  label: string;
  title: string;
  body: string;
  is_active: boolean;
};

export default function AdminSitePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [label, setLabel] = useState('AI概算見積り');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { router.replace('/login'); return; }

      const { data: me, error: meErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', u.user.id)
        .single();

      if (meErr || !me || me.role !== 'admin') {
        router.replace('/mypage');
        return;
      }

      const { data, error: loadError } = await (supabase
        .from('site_announcements' as any) as any)
        .select('id,label,title,body,is_active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (loadError) {
        setError(`トップページのお知らせを取得できませんでした。${loadError.message ? `\n${loadError.message}` : ''}${loadError.code ? `\nエラーコード: ${loadError.code}` : ''}`);
      } else if (data) {
        const a = data as Announcement;
        setId(a.id);
        setLabel(a.label ?? 'お知らせ');
        setTitle(a.title ?? '');
        setBody(a.body ?? '');
        setIsActive(Boolean(a.is_active));
      }
      setLoading(false);
    })();
  }, [router]);

  async function save() {
    if (!title.trim()) {
      setError('タイトルを入力してください。');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    const supabase = getSupabaseBrowserClient();
    const payload = {
      label: label.trim() || 'お知らせ',
      title: title.trim(),
      body: body.trim(),
      is_active: isActive,
      updated_at: new Date().toISOString(),
    };

    let saveError: any = null;
    if (id) {
      const result = await (supabase.from('site_announcements' as any) as any)
        .update(payload)
        .eq('id', id);
      saveError = result.error;
    } else {
      const result = await (supabase.from('site_announcements' as any) as any)
        .insert(payload)
        .select('id')
        .single();
      saveError = result.error;
      if (!result.error && result.data?.id) setId(result.data.id);
    }

    if (saveError) setError(`更新できませんでした。${saveError.message ? `\n${saveError.message}` : ''}${saveError.code ? `\nエラーコード: ${saveError.code}` : ''}`);
    else setMessage('トップページのお知らせを更新しました。');
    setSaving(false);
  }

  if (loading) return <main className="page"><section className="card"><p>管理画面を読み込んでいます…</p></section></main>;

  return (
    <main className="page">
      <header className="header">
        <div><div className="brand">CS Works ADMIN</div><h1>トップページ管理</h1></div>
        <button className="back" onClick={() => router.push('/admin')}>案件管理へ戻る</button>
      </header>

      <section className="card">
        <div className="brand">ANNOUNCEMENT</div>
        <h2>トップページのお知らせ</h2>
        <p className="description">未ログインユーザーに表示する「更新情報」ブロックを編集できます。ログイン済みユーザーには表示されません。</p>

        <label className="toggleRow">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          <span><strong>お知らせを表示する</strong><small>{isActive ? '現在：表示する設定' : '現在：非表示の設定'}</small></span>
        </label>

        <label>ラベル<input value={label} onChange={e => setLabel(e.target.value)} placeholder="例：AI概算見積り" /></label>
        <label>タイトル<input value={title} onChange={e => setTitle(e.target.value)} placeholder="お知らせのタイトル" /></label>
        <label>本文<textarea value={body} onChange={e => setBody(e.target.value)} rows={6} placeholder="お知らせ本文" /></label>

        <div className="preview">
          <div className="previewLabel">{label || 'お知らせ'}</div>
          <strong>{title || 'タイトルがここに表示されます'}</strong>
          <p>{body || '本文がここに表示されます。'}</p>
        </div>

        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="success">{message}</div> : null}
        <button className="save" disabled={saving} onClick={save}>{saving ? '更新中…' : '更新する'}</button>
      </section>

      <style jsx>{`
        .page{max-width:1100px;margin:0 auto;padding:36px 24px 70px;color:#0f172a}
        .header{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:24px}
        .brand{font-size:12px;font-weight:900;letter-spacing:.12em;color:#2563eb}
        h1{margin:5px 0 0;font-size:30px} h2{margin:6px 0 8px;font-size:24px}
        .back{border:1px solid #dbe3ec;border-radius:10px;background:#fff;padding:10px 15px;font-weight:800;cursor:pointer}
        .card{background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:30px 32px;box-shadow:0 12px 34px rgba(15,23,42,.06)}
        .description{margin:0 0 24px;color:#64748b;line-height:1.8}
        label{display:block;margin-top:20px;font-size:13px;font-weight:800;color:#334155}
        input[type=text],input:not([type]),textarea{box-sizing:border-box;width:100%;margin-top:7px;border:1px solid #cbd5e1;border-radius:10px;padding:12px 13px;font:inherit;color:#0f172a;background:#fff}
        textarea{resize:vertical;line-height:1.7}
        .toggleRow{display:flex;align-items:center;gap:12px;padding:15px 16px;border:1px solid #dbeafe;background:#f8fbff;border-radius:12px}
        .toggleRow input{width:18px;height:18px;margin:0}.toggleRow span{display:flex;flex-direction:column;gap:3px}.toggleRow small{font-weight:500;color:#64748b}
        .preview{margin-top:26px;padding:20px;border:1px solid #dbeafe;border-radius:14px;background:#f8fbff}
        .previewLabel{margin-bottom:7px;color:#2563eb;font-size:11px;font-weight:900;letter-spacing:.08em}.preview strong{font-size:18px}.preview p{margin:8px 0 0;color:#475569;line-height:1.7;white-space:pre-wrap}
        .error,.success{margin-top:18px;padding:12px 14px;border-radius:10px;font-weight:700;white-space:pre-wrap}.error{background:#fef2f2;color:#b91c1c}.success{background:#ecfdf5;color:#047857}
        .save{margin-top:22px;border:0;border-radius:10px;background:#2563eb;color:#fff;padding:12px 22px;font-weight:900;cursor:pointer}.save:disabled{opacity:.55;cursor:default}
        @media(max-width:650px){.page{padding:22px 14px 50px}.header{align-items:flex-start;flex-direction:column}.card{padding:22px 18px;border-radius:16px}.back{width:100%}}
      `}</style>
    </main>
  );
}
