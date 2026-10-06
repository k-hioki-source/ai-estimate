'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

export default function AdminCalendarPage() {
  const router = useRouter();
  const [outcome, setOutcome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [hoursStart, setHoursStart] = useState('09:30');
  const [hoursEnd, setHoursEnd] = useState('18:00');
  const [savingHours, setSavingHours] = useState(false);
  const [hoursMessage, setHoursMessage] = useState('');
  const [hoursError, setHoursError] = useState('');
  const [message, setMessage] = useState('');
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).reduce((o,p) => ({...o,[p.type]:p.value}), {} as Record<string,string>));
  const [duration, setDuration] = useState<30 | 60>(30);
  const [slots, setSlots] = useState<{start:string;end:string;label:string}[]>([]);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const dateValue = `${date.year}-${date.month}-${date.day}`;
  const formatSlot = (slot: {start:string;end:string}) => {
    const fmt = (iso:string) => new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));
    return `${fmt(slot.start)} ～ ${fmt(slot.end)}`;
  };
  useEffect(() => {
    let active = true;
    setOutcome(new URLSearchParams(window.location.search).get('google'));
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { router.replace('/login'); return; }
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!active) return;
      if (data?.role !== 'admin') { router.replace('/mypage'); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setMessage('再ログインしてください'); setLoading(false); return; }
      const response = await fetch('/api/google-calendar/status', {
        headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
      });
      const result = await response.json();
      if (!active) return;
      if (response.ok) { setConnected(!!result.connected); setEmail(result.googleEmail); }
      const settingsResponse = await fetch('/api/admin/consultation-settings', {headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
      if (settingsResponse.ok) { const settings = await settingsResponse.json(); if (active) { setHoursStart(settings.start); setHoursEnd(settings.end); } }
      else if (active) setHoursError('受付時間の設定を取得できません。SQLの適用を確認してください。');
      else setMessage(result.error || '接続状態を取得できませんでした');
      setLoading(false);
    })().catch(() => { if (active) { setMessage('接続状態の取得に失敗しました'); setLoading(false); } });
    return () => { active = false; };
  }, [router]);
  async function connect() {
    setBusy(true); setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('ログインし直してください');
      const response = await fetch('/api/google-calendar/connect', {
        method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error(result.error || '接続を開始できません');
      window.location.assign(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '接続に失敗しました');
      setBusy(false);
    }
  }
  async function checkAvailability() {
    setChecking(true); setChecked(false); setSlots([]); setAvailabilityError('');
    try {
      const supabase = getSupabaseBrowserClient();
      const {data:{session}} = await supabase.auth.getSession();
      if (!session) throw new Error('再ログインしてください');
      const params = new URLSearchParams({date: dateValue, duration: String(duration)});
      const response = await fetch(`/api/google-calendar/availability?${params}`, {headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '取得に失敗しました');
      setSlots(result.slots ?? []); setChecked(true);
    } catch (error) { setAvailabilityError(error instanceof Error ? error.message : '取得に失敗しました'); }
    finally { setChecking(false); }
  }
  if (loading) return <main className="authPage"><section className="authCard">確認しています…</section></main>;
  return <main className="myPageShell" style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>
    <header className="myPageHeader"><div><div className="authBrand">CS Works ADMIN</div><h1>Googleカレンダー連携</h1></div><button className="logoutButton" type="button" onClick={() => router.push('/admin')}>案件管理へ戻る</button></header>
    <section className="welcomeCard" style={{ marginTop: 24 }}>
      <h2>Google Meet オンライン相談予約</h2>
      <p>管理者のGoogleカレンダーを連携します。お客様のオンライン相談予約に利用するGoogleカレンダーです。</p>
      <p style={{ fontWeight: 700 }}>接続状態：{connected ? '接続済み' : '未接続'}</p>
      {email && <p>Googleカレンダー：{email}</p>}
      {outcome === 'connected' && <p>Googleアカウントを接続しました。</p>}
      {outcome && outcome !== 'connected' && <p role="alert">Google連携が完了しませんでした（{outcome}）。</p>}
      {message && <p role="alert">{message}</p>}
      <button type="button" disabled={busy} onClick={connect} style={{ padding: '10px 18px', cursor: 'pointer' }}>{busy ? '接続中…' : connected ? 'Googleアカウントを再接続' : 'Googleアカウントを接続'}</button>
    </section>
    {connected && <section className="welcomeCard" style={{marginTop:20,background:'#fff',color:'#0f172a'}}>
      <h2>予約可能時間の確認（管理者用）</h2>
      <p style={{color:'#334155',lineHeight:1.7}}>平日{hoursStart}〜{hoursEnd}（12:00〜13:00は昼休み）、土日・日本の祝日は休業。30分刻み、既存予定の前後15分を除外。予約開始は24時間以上先、60日以内です。</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
        <label>確認日<br/><input type="date" value={dateValue} onChange={e => {const [year,month,day]=e.target.value.split('-');setDate({year,month,day});setChecked(false);}} style={{padding:10,marginTop:6}} /></label>
        <label>相談時間<br/><select value={duration} onChange={e=>{setDuration(Number(e.target.value) as 30 | 60);setChecked(false);}} style={{padding:10,marginTop:6}}><option value={30}>30分</option><option value={60}>60分</option></select></label>
        <button type="button" onClick={checkAvailability} disabled={checking} style={{padding:'11px 20px',cursor:'pointer'}}>{checking?'確認中…':'空き時間を確認'}</button>
      </div>
      {availabilityError && <p role="alert" style={{color:'#b91c1c'}}>{availabilityError}</p>}
      {checked && <div style={{marginTop:18}}><strong>予約可能な時間：{slots.length}件</strong>{slots.length === 0 ? <p>この日は予約可能な時間がありません。</p> : <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12}}>{slots.map(slot=><span key={slot.start} style={{padding:'9px 12px',border:'1px solid #cbd5e1',borderRadius:9,background:'#f8fafc'}}>{formatSlot(slot)}</span>)}</div>}</div>}
      <p style={{fontSize:12,color:'#64748b',marginTop:18}}>※この画面は空き時間の確認用です。予約確定やGoogle Meet発行は行いません。受付時間の変更は新規予約に適用され、確定済み予約は変更されません。</p>
    </section>}
  </main>;
}
