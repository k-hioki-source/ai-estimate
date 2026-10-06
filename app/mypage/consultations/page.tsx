'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type Slot = { start: string; end: string; label: string };
type Project = { id: string; project_code: string | null; title: string | null };
type Booking = { bookingId: string; start: string; end: string; meetUrl: string; status: string };
const todayJST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const formatJST = (v: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v));

export default function ConsultationPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [date, setDate] = useState(todayJST);
  const [duration, setDuration] = useState<30 | 60>(30);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { router.replace('/login'); return; }
      const { data } = await supabase.from('projects').select('id,project_code,title').eq('user_id', user.id).order('updated_at', { ascending: false });
      if (active) { setProjects((data ?? []) as Project[]); setReady(true); }
    })();
    return () => { active = false; };
  }, [router]);

  async function token() {
    const { data: { session } } = await getSupabaseBrowserClient().auth.getSession();
    if (!session?.access_token) { router.replace('/login'); throw new Error('ログインし直してください'); }
    return session.access_token;
  }

  async function checkSlots() {
    setError(''); setSlots([]); setSelected(''); setSearched(false); setLoading(true);
    try {
      const bearer = await token();
      const response = await fetch(`/api/consultations/availability?date=${encodeURIComponent(date)}&duration=${duration}`, { headers: { Authorization: `Bearer ${bearer}` }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '空き時間を取得できませんでした');
      setSlots(result.slots ?? []); setSearched(true);
    } catch (e) { setError(e instanceof Error ? e.message : '通信に失敗しました'); }
    finally { setLoading(false); }
  }

  async function confirm() {
    if (!selected || submitting) return;
    if (!window.confirm(`${formatJST(selected)}から${duration}分のオンライン相談を予約しますか？`)) return;
    setSubmitting(true); setError('');
    try {
      const bearer = await token();
      const response = await fetch('/api/consultations/book', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ start: selected, duration, projectId: projectId || null, title: title.trim(), notes: notes.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '予約できませんでした');
      setBooking(result as Booking);
    } catch (e) { setError(e instanceof Error ? e.message : '通信に失敗しました'); setSelected(''); setSlots([]); setSearched(false); }
    finally { setSubmitting(false); }
  }

  if (!ready) return <main className="consultWrap"><p>読み込み中…</p></main>;
  return <main className="consultWrap">
    <div className="consultHeader"><div><div className="eyebrow">CS Works / ONLINE MEETING</div><h1>オンライン相談予約</h1><p>制作内容や見積りについて、Google Meetでご相談いただけます。</p></div><Link href="/mypage">← マイページへ</Link></div>
    {booking ? <section className="panel successPanel"><h2>予約が確定しました</h2><p><strong>{formatJST(booking.start)}（{duration}分）</strong></p><p>開始時間になりましたら、下記のリンクからご参加ください。</p><a className="mainButton meetButton" href={booking.meetUrl} target="_blank" rel="noopener noreferrer">Google Meetに参加する ↗</a><p className="hint">このページを閉じる前に、Meetのリンクを控えてください。</p><Link href="/mypage">マイページへ戻る →</Link></section> : <div className="consultGrid">
      <section className="panel"><h2>1. 日時を選択</h2><p className="hint">平日9:30〜18:00（12:00〜13:00を除く）／祝日休業。24時間以上先、60日以内。</p>
        <div className="fields"><label>相談日<input type="date" value={date} min={todayJST()} onChange={e => { setDate(e.target.value); setSlots([]); setSelected(''); setSearched(false); }} /></label><label>相談時間<select value={duration} onChange={e => { setDuration(Number(e.target.value) as 30 | 60); setSlots([]); setSelected(''); setSearched(false); }}><option value={30}>30分</option><option value={60}>60分</option></select></label></div>
        <button type="button" className="mainButton" onClick={checkSlots} disabled={loading || !date}>{loading ? '確認中…' : '空き時間を確認'}</button>
        {searched && <div className="slots"><h3>予約可能な時間</h3>{slots.length ? <div className="slotGrid">{slots.map(s => <button type="button" key={s.start} className={selected === s.start ? 'slot active' : 'slot'} onClick={() => setSelected(s.start)}>{s.label}</button>)}</div> : <p className="hint">この日は空き時間がありません。別の日をお選びください。</p>}</div>}
      </section>
      <section className="panel"><h2>2. 相談内容を入力</h2><label>関連プロジェクト（任意）<select value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">案件なし・新規相談</option>{projects.map(p => <option key={p.id} value={p.id}>{p.project_code ?? '案件'} / {p.title ?? '名称未設定'}</option>)}</select></label>
        <label>相談件名（任意）<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="例：製品イラスト制作について" /></label>
        <label>相談内容（任意）<textarea value={notes} maxLength={2000} rows={5} onChange={e => setNotes(e.target.value)} placeholder="ご相談内容をご記入ください" /></label>
        <div className="selection"><strong>選択中の日時</strong><p>{selected ? `${formatJST(selected)} から ${duration}分` : '左側で日時を選択してください'}</p></div>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="button" className="mainButton" disabled={!selected || submitting} onClick={confirm}>{submitting ? '予約処理中…' : 'この内容で予約を確定'}</button>
        <p className="hint">確定後にGoogle Meetの参加URLが表示されます。</p>
      </section>
    </div>}
    <style jsx>{`
      .consultWrap{max-width:1160px;margin:0 auto;padding:36px 20px 70px;color:#172235}.consultHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:25px}.consultHeader h1{font-size:29px;margin:6px 0 8px}.consultHeader p,.hint{color:#64748b;line-height:1.7;font-size:13px}.consultHeader a{color:#2563eb;text-decoration:none;white-space:nowrap}.eyebrow{font-size:11px;font-weight:800;letter-spacing:.12em;color:#2563eb}.consultGrid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel{padding:26px;border:1px solid #dce4ee;border-radius:17px;background:white;box-shadow:0 9px 28px rgba(15,23,42,.045)}.panel h2{font-size:19px;margin:0 0 14px}.panel h3{font-size:15px}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}label{display:block;font-weight:700;font-size:13px;margin:15px 0;color:#334155}input,select,textarea{display:block;box-sizing:border-box;width:100%;padding:12px;margin-top:7px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#0f172a;font:inherit}textarea{resize:vertical}.mainButton{display:inline-flex;justify-content:center;align-items:center;border:0;border-radius:10px;background:#2563eb;color:#fff;font-weight:800;padding:13px 20px;margin-top:12px;cursor:pointer;text-decoration:none}.mainButton:disabled{opacity:.45;cursor:not-allowed}.slots{margin-top:25px}.slotGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.slot{border:1px solid #cbd5e1;border-radius:9px;background:#f8fafc;color:#1e293b;padding:12px 6px;font-weight:700;cursor:pointer}.slot.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8;box-shadow:inset 0 0 0 1px #2563eb}.selection{margin-top:20px;padding:15px;border-radius:11px;background:#f1f5f9}.selection p{margin:7px 0 0}.error{padding:12px;background:#fef2f2;color:#b91c1c;border-radius:9px}.successPanel{max-width:650px}.meetButton{margin:18px 0}.successPanel a:not(.meetButton){color:#2563eb}@media(max-width:780px){.consultGrid{grid-template-columns:1fr}.consultHeader{display:block}.consultHeader a{display:inline-block;margin-top:10px}}@media(max-width:450px){.fields,.slotGrid{grid-template-columns:1fr}.panel{padding:18px}}
    `}</style>
  </main>;
}
