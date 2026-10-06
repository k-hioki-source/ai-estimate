'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';

type Booking = {
  id: string;
  title: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  google_meet_url: string | null;
  project_id: string | null;
};
type Project = { id: string; project_code: string | null; title: string | null };

const dateTime = (value: string) => new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value));
const clock = (value: string) => new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value));
const statusName: Record<string, string> = {
  pending: '予約処理中', confirmed: '予約確定', cancelled: 'キャンセル', completed: '完了',
};

export default function ConsultationHistoryPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !auth.user) { router.replace('/login'); return; }
      // The table's SELECT RLS restricts results to the authenticated customer.
      const { data, error: queryError } = await supabase
        .from('consultation_bookings' as any)
        .select('id,title,notes,starts_at,ends_at,status,google_meet_url,project_id')
        .eq('customer_id', auth.user.id)
        .order('starts_at', { ascending: false });
      if (!active) return;
      if (queryError) {
        setError('予約履歴を取得できませんでした。時間をおいて再度お試しください。');
      } else {
        const rows = (data ?? []) as unknown as Booking[];
        setBookings(rows);
        const ids = [...new Set(rows.map(b => b.project_id).filter((id): id is string => Boolean(id)))];
        if (ids.length) {
          const { data: projectData } = await supabase.from('projects')
            .select('id,project_code,title').eq('user_id', auth.user.id).in('id', ids);
          if (!active) return;
          setProjects(Object.fromEntries(((projectData ?? []) as Project[]).map(p => [p.id, p])));
        }
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [router]);

  async function cancelBooking(booking: Booking) {
    if (!window.confirm(`${dateTime(booking.starts_at)} の予約をキャンセルしますか？\nGoogleカレンダーの予定も削除されます。`)) return;
    setCancelId(booking.id);
    setCancelError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('ログインし直してください');
      const response = await fetch('/api/consultations/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      const result = await response.json() as { error?: string; status?: string };
      if (!response.ok || result.status !== 'cancelled') throw new Error(result.error || 'キャンセルできませんでした');
      setBookings(current => current.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b));
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'キャンセルに失敗しました');
    } finally {
      setCancelId(null);
    }
  }

  return <main className="consultationHistory">
    <header className="historyHeader">
      <div><span className="eyebrow">CS WORKS / ONLINE MEETING</span><h1>オンライン相談・予約履歴</h1>
        <p>ご予約の日時とGoogle Meetの参加リンクを確認できます。</p></div>
      <Link href="/mypage">← マイページへ</Link>
    </header>
    <div className="historyActions"><Link href="/mypage/consultations" className="newBooking">＋ 新しい相談を予約する</Link></div>
    {cancelError ? <section className="historyPanel" role="alert">{cancelError}</section> : null}
    {loading ? <section className="historyPanel">予約履歴を読み込んでいます…</section>
      : error ? <section className="historyPanel" role="alert">{error}</section>
      : bookings.length === 0 ? <section className="historyPanel"><h2>予約履歴はありません</h2><p>オンライン相談を予約すると、こちらに表示されます。</p></section>
      : <div className="bookingList">{bookings.map(b => {
          const project = b.project_id ? projects[b.project_id] : null;
          const duration = Math.round((Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60000);
          const validMeet = Boolean(b.google_meet_url && /^https:\/\/meet\.google\.com\/[a-z0-9-]+$/i.test(b.google_meet_url));
          return <section className="historyPanel" key={b.id}>
            <div className="bookingHeading"><h2>{b.title || 'オンライン相談'}</h2><span className="status">{statusName[b.status] || b.status}</span></div>
            <p className="meetingTime">{dateTime(b.starts_at)} ～ {clock(b.ends_at)}（{duration}分）</p>
            <p className="subInfo">{project ? `関連案件：${project.project_code || ''} ${project.title || ''}` : '案件なし・新規相談'}</p>
            {b.notes ? <p className="notes">{b.notes}</p> : null}
            {b.status === 'confirmed' && validMeet ? <a className="meetLink" href={b.google_meet_url!} target="_blank" rel="noopener noreferrer">Google Meetに参加する ↗</a> : null}
            {b.status === 'confirmed' && Date.parse(b.starts_at) - Date.now() >= 24 * 60 * 60 * 1000
              ? <button type="button" className="cancelButton" disabled={cancelId !== null}
                  onClick={() => void cancelBooking(b)}>{cancelId === b.id ? 'キャンセル処理中…' : 'この予約をキャンセル'}</button>
              : null}
            {b.status === 'confirmed' && Date.parse(b.starts_at) - Date.now() < 24 * 60 * 60 * 1000
              ? <p className="subInfo">開始24時間以内のキャンセルは運営にお問い合わせください。</p> : null}
            {b.status === 'pending' ? <p className="subInfo">予約処理中です。確定までしばらくお待ちください。</p> : null}
            {b.status === 'confirmed' && !validMeet ? <p className="subInfo">Meetリンクを確認できません。運営にお問い合わせください。</p> : null}
          </section>;
        })}</div>}
    <style jsx>{`
      .consultationHistory{max-width:1100px;margin:0 auto;padding:28px 20px 72px;color:#0f172a}
      .historyHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap}
      .historyHeader h1{font-size:28px;margin:12px 0}.historyHeader p,.subInfo{color:#64748b;font-size:14px}
      .eyebrow{font-size:12px;letter-spacing:.1em;font-weight:800;color:#2563eb}
      .historyActions{margin:26px 0}.newBooking,.meetLink{display:inline-block;background:#2563eb;color:#fff!important;border-radius:10px;padding:13px 18px;text-decoration:none;font-weight:800}
      .bookingList{display:grid;gap:16px}.historyPanel{background:#fff;border:1px solid #dbe3ec;border-radius:18px;padding:24px 28px;box-shadow:0 8px 24px rgba(15,23,42,.04)}
      .bookingHeading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.bookingHeading h2{font-size:19px;margin:0}.status{font-size:12px;font-weight:800;background:#eff6ff;color:#1d4ed8;border-radius:20px;padding:6px 10px}
      .meetingTime{font-weight:800;margin:18px 0 8px}.notes{white-space:pre-wrap;overflow-wrap:anywhere;background:#f8fafc;border-radius:10px;padding:12px;font-size:14px}.meetLink{margin-top:12px}
      @media(max-width:600px){.historyPanel{padding:20px 16px}.historyHeader h1{font-size:23px}}
    `}</style>
  </main>;
}
