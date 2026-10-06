import { NextRequest, NextResponse } from 'next/server';
import { decryptToken, requireAdmin } from '../../../../lib/google-calendar-auth';
import { isJapaneseNationalHoliday } from '../../../../lib/jp-holidays';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TIMEZONE = 'Asia/Tokyo';
const SLOT_STEP_MIN = 30;
const BUFFER_MIN = 15;
const MS_MIN = 60_000;

function tokyoDate(offsetDays: number) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: TIMEZONE, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Date.now() + offsetDays * 86400000));
  const value = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function dayOfWeek(date: string) { return new Date(`${date}T12:00:00+09:00`).getUTCDay(); }
function isoAt(date: string, hours: number, minutes: number) {
  return new Date(`${date}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00+09:00`).getTime();
}
function formatTime(epoch: number) {
  return new Intl.DateTimeFormat('ja-JP', {timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(epoch));
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request.headers.get('authorization'));
    if (!admin) return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    const date = request.nextUrl.searchParams.get('date') ?? '';
    const duration = Number(request.nextUrl.searchParams.get('duration') ?? '30');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+09:00`)) ||
        !Number.isFinite(new Date(`${date}T12:00:00+09:00`).getTime()) ||
        ![30, 60].includes(duration)) {
      return NextResponse.json({ error: '日付または相談時間が不正です' }, { status: 400 });
    }
    // Today through 60 days ahead. All dates are evaluated in Japan time.
    if (date < tokyoDate(0) || date > tokyoDate(60)) {
      return NextResponse.json({ error: '本日から60日以内の日付を指定してください' }, { status: 400 });
    }
    if ([0, 6].includes(dayOfWeek(date)) || isJapaneseNationalHoliday(date)) {
      return NextResponse.json({ date, duration, timezone: TIMEZONE, slots: [], closed: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const { data: connection, error: dbError } = await admin.db.from('google_calendar_connections')
      .select('encrypted_refresh_token,calendar_id').eq('user_id', admin.user.id).maybeSingle();
    if (dbError) throw dbError;
    if (!connection?.encrypted_refresh_token) return NextResponse.json({ error: 'Googleカレンダーが未接続です' }, { status: 409 });

    const refreshToken = decryptToken(connection.encrypted_refresh_token);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Google credentials missing');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token'}),
      cache: 'no-store',
    });
    if (!tokenResponse.ok) {
      console.error('Google Calendar refresh failed:', tokenResponse.status);
      return NextResponse.json({ error: 'Googleの認証期限切れ、または連携エラーです。再接続してください。' }, { status: 502 });
    }
    const token = await tokenResponse.json() as { access_token?: string };
    if (!token.access_token) return NextResponse.json({ error: 'Googleアクセストークンを取得できません' }, { status: 502 });

    const start = isoAt(date, 0, 0);
    const end = start + 86400000;
    const calendarId = connection.calendar_id || 'primary';
    const freeBusyResponse = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString(), timeZone: TIMEZONE, items: [{id: calendarId}]}),
      cache: 'no-store',
    });
    if (!freeBusyResponse.ok) {
      console.error('Google Calendar freeBusy failed:', freeBusyResponse.status);
      return NextResponse.json({ error: 'Googleカレンダーの空き状況を取得できません。権限を確認してください。' }, { status: 502 });
    }
    const result = await freeBusyResponse.json() as { calendars?: Record<string, {busy?: {start:string;end:string}[]; errors?: unknown[]}> };
    const calendar = result.calendars?.[calendarId];
    if (!calendar || (calendar.errors?.length ?? 0) > 0 || !Array.isArray(calendar.busy)) {
      console.error('Google Calendar freeBusy returned calendar error');
      return NextResponse.json({ error: 'カレンダーの空き状況を取得できません' }, { status: 502 });
    }
    const busy = calendar.busy.map(v => ({start: Date.parse(v.start), end: Date.parse(v.end)}));
    const slots: {start:string;end:string;label:string}[] = [];
    const opening = isoAt(date, 9, 30);
    const closing = isoAt(date, 18, 0);
    for (let candidate = opening; candidate + duration * MS_MIN <= closing; candidate += SLOT_STEP_MIN * MS_MIN) {
      // Only propose future slots, at least 24h ahead.
      if (candidate < Date.now() + 24 * 60 * MS_MIN) continue;
      const finish = candidate + duration * MS_MIN;
      // Do not allow any meeting to overlap the lunch closure (12:00-13:00).
      if (candidate < isoAt(date, 13, 0) && finish > isoAt(date, 12, 0)) continue;
      const overlaps = busy.some(v => candidate < v.end + BUFFER_MIN * MS_MIN && finish > v.start - BUFFER_MIN * MS_MIN);
      if (!overlaps) slots.push({start:new Date(candidate).toISOString(), end:new Date(finish).toISOString(), label:`${formatTime(candidate)}$301C${formatTime(finish)}`});
    }
    return NextResponse.json({ date, duration, timezone: TIMEZONE, slots, closed: false }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Google Calendar availability error:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: '空き時間の取得に失敗しました' }, { status: 500 });
  }
}
