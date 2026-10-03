'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type Thread = {
  id: string;
  user_id: string;
  subject: string;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  company_name?: string;
  contact_name?: string;
  unread?: number;
};

function fmt(v: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(v));
}

export default function AdminSupportPage() {
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'open' | 'all' | 'closed'>('open');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: u } = await supabase.auth.getUser();

      if (!u.user) {
        router.replace('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', u.user.id)
        .single();

      if (!profile || profile.role !== 'admin') {
        router.replace('/mypage');
        return;
      }

      const { data: threadData, error: threadError } =
        await (supabase.from('support_threads' as any) as any)
          .select('id, user_id, subject, status, created_at, updated_at')
          .order('updated_at', { ascending: false });

      if (threadError) {
        console.error(threadError);
        setError('お問い合わせを読み込めませんでした。');
        setLoading(false);
        return;
      }

      const rows = (threadData ?? []) as Thread[];
      const userIds = [...new Set(rows.map(t => t.user_id))];

      const profileByUser: Record<string, { company_name: string; contact_name: string }> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, company_name, contact_name')
          .in('id', userIds);

        for (const p of profiles ?? []) {
          profileByUser[p.id] = {
            company_name: p.company_name ?? '',
            contact_name: p.contact_name ?? ''
          };
        }
      }

      const ids = rows.map(t => t.id);
      const unread: Record<string, number> = {};
      if (ids.length) {
        const { data: messages } =
          await (supabase.from('support_messages' as any) as any)
            .select('thread_id')
            .in('thread_id', ids)
            .eq('sender_type', 'customer')
            .is('read_by_admin_at', null);

        for (const m of messages ?? []) {
          unread[m.thread_id] = (unread[m.thread_id] ?? 0) + 1;
        }
      }

      setThreads(rows.map(t => ({
        ...t,
        company_name: profileByUser[t.user_id]?.company_name ?? '',
        contact_name: profileByUser[t.user_id]?.contact_name ?? '',
        unread: unread[t.id] ?? 0
      })));
      setLoading(false);
    })();
  }, [router]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter(t => {
      const matchesFilter = filter === 'all' || t.status === filter;
      const matchesSearch = !q || [
        t.subject, t.company_name, t.contact_name
      ].some(v => (v ?? '').toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    });
  }, [threads, filter, search]);

  if (loading) {
    return <main className="shell"><section className="panel"><p>お問い合わせを読み込んでいます…</p></section></main>;
  }

  return (
    <main className="shell">
      <header className="header">
        <div>
          <div className="brand">CS Works ADMIN</div>
          <h1>お問い合わせ管理</h1>
          <p>お客様からの相談・問い合わせを確認し、返信できます。</p>
        </div>
        <button className="back" onClick={() => router.push('/admin')}>← 管理画面</button>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="panel">
        <div className="tools">
          <div className="filters">
            <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>
              対応中 {threads.filter(t => t.status === 'open').length}
            </button>
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              すべて {threads.length}
            </button>
            <button className={filter === 'closed' ? 'active' : ''} onClick={() => setFilter('closed')}>
              終了 {threads.filter(t => t.status === 'closed').length}
            </button>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="会社名・担当者・件名で検索" />
        </div>

        <div className="tableWrap">
          <table>
            <thead><tr><th>お客様</th><th>件名</th><th>状態</th><th>未読</th><th>更新日時</th><th></th></tr></thead>
            <tbody>
              {visible.map(t => (
                <tr key={t.id} onClick={() => router.push(`/admin/support/${t.id}`)}>
                  <td><strong>{t.company_name || '―'}</strong><div className="sub">{t.contact_name || '―'}</div></td>
                  <td>{t.subject}</td>
                  <td><span className={`status ${t.status}`}>{t.status === 'open' ? '対応中' : '終了'}</span></td>
                  <td>{t.unread ? <span className="unread">💬 {t.unread}</span> : '―'}</td>
                  <td>{fmt(t.updated_at)}</td>
                  <td><strong>開く →</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="cards">
          {visible.map(t => (
            <button key={t.id} onClick={() => router.push(`/admin/support/${t.id}`)}>
              <div className="cardTop">
                <strong>{t.company_name || t.contact_name || 'お客様'}</strong>
                <span className={`status ${t.status}`}>{t.status === 'open' ? '対応中' : '終了'}</span>
              </div>
              <h3>{t.subject}</h3>
              <div className="cardMeta">
                <span>{fmt(t.updated_at)}</span>
                {t.unread ? <span className="unread">💬 未読 {t.unread}</span> : null}
                <strong>開く →</strong>
              </div>
            </button>
          ))}
        </div>

        {!visible.length ? <div className="empty">該当するお問い合わせはありません。</div> : null}
      </section>

      <style jsx>{`
        .shell{max-width:1180px;margin:0 auto;padding:42px 22px 70px;color:#0f172a}
        .header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:24px}.header h1{margin:5px 0 8px;font-size:30px}.header p{margin:0;color:#64748b}
        .brand{font-size:12px;font-weight:900;letter-spacing:.12em;color:#2563eb}.back{padding:10px 14px;border:1px solid #dbe3ec;border-radius:10px;background:#fff;font-weight:800;cursor:pointer}
        .panel{padding:28px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.05)}
        .tools{display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap}.tools input{box-sizing:border-box;width:min(360px,100%);padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px}
        .filters{display:flex;gap:8px;flex-wrap:wrap}.filters button{padding:8px 14px;border:1px solid #dbe3ec;border-radius:999px;background:#fff;font-weight:800;cursor:pointer}.filters button.active{background:#0f172a;color:#fff;border-color:#0f172a}
        .tableWrap{overflow-x:auto;margin-top:20px}table{width:100%;border-collapse:collapse;min-width:800px}th,td{padding:14px 10px;border-bottom:1px solid #e5eaf0;text-align:left}th{background:#f8fafc;font-size:13px}tbody tr{cursor:pointer}tbody tr:hover{background:#f8fafc}.sub{margin-top:4px;color:#64748b;font-size:12px}
        .status{display:inline-block;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:900}.status.open{background:#eff6ff;color:#1d4ed8}.status.closed{background:#f1f5f9;color:#64748b}.unread{display:inline-block;padding:5px 9px;border-radius:999px;background:#fff7ed;color:#c2410c;font-size:12px;font-weight:900}
        .cards{display:none}.empty{padding:30px;text-align:center;color:#94a3b8}.error{margin-bottom:16px;padding:12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-weight:700}
        @media(max-width:760px){.tableWrap{display:none}.cards{display:grid;gap:10px;margin-top:18px}.cards>button{padding:15px;border:1px solid #dbe3ec;border-radius:12px;background:#fff;color:#0f172a;text-align:left}.cardTop,.cardMeta{display:flex;align-items:center;gap:8px}.cardTop{justify-content:space-between}.cards h3{margin:12px 0}.cardMeta{padding-top:10px;border-top:1px solid #eef2f7;color:#64748b;font-size:12px;flex-wrap:wrap}.cardMeta strong{margin-left:auto;color:#0f172a}.header{align-items:flex-start;flex-direction:column}.panel{padding:20px 14px}.tools input{width:100%}}
      `}</style>
    </main>
  );
}
