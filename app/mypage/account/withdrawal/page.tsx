'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';

type RequestResult = { threadId: string; messageId: string; alreadyRequested: boolean };

export default function WithdrawalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [activeProjects, setActiveProjects] = useState(0);
  const [bookings, setBookings] = useState(0);
  const [reason, setReason] = useState('');
  const [checks, setChecks] = useState({ noActiveProjects: false, downloaded: false, deletion: false, process: false });
  const confirmed = Object.values(checks).every(Boolean);
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<RequestResult | null>(null);
  const busy = useRef(false);

  useEffect(() => { void (async () => {
    try {
      const db = getSupabaseBrowserClient();
      const { data, error: authError } = await db.auth.getUser();
      if (authError || !data.user) { router.replace('/login'); return; }
      const [profile, projects, reservations, requests] = await Promise.all([
        db.from('profiles').select('role').eq('id', data.user.id).single(),
        db.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', data.user.id).or('status.not.in.(completed,cancelled),and(status.eq.completed,completed_at.is.null)'),
        db.from('consultation_bookings' as any).select('id', { count: 'exact', head: true }).eq('customer_id', data.user.id).eq('status', 'confirmed').gt('ends_at', new Date().toISOString()),
        db.from('support_threads' as any).select('id').eq('user_id', data.user.id).eq('subject', '【退会申請】CS Worksアカウント').eq('status', 'open').limit(1),
      ]);
      if (profile.error || projects.error || reservations.error || requests.error) throw Error('load');
      setAdmin(profile.data?.role === 'admin');
      setActiveProjects(projects.count ?? 0);
      setBookings(reservations.count ?? 0);
      if (requests.data?.[0]) setResult({ threadId: (requests.data[0] as unknown as { id: string }).id, messageId: '', alreadyRequested: true });
    } catch { setLoadFailed(true); setError('情報を取得できませんでした。ページを再読み込みしてください。'); }
    finally { setLoading(false); }
  })(); }, [router]);

  async function stopNewsletter() {
    if (stopping) return;
    setStopping(true); setError(''); setNotice('');
    try {
      const db = getSupabaseBrowserClient();
      const { data, error: authError } = await db.auth.getUser();
      if (authError || !data.user) throw Error('auth');
      const { data: rows, error: saveError } = await db.from('profiles').update({ newsletter_enabled: false }).eq('id', data.user.id).select('id');
      if (saveError || !rows?.length) throw Error('save');
      setNotice('お知らせメールを停止しました。登録と見積り履歴は引き続きご利用いただけます。案件・請求に関する必要な連絡は届きます。');
    } catch { setError('メール設定を保存できませんでした。もう一度お試しください。'); }
    finally { setStopping(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || busy.current || admin || activeProjects > 0 || loadFailed) return;
    busy.current = true; setSending(true); setError('');
    try {
      const db = getSupabaseBrowserClient();
      const { data, error: requestError } = await (db as any).rpc('csworks_submit_account_withdrawal', { p_reason: reason.trim(), p_confirmations: checks });
      if (requestError?.message?.includes('active_projects_exist')) { setActiveProjects(n => Math.max(1, n)); setError('未完了のプロジェクトがあるため退会できません。入金確認を含むすべての手続き完了後にお進みください。'); return; }
      if (requestError || !data?.threadId) throw Error('request');
      const saved = data as RequestResult;
      setResult(saved);
      // 既存の通知経路を利用。失敗しても申請は管理画面に残る。
      try {
        const { data: session } = await db.auth.getSession();
        if (session.session?.access_token) await fetch('/api/support/notify', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.session.access_token}` },
          body: JSON.stringify({ messageId: saved.messageId }),
        });
      } catch { /* 申請内容は保存済み。管理画面で対応できる。 */ }
    } catch { setError('申請を送信できませんでした。通信をご確認のうえ再度お試しください。重複した申請は作成されません。'); }
    finally { busy.current = false; setSending(false); }
  }

  return <main className="withdrawalShell">
    <Link href="/mypage#account-settings">← アカウント設定に戻る</Link>
    <section className="panel">
      <div className="brand">CS Works / ACCOUNT</div><h1>退会手続き</h1>
      {loading ? <p role="status">アカウント情報を確認しています…</p> : result ? <div role="status">
        <h2>退会申請を受け付けました</h2>
        <p>現在は受付の段階で、退会はまだ完了していません。運営が案件・入金状況と削除対象を確認し、手続きについてご案内します。申請だけで案件や相談予約が取り消されることはありません。</p>
        <p>完了までアカウントはご利用いただけます。申請の取り消しや追加のご連絡も、下記の申請内容から送れます。</p>
        <Link className="primary" href={`/mypage/support/${result.threadId}`}>申請内容・運営からの返信を確認する →</Link>
      </div> : admin ? <p>管理者アカウントの退会は、この画面では受け付けていません。管理権限の引き継ぎを含めて運営内でご確認ください。</p> : <>
        <h2>今すぐのご利用予定がなくても、無料で登録を残せます</h2>
        <p>会員登録の維持に費用はかかりません。必要なときに、保存した見積りや案件履歴から制作のご相談を再開できます。</p>
        <div className="alternatives"><Link className="primary" href="/mypage">登録を残してマイページへ</Link><button type="button" className="secondary" onClick={stopNewsletter} disabled={stopping}>{stopping ? '保存中…' : 'お知らせメールだけ停止する'}</button></div>
        <p className="small">メール停止の対象はニュースなどのお知らせです。案件・請求に関する必要な連絡は対象外です。</p>
        {notice && <p className="notice" role="status">{notice}</p>}
        <hr/><h2>退会をご希望の方へ</h2>
        <p>この画面から退会申請を送信できます。進行中・請求中・入金待ちを含む未完了のプロジェクトがある場合は、退会できません。送信した時点ではアカウントは削除されません。運営が確認し、手続きについてご案内します。</p>
        {(activeProjects > 0 || bookings > 0) && <div className="notice"><strong>お手続き前にご確認ください</strong><p>未完了の案件：{activeProjects}件（見積り・制作・請求対応を含む）／今後の相談予約：{bookings}件</p><p>{activeProjects > 0 ? '入金確認を含め、すべてのプロジェクトが完全に終了するまで申請できません。アーカイブ済みの案件も対象です。' : '退会申請によって相談予約は取り消されません。予約履歴からご確認ください。'}</p></div>}
        <p className="small">登録情報・保存資料等の完全削除を希望することを、下のチェックで確認します。実際の削除は運営確認後に行います。取引記録の保存範囲と削除対象は運営からご案内します。必要な見積書・請求書・納品データは事前にお手元へ保存してください。</p>
        <form onSubmit={submit}>
          <label htmlFor="withdrawal-reason">退会理由（任意）</label>
          <textarea id="withdrawal-reason" value={reason} maxLength={1000} rows={4} onChange={e => setReason(e.target.value)} placeholder="差し支えなければお聞かせください。未入力でも申請できます。"/>
          <fieldset disabled={sending || activeProjects > 0 || loadFailed}>
            <legend>確認事項（すべて必須）</legend>
            <label className="confirm"><input type="checkbox" required checked={checks.noActiveProjects} onChange={e => setChecks(c => ({ ...c, noActiveProjects: e.target.checked }))}/>入金確認を含め、すべてのプロジェクトが完全に終了していることを確認しました。</label>
            <label className="confirm"><input type="checkbox" required checked={checks.downloaded} onChange={e => setChecks(c => ({ ...c, downloaded: e.target.checked }))}/>必要な見積書・請求書・納品データを保存しました（保存が必要なデータがない場合を含みます）。</label>
            <label className="confirm"><input type="checkbox" required checked={checks.deletion} onChange={e => setChecks(c => ({ ...c, deletion: e.target.checked }))}/>退会に伴う登録情報・保存資料等の完全削除を希望し、削除後は復元できないことを確認しました。取引記録の保存範囲・削除対象は運営の案内で確認します。</label>
            <label className="confirm"><input type="checkbox" required checked={checks.process} onChange={e => setChecks(c => ({ ...c, process: e.target.checked }))}/>送信は退会申請であり、運営による案件・入金・削除対象の確認後に手続きを進めることを確認しました。相談予約がある場合は予約履歴から確認します。</label>
          </fieldset>
          <button className="withdraw" disabled={!confirmed || sending || loadFailed || activeProjects > 0}>{sending ? '送信中…' : '退会を申請する'}</button>
        </form>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    <style jsx>{`
      .withdrawalShell{max-width:820px;margin:0 auto;padding:36px 20px 70px;color:#0f172a;line-height:1.8}.panel{background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:30px;margin-top:20px}.brand{font-weight:800;color:#2563eb;font-size:12px;letter-spacing:.08em}h1{font-size:28px;margin:5px 0 24px}h2{font-size:19px;line-height:1.6}.alternatives{display:flex;gap:12px;flex-wrap:wrap}.primary,.secondary,.withdraw{display:inline-block;border-radius:10px;padding:12px 16px;font:inherit;font-size:14px;font-weight:700;text-decoration:none;cursor:pointer}.primary{background:#1d4ed8;color:#fff}.secondary{background:#fff;color:#334155;border:1px solid #cbd5e1}.withdraw{background:#fff;color:#b91c1c;border:1px solid #b91c1c;margin-top:14px}button:disabled{opacity:.5;cursor:not-allowed}.small{color:#64748b;font-size:13px}hr{border:0;border-top:1px solid #e2e8f0;margin:28px 0}textarea{box-sizing:border-box;width:100%;padding:12px;font:inherit;border:1px solid #cbd5e1;border-radius:10px;resize:vertical}fieldset{margin:20px 0 0;padding:16px;border:1px solid #cbd5e1;border-radius:10px}legend{font-weight:700}.confirm{display:flex;align-items:flex-start;gap:10px;font-size:14px;margin-top:14px}.confirm input{margin-top:7px;width:18px;height:18px;flex-shrink:0}.notice{padding:14px;border-radius:10px;background:#eff6ff;color:#1e3a8a}.notice p{margin:5px 0}.error{background:#fef2f2;color:#b91c1c;padding:12px;border-radius:10px}a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid #2563eb;outline-offset:3px}@media(max-width:600px){.panel{padding:20px 16px}.alternatives{flex-direction:column}}
    `}</style>
  </main>;
}
