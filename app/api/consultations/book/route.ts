import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminClient, decryptToken } from '../../../../lib/google-calendar-auth';
import { isJapaneseNationalHoliday } from '../../../../lib/jp-holidays';
import { sendConsultationEmails } from '../../../../lib/consultation-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MINUTE = 60_000;
const TIMEZONE = 'Asia/Tokyo';
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const dateInTokyo = (time: number) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const timeAt = (day: string, hour: number, minute = 0) => Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`);
const errorText = (e: unknown) => e instanceof Error ? e.message : 'unknown';

async function accessToken(refresh: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google credentials missing');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: decryptToken(refresh), grant_type: 'refresh_token' }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google refresh failed (${response.status})`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Google access token missing');
  return data.access_token;
}

async function googleBusy(token: string, calendarId: string, start: number, end: number) {
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString(), timeZone: TIMEZONE, items: [{ id: calendarId }] }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Google freeBusy failed (${response.status})`);
  const data = await response.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> };
  const calendar = data.calendars?.[calendarId];
  if (!calendar || !Array.isArray(calendar.busy) || (calendar.errors?.length ?? 0)) throw new Error('Google freeBusy calendar error');
  return calendar.busy.map(v => ({ start: Date.parse(v.start), end: Date.parse(v.end) }));
}

async function removeGoogleEvent(token: string, calendarId: string, eventId: string) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google event cleanup failed (${response.status})`);
}

type RequestBody = { start?: unknown; duration?: unknown; projectId?: unknown; title?: unknown; notes?: unknown };

