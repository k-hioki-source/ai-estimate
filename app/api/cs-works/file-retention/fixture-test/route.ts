import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyRetentionFixtures } from '../../../../../lib/cs-works/retention-fixtures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const reply = (data: object, status = 200) => NextResponse.json(data, {
    status, headers: { 'Cache-Control': 'no-store, private' },
  });
  try {
    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return reply({ error: 'ログインが必要です。' }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publicKey || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
    const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: user, error: authError } = await client.auth.getUser(authorization.slice(7).trim());
    if (authError || !user.user) return reply({ error: 'ログインし直してください。' }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', user.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') return reply({ error: '管理者のみ利用できます。' }, 403);
    const result = verifyRetentionFixtures();
    return reply(result, result.passed ? 200 : 500);
  } catch (error) {
    console.error('Retention fixture verification failed:', error);
    return reply({ error: '模擬テストを実行できませんでした。' }, 500);
  }
}
