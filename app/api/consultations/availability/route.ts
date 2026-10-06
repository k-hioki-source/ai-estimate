import { NextRequest, NextResponse } from 'next/server';
import { adminClient, decryptToken } from '../../../../../lib/google-calendar-auth';
import { isJapaneseNationalHoliday } from '../../../../../lib/jp-holidays';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TIMEZONE = 'Asia/Tokyo';
const MINUTE = 60_000;

function tokyoDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.now() + offsetDays * 86_400_000));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function epochAt(date: string, hour: number, minute = 0) {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`).getTime();
}
function labelTime(epoch: number) {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(epoch));
}
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  try {
    const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!match) return json({ error: 'ログインが必要です' }, 401);
    const db = adminClient();
    const { data: { user }, error: authError } = await db.auth.getUser(match[1]);
    if (authError || !user) return json({ error: 'ログインが必要です' }, 401);

    const date = request.nextUrl.searchParams.get('date') ?? '';
    const duration = Number(request.nextUrl.searchParams.get('duration') ?? '30');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![30, 60].includes(duration)) {
      return json({ error: '日付または相談時間が不正です' }, 400);
    }
    const midnight = new Date(`${date}T00:00:00+09:00`);
    const [year, month, day] = date.split('-').map(Number);
    if (!Number.isFinite(midnight.getTime()) ||
        new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date) {
      return json({ error: '日付が不正です' }, 400);
    }
    if (date < tokyoDate() || date > tokyoDate(60)) return json({ error: '予約可能期間は本日から60日以内です' }, 400);
    const weekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();
    if (weekday === 0 || weekday === 6 || isJapaneseNationalHoliday(date)) {
      return json({ date, duration, timezone: TIMEZONE, slots: [], closed: true });
    }

    // Initial rollout: one connected administrator is the meeting host.
    const { data: connections, error: connectionError } = await db.from('google_calendar_connections')
      .select('user_id,encrypted_refresh_token,calendar_id').order('connected_at', { ascending: true }).limit(20);
    if (connectionError) throw connectionError;
    let host: { user_id: string; encrypted_refresh_token: string; calendar_id: string } | null = null;
    for (const connection of connections ?? []) {
      const { data: profile } = await db.from('profiles').select('role').eq('id', connection.user_id).maybeSingle();
      if (profile?.role === 'admin' && connection.encrypted_refresh_token) {
        host = connection;
        break;
      }
    }
    if (!host) return json({ error: '現在オンライン相談を受け付けていません' }, 503);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Google credentials missing');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
        refresh_token: decryptToken(host.encrypted_refresh_token), grant_type: 'refresh_token' }), cache: 'no-store',
    });
    if (!tokenResponse.ok) {
      console.error('Customer calendar refresh failed:', tokenResponse.status);
      return json({ error: '予約受付の準備中です。しばらくしてからお試しください' }, 503);
    }
    const token = await tokenResponse.json() as { access_token?: string };
    if (!token.access_token) return json({ error: '空き時間を取得できません' }, 502);

    const dayStart = epochAt(date, 0);
    const calendarId = host.calendar_id || 'primary';
    const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: new Date(dayStart).toISOString(), timeMax: new Date(dayStart + 86_400_000).toISOString(),
        timeZone: TIMEZONE, items: [{ id: calendarId }] }), cache: 'no-store',
    });
    if (!response.ok) {
      console.error('Customer calendar freeBusy failed:', response.status);
      return json({ error: '空き時間を取得できません' }, 502);
    }
    const result = await response.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> };
    const calendar = result.calendars?.[calendarId];
    if (!calendar || !Array.isArray(calendar.busy) || (calendar.errors?.length ?? 0) > 0) {
      return json({ error: '空き時間を取得できません' }, 502);
    }
    const busy = calendar.busy.map(v => ({ start: Date.parse(v.start), end: Date.parse(v.end) }));
    const { data: bookings, error: bookingsError } = await db.from('consultation_bookings')
      .select('starts_at,ends_at').eq('staff_id', host.user_id).in('status', ['pending', 'confirmed'])
      .lt('starts_at', new Date(dayStart + 86_400_000 + 15 * MINUTE).toISOString())
      .gt('ends_at', new Date(dayStart - 15 * MINUTE).toISOString());
    if (bookingsError) throw bookingsError;
    busy.push(...(bookings ?? []).map(v => ({ start: Date.parse(v.starts_at), end: Date.parse(v.ends_at) })));

    const slots: { start: string; end: string; label: string }[] = [];
    for (let start = epochAt(date, 9, 30); start + duration * MINUTE <= epochAt(date, 18); start += 30 * MINUTE) {
      const end = start + duration * MINUTE;
      if (start < Date.now() + 24 * 60 * MINUTE) continue;
      if (start < epochAt(date, 13) && end > epochAt(date, 12)) continue;
      if (busy.some(v => start < v.end + 15 * MINUTE && end > v.start - 15 * MINUTE)) continue;
      slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), label: `${labelTime(start)} ～ ${labelTime(end)}` });
    }
    return json({ date, duration, timezone: TIMEZONE, slots, closed: false });
  } catch (error) {
    console.error('Customer availability error:', error instanceof Error ? error.message : 'unknown');
    return json({ error: '空き時間の取得に失敗しました' }, 500);
  }
}
