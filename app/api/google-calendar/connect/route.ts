import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { appOrigin, redirectUri, requireAdmin } from '../../../../lib/google-calendar-auth';

export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get('origin') !== appOrigin()) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    const admin = await requireAdmin(request.headers.get('authorization'));
    if (!admin) return NextResponse.json({ error: '管理者認証が必要です' }, { status: 403 });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID is missing');
    const state = randomBytes(32).toString('hex');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    const response = NextResponse.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    response.cookies.set('csworks_google_oauth', `${admin.user.id}:${state}`, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google-calendar/callback', maxAge: 600,
    });
    return response;
  } catch (error) {
    console.error('Google OAuth connect error:', error);
    return NextResponse.json({ error: '接続開始に失敗しました' }, { status: 500 });
  }
}
