import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '../../../../lib/google-calendar-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  try {
    const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '');
    if (!bearer) return json({ error: 'ログインが必要です' }, 401);
    const db = adminClient();
    const { data: { user }, error: authError } = await db.auth.getUser(bearer[1]);
    if (authError || !user) return json({ error: 'ログインが必要です' }, 401);
    const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (profileError || profile?.role !== 'admin') return json({ error: '管理者権限が必要です' }, 403);
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { data, error } = await db.from('consultation_bookings')
      .select('id,customer_id,project_id,title,notes,starts_at,ends_at,status,google_meet_url,created_at')
      .gte('starts_at', since).order('starts_at', { ascending: true }).limit(500);
    if (error) throw error;
    const rows = data ?? [];
    const customerIds = [...new Set(rows.map(r => r.customer_id))];
    const profileMap = new Map<string, { company_name: string | null; contact_name: string | null; email: string | null }>();
    if (customerIds.length) {
      const { data: customers, error: customerError } = await db.from('profiles')
        .select('id,company_name,contact_name,email').in('id', customerIds);
      if (customerError) throw customerError;
      for (const c of customers ?? []) profileMap.set(c.id, c);
    }
    const bookings = rows.map(row => ({
      ...row,
      company_name: profileMap.get(row.customer_id)?.company_name ?? null,
      contact_name: profileMap.get(row.customer_id)?.contact_name ?? null,
      customer_email: profileMap.get(row.customer_id)?.email ?? null,
    }));
    return json({ bookings });
  } catch (error) {
    console.error('Admin consultations load failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: '相談予約を取得できませんでした' }, 500);
  }
}
