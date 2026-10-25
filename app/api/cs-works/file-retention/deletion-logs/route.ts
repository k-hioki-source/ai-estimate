import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const respond = (data: object, status = 200) => NextResponse.json(data, {
    status, headers: { 'Cache-Control': 'no-store, private' },
  });
  try {
    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return respond({ error: 'ログインが必要です。' }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publicKey || !serviceKey) return respond({ error: 'サーバー設定が不足しています。' }, 500);
    const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: identityError } = await authClient.auth.getUser(authorization.slice(7).trim());
    if (identityError || !identity.user) return respond({ error: 'ログインし直してください。' }, 401);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', identity.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') return respond({ error: '管理者のみ利用できます。' }, 403);

    const { data, error } = await db.from('project_file_retention_deletion_logs')
      .select('id,project_id,file_id,outcome,detail,created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (error) {
      console.error('Retention deletion log query failed:', error);
      return respond({ error: '削除履歴テーブルを取得できません。SQLが適用済みか確認してください。' }, 500);
    }
    return respond({ ok: true, rows: data ?? [], maxRows: 50, deletionEnabled: false });
  } catch (error) {
    console.error('Retention deletion logs failed:', error);
    return respond({ error: '削除履歴の取得に失敗しました。' }, 500);
  }
}
