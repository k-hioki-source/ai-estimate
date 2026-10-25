import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read-only switch inspection. Never changes Storage, database records or environment variables.
export async function GET(request: NextRequest) {
  const response = (body: object, status = 200) =>
    NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  const bearer = request.headers.get('authorization') ?? '';
  if (!bearer.startsWith('Bearer ')) return response({ error: '認証が必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !service) return response({ error: 'サーバー設定が不足しています。' }, 500);
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await auth.auth.getUser(bearer.slice(7).trim());
  if (identityError || !identity.user) return response({ error: 'ログインし直してください。' }, 401);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles')
    .select('role').eq('id', identity.user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') return response({ error: '管理者専用です。' }, 403);
  return response({
    ok: true,
    readOnly: true,
    fixtureOnly: true,
    storageExecutionEnabled: process.env.CSWORKS_ENABLE_TEST_FIXTURE_CLEANUP === 'true',
    finalizationEnabled: process.env.CSWORKS_ENABLE_TEST_FIXTURE_FINALIZE === 'true',
    automaticCustomerDeletionEnabled: false,
  });
}
