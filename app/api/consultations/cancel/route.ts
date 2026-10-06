import { NextRequest, NextResponse } from 'next/server';
import { adminClient, decryptToken } from '../../../../lib/google-calendar-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!bearer) return json({ error: 'ログインが必要です' }, 401);
    const db = adminClient();
    const { data: { user }, error: authError } = await db.auth.getUser(bearer[1]);
    if (authError || !user) return json({ error: 'ログインが必要です' }, 401);

    let payload: { bookingId?: unknown };
    try { payload = await request.json() as { bookingId?: unknown }; }
    catch { return json({ error: '送信データが不正です' }, 400); }
    if (typeof payload.bookingId !== 'string' || !UUID.test(payload.bookingId)) {
      return json({ error: '予約IDが不正です' }, 400);
    }

    const { data: profile, error: profileError } = await db.from('profiles')
      .select('role').eq('id', user.id).maybeSingle();
    if (profileError) throw profileError;
    const isAdmin = profile?.role === 'admin';

    const { data: booking, error: bookingError } = await db.from('consultation_bookings')
      .select('id,customer_id,staff_id,starts_at,status,google_event_id')
      .eq('id', payload.bookingId).maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking || (!isAdmin && booking.customer_id !== user.id)) {
      return json({ error: '予約が見つかりません' }, 404);
    }
    if (booking.status === 'cancelled') return json({ bookingId: booking.id, status: 'cancelled', alreadyCancelled: true });
    if (booking.status !== 'confirmed') return json({ error: 'この予約はキャンセルできません' }, 409);
    if (!isAdmin && Date.parse(booking.starts_at) - Date.now() < 24 * 60 * 60 * 1000) {
      return json({ error: '開始24時間以内のキャンセルは運営にお問い合わせください' }, 403);
    }
    if (!isAdmin && Date.parse(booking.starts_at) <= Date.now()) {
      return json({ error: '開始済みの予約はキャンセルできません' }, 403);
    }

    // Use the exact staff connection, not an arbitrary administrator's calendar.
    const { data: connection, error: connectionError } = await db.from('google_calendar_connections')
      .select('encrypted_refresh_token,calendar_id').eq('user_id', booking.staff_id).maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection?.encrypted_refresh_token) return json({ error: 'Googleカレンダー連携が見つかりません。運営へご連絡ください' }, 503);
    if (!booking.google_event_id) return json({ error: 'Google予定IDがありません。運営へご連絡ください' }, 409);

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Google credentials missing');
    const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
        refresh_token: decryptToken(connection.encrypted_refresh_token), grant_type: 'refresh_token' }), cache: 'no-store',
    });
    if (!refreshResponse.ok) {
      console.error('Consultation cancel Google refresh failed:', refreshResponse.status);
      return json({ error: 'Googleカレンダーに接続できません。時間をおいて再度お試しください' }, 502);
    }
    const tokens = await refreshResponse.json() as { access_token?: string };
    if (!tokens.access_token) return json({ error: 'Google認証に失敗しました' }, 502);

    const calendarId = connection.calendar_id || 'primary';
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(booking.google_event_id)}`;
    const deleteResponse = await fetch(url, {
      method: 'DELETE', headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store',
    });
    if (!deleteResponse.ok && deleteResponse.status !== 404 && deleteResponse.status !== 410) {
      console.error('Consultation cancel Google deletion failed:', deleteResponse.status, { bookingId: booking.id });
      return json({ error: 'Googleカレンダーの予定を削除できませんでした。予約は維持されています' }, 502);
    }

    const { data: updated, error: updateError } = await db.from('consultation_bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', booking.id).eq('status', 'confirmed').select('id').maybeSingle();
    if (updateError || !updated) {
      console.error('Consultation cancel DB update needs manual reconciliation:', updateError?.message, { bookingId: booking.id });
      return json({ error: 'Googleの予定は削除されましたが、予約履歴の更新に失敗しました。運営にお問い合わせください' }, 503);
    }
    return json({ bookingId: booking.id, status: 'cancelled' });
  } catch (error) {
    console.error('Consultation cancellation error:', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'キャンセル処理に失敗しました。時間をおいて再度お試しください' }, 500);
  }
}
