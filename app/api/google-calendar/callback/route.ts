import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { adminClient, appOrigin, encryptToken, redirectUri } from '../../../../lib/google-calendar-auth';

export const runtime = 'nodejs';
function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function GET(request: NextRequest) {
  const destination = new URL('/admin/calendar', appOrigin());
  const done = (result: string) => {
    destination.searchParams.set('google', result);
    const response = NextResponse.redirect(destination);
    response.cookies.set('csworks_google_oauth', '', {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/google-calendar/callback', maxAge: 0,
    });
    return response;
  };
  try {
    const cookie = request.cookies.get('csworks_google_oauth')?.value ?? '';
    const separator = cookie.indexOf(':');
    if (separator < 0) return done('invalid_state');
    const userId = cookie.slice(0, separator);
    const expectedState = cookie.slice(separator + 1);
    const state = request.nextUrl.searchParams.get('state') ?? '';
    if (!safeEqual(expectedState, state)) return done('invalid_state');
    if (request.nextUrl.searchParams.has('error')) return done('cancelled');
    const code = request.nextUrl.searchParams.get('code');
    if (!code) return done('missing_code');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Google credentials missing');
    const exchange = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(), grant_type: 'authorization_code' }),
      cache: 'no-store',
    });
    
if (!exchange.ok) {
  const errorBody = await exchange.json().catch(() => ({}));
  const googleError =
    typeof errorBody.error === 'string'
      ? errorBody.error
      : 'unknown_error';

  console.error('Google token exchange error:', {
    status: exchange.status,
    error: googleError,
  });

  throw new Error(
    `Google token exchange failed: ${exchange.status} (${googleError})`
  );
}

    const tokens = await exchange.json() as { access_token?: string; refresh_token?: string };
    if (!tokens.access_token || !tokens.refresh_token) return done('missing_refresh_token');
    const info = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store',
    });
    if (!info.ok) throw new Error(`Google calendar lookup failed: ${info.status}`);
    const calendar = await info.json() as { id?: string; summary?: string };
    const db = adminClient();
    const { data: profile } = await db.from('profiles').select('role').eq('id', userId).single();
    if (profile?.role !== 'admin') return done('not_admin');
    const { error } = await db.from('google_calendar_connections').upsert({
      user_id: userId,
      google_email: calendar.id ?? null,
      encrypted_refresh_token: encryptToken(tokens.refresh_token),
      calendar_id: 'primary',
      connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
    return done('connected');
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return done('failed');
  }
}
