import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/google-calendar-auth';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request.headers.get('authorization'));
    if (!admin) return NextResponse.json({ error: '管理者認証が必要です' }, { status: 403 });
    const { data, error } = await admin.db.from('google_calendar_connections')
      .select('google_email, connected_at').eq('user_id', admin.user.id).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ connected: !!data, googleEmail: data?.google_email ?? null, connectedAt: data?.connected_at ?? null });
  } catch (error) {
    console.error('Google Calendar status error:', error);
    return NextResponse.json({ error: '接続状態を取得できません' }, { status: 500 });
  }
}
