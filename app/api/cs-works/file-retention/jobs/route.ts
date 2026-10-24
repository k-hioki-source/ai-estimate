import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const respond = (body: object, status = 200) => NextResponse.json(body, {
    status, headers: { 'Cache-Control': 'no-store, private' },
  });
  try {
    const header = request.headers.get('authorization') ?? '';
    if (!header.startsWith('Bearer ')) return respond({ error: 'ログインが必要です。' }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publicKey || !serviceKey) return respond({ error: 'サーバー設定が不足しています。' }, 500);
    const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: user, error: userError } = await auth.auth.getUser(header.slice(7).trim());
    if (userError || !user.user) return respond({ error: 'ログインし直してください。' }, 401);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await db.from('profiles').select('role')
      .eq('id', user.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') {
      return respond({ error: '管理者のみ利用できます。' }, 403);
    }
    const { data: jobs, error } = await db.from('project_file_retention_jobs')
      .select('file_id,project_id,status,attempt_count,claimed_at,updated_at,last_error')
      .order('updated_at', { ascending: false }).limit(100);
    if (error) return respond({ error: 'ジョブ管理テーブルを取得できません。SQLの適用を確認してください。' }, 500);
    const rows = jobs ?? [];
    return respond({
      ok: true, readOnly: true, deletionEnabled: false,
      totalDisplayed: rows.length, truncated: rows.length === 100,
      claimed: rows.filter(row => row.status === 'claimed').length,
      storageRemoved: rows.filter(row => row.status === 'storage_removed').length,
      failed: rows.filter(row => row.status === 'failed').length,
      jobs: rows,
    });
  } catch (error) {
    console.error('Retention job status failed:', error);
    return respond({ error: 'ジョブ状態の確認に失敗しました。' }, 500);
  }
}