export async function POST(request: NextRequest) {
  let bookingId: string | null = null;
  let eventId: string | null = null;
  let calendarId = 'primary';
  let token: string | null = null;
  const db = adminClient();
  try {
    const auth = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!auth) return json({ error: 'ログインが必要です' }, 401);
    const { data: { user }, error: authError } = await db.auth.getUser(auth[1]);
    if (authError || !user) return json({ error: 'ログインが必要です' }, 401);

    let input: RequestBody;
    try { input = await request.json() as RequestBody; } catch { return json({ error: '送信データが不正です' }, 400); }
    const duration = input.duration;
    if (duration !== 30 && duration !== 60) return json({ error: '相談時間は30分または60分です' }, 400);
    if (typeof input.start !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.start)) {
      return json({ error: '開始日時はISO形式で指定してください' }, 400);
    }
    const start = Date.parse(input.start);
    if (!Number.isFinite(start)) return json({ error: '開始日時が不正です' }, 400);
    const end = start + duration * MINUTE;
    const day = dateInTokyo(start);
    const weekday = new Date(`${day}T12:00:00+09:00`).getUTCDay();
    if (day < dateInTokyo(Date.now()) || day > dateInTokyo(Date.now() + 60 * 86_400_000) ||
        start < Date.now() + 24 * 60 * MINUTE || weekday === 0 || weekday === 6 || isJapaneseNationalHoliday(day) ||
        start < timeAt(day, 9, 30) || end > timeAt(day, 18) ||
        (start < timeAt(day, 13) && end > timeAt(day, 12)) ||
        (start - timeAt(day, 9, 30)) % (30 * MINUTE) !== 0) {
      return json({ error: '予約できない日時です。空き時間から選択してください' }, 400);
    }

    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
    if (title.length > 120 || notes.length > 2000) return json({ error: '相談内容が長すぎます' }, 400);
    const projectId = input.projectId === null || input.projectId === undefined || input.projectId === '' ? null : input.projectId;
    if (projectId !== null) {
      if (typeof projectId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(projectId)) return json({ error: '案件IDが不正です' }, 400);
      const { data: project, error: projectError } = await db.from('projects').select('id').eq('id', projectId).eq('user_id', user.id).maybeSingle();
      if (projectError) throw projectError;
      if (!project) return json({ error: '指定した案件が見つかりません' }, 403);
    }

    // Match the existing customer availability API's initial host-selection rule.
    const { data: connections, error: connectionError } = await db.from('google_calendar_connections')
      .select('user_id,encrypted_refresh_token,calendar_id').order('connected_at', { ascending: true }).limit(20);
    if (connectionError) throw connectionError;
    let host: { user_id: string; encrypted_refresh_token: string; calendar_id: string } | null = null;
    for (const connection of connections ?? []) {
      const { data: profile } = await db.from('profiles').select('role').eq('id', connection.user_id).maybeSingle();
      if (profile?.role === 'admin' && connection.encrypted_refresh_token) { host = connection; break; }
    }
    if (!host) return json({ error: '現在オンライン相談を受け付けていません' }, 503);
    calendarId = host.calendar_id || 'primary';
    token = await accessToken(host.encrypted_refresh_token);
    const busy = await googleBusy(token, calendarId, start - 15 * MINUTE, end + 15 * MINUTE);
    if (busy.some(v => start < v.end + 15 * MINUTE && end > v.start - 15 * MINUTE)) {
      return json({ error: 'この時間帯はすでに予約できません。別の時間を選択してください' }, 409);
    }

    // The SQL RPC serializes reservations for this host and checks the 15-minute buffer.
    const { data: reservedId, error: reserveError } = await db.rpc('reserve_consultation_slot', {
      p_customer_id: user.id, p_staff_id: host.user_id, p_project_id: projectId,
      p_title: title || 'オンライン相談', p_notes: notes || null,
      p_starts_at: new Date(start).toISOString(), p_ends_at: new Date(end).toISOString(),
    });
    if (reserveError) {
      if (reserveError.code === '23P01') return json({ error: '直前に別の予約が入りました。時間を選び直してください' }, 409);
      throw reserveError;
    }
    if (typeof reservedId !== 'string') throw new Error('Reservation RPC returned no ID');
    bookingId = reservedId;

    // Recheck Google after the DB reservation was acquired.
    const rechecked = await googleBusy(token, calendarId, start - 15 * MINUTE, end + 15 * MINUTE);
    if (rechecked.some(v => start < v.end + 15 * MINUTE && end > v.start - 15 * MINUTE)) {
      const { error: cancelError } = await db.from('consultation_bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', bookingId);
      if (cancelError) throw cancelError;
      bookingId = null;
      return json({ error: 'カレンダーに別の予定が入りました。時間を選び直してください' }, 409);
    }

    const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`;
    const createResponse = await fetch(eventUrl, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: 'CS Works オンライン相談',
        description: `CS Works 相談予約\n予約ID: ${bookingId}`,
        start: { dateTime: new Date(start).toISOString(), timeZone: TIMEZONE },
        end: { dateTime: new Date(end).toISOString(), timeZone: TIMEZONE },
        conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      }), cache: 'no-store',
    });
    if (!createResponse.ok) throw new Error(`Google event creation failed (${createResponse.status})`);
    const created = await createResponse.json() as { id?: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] } };
    if (!created.id) throw new Error('Google event ID missing');
    eventId = created.id;
    let meetUrl = created.hangoutLink || created.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri;
    for (let attempt = 0; !meetUrl && attempt < 4; attempt++) {
      const eventResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      if (!eventResponse.ok) throw new Error(`Google conference lookup failed (${eventResponse.status})`);
      const event = await eventResponse.json() as typeof created;
      meetUrl = event.hangoutLink || event.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri;
    }
    if (!meetUrl || !/^https:\/\/meet\.google\.com\//.test(meetUrl)) throw new Error('Google Meet URL was not generated');

    const { data: updated, error: updateError } = await db.from('consultation_bookings').update({
      google_event_id: eventId, google_meet_url: meetUrl, status: 'confirmed', updated_at: new Date().toISOString(),
    }).eq('id', bookingId).eq('status', 'pending').select('id').single();
    if (updateError || !updated) throw updateError || new Error('Booking confirmation update failed');
    const confirmedId = bookingId;
    bookingId = null;
    eventId = null;
    // The booking is already confirmed; notification failures must not roll it back.
    let projectCode: string | null = null;
    if (projectId) {
      const { data: projectInfo } = await db.from('projects').select('project_code').eq('id', projectId).maybeSingle();
      projectCode = projectInfo?.project_code ?? null;
    }
    // Prefer the registered profile; fall back to authentication metadata.
    // Read the profile defensively because older deployments may use different field names.
    let customerName: string | null = null;
    let companyName: string | null = null;
    try {
      const { data: customerProfile, error: customerProfileError } = await db
        .from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (customerProfileError) throw customerProfileError;
      const profile = (customerProfile ?? {}) as Record<string, unknown>;
      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      const firstString = (...values: unknown[]) => values.find(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      ) as string | undefined;
      customerName = firstString(
        profile.full_name, profile.name, profile.display_name, profile.contact_name,
        metadata.full_name, metadata.name, metadata.display_name
      )?.trim() ?? null;
      companyName = firstString(
        profile.company_name, profile.company, metadata.company_name, metadata.company
      )?.trim() ?? null;
    } catch (profileError) {
      console.error('Consultation customer profile lookup failed', {
        bookingId: confirmedId, error: errorText(profileError),
      });
      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      customerName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() || null : null;
      companyName = typeof metadata.company_name === 'string' ? metadata.company_name.trim() || null : null;
    }
    await sendConsultationEmails({
      action: 'confirmed', bookingId: confirmedId,
      customerEmail: user.email, customerName, companyName,
      title: title || 'オンライン相談', startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(), meetUrl, projectCode,
    });
    return json({ bookingId: confirmedId, start: new Date(start).toISOString(), end: new Date(end).toISOString(), meetUrl, status: 'confirmed' }, 201);
  } catch (error) {
    console.error('Consultation booking error:', errorText(error));
    // Avoid a confirmed-looking booking if Google creation failed. Log cleanup failures for manual repair.
    if (eventId && token) {
      try { await removeGoogleEvent(token, calendarId, eventId); eventId = null; }
      catch (cleanupError) { console.error('Google event cleanup requires manual review:', errorText(cleanupError), { bookingId, eventId }); }
    }
    if (bookingId) {
      try {
        const { error: cancelError } = await db.from('consultation_bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', bookingId).eq('status', 'pending');
        if (cancelError) throw cancelError;
      } catch (cleanupError) { console.error('Pending booking cleanup requires manual review:', errorText(cleanupError), { bookingId }); }
    }
    return json({ error: '予約を確定できませんでした。時間をおいて再度お試しください' }, 502);
  }
}
