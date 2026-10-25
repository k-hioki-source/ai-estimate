import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROJECT = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const FILE = '2b3abd29-fd48-416c-8a9d-64882e4798d4';
const NAME = 'csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
const PATH = PROJECT + '/' + NAME;
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

// Explicitly disabled by default. Never for customer files.
export async function POST(request: NextRequest) {
  // Defense in depth: never allow fixture mutation from Production, even if a flag is enabled.
  if (process.env.VERCEL_ENV !== 'preview') {
    return respond({ error: 'テスト用変更APIはPreview環境でのみ実行できます。' }, 403);
  }

  if (process.env.CSWORKS_ENABLE_TEST_FIXTURE_FINALIZE !== 'true') {
    return reply({ error: 'テスト用最終整理は無効です。' }, 403);
  }
  const body = await request.json().catch(() => null);
  if (body?.fileId !== FILE || body?.confirmation !== 'FINALIZE_EXACT_RECOVERY_TEST_FIXTURE') {
    return reply({ error: '確認情報が一致しません。' }, 400);
  }
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return reply({ error: '認証が必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
  const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: authError } = await auth.auth.getUser(header.slice(7).trim());
  if (authError || !identity.user) return reply({ error: '再ログインしてください。' }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles')
    .select('role').eq('id', identity.user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);

  const [file, job, refs, shares, hold, latch] = await Promise.all([
    db.from('project_files').select('id,project_id,file_name,storage_path').eq('id', FILE).maybeSingle(),
    db.from('project_file_retention_jobs').select('file_id,project_id,status,claim_token').eq('file_id', FILE).maybeSingle(),
    db.from('project_files').select('id').eq('storage_path', PATH).limit(2),
    db.from('project_file_shares').select('id').eq('file_id', FILE).limit(1),
    db.from('project_file_retention_holds').select('is_held').eq('project_id', PROJECT).maybeSingle(),
    db.from('csw_recovery_fixture_execution_locks').select('file_id,project_id,claim_token').eq('file_id', FILE).maybeSingle(),
  ]);
  if (file.error || job.error || refs.error || shares.error || hold.error || latch.error ||
      file.data?.project_id !== PROJECT || file.data?.file_name !== NAME ||
      file.data?.storage_path !== PATH || job.data?.status !== 'storage_removed' ||
      job.data?.project_id !== PROJECT || !job.data?.claim_token ||
      refs.data?.length !== 1 || refs.data[0]?.id !== FILE ||
      shares.data?.length !== 0 || hold.data?.is_held === true ||
      latch.data?.file_id !== FILE || latch.data?.project_id !== PROJECT ||
      latch.data?.claim_token !== job.data.claim_token) {
    return reply({ error: '安全確認に失敗しました。変更していません。' }, 409);
  }
  const { data: objects, error: storageError } = await db.storage.from('project-files')
    .list(PROJECT, { search: NAME, limit: 1000 });
  if (storageError || !objects || objects.length >= 1000 || objects.some(item => item.name === NAME)) {
    return reply({ error: 'Storage削除済みを確認できません。変更していません。' }, 409);
  }
  const { data, error } = await db.rpc('finalize_csw_recovery_test_fixture', {
    p_file_id: FILE, p_claim_token: job.data.claim_token,
  });
  if (error || data !== true) {
    return reply({ error: 'DB最終整理を完了できません。ジョブと記録を確認してください。' }, 500);
  }
  return reply({ ok: true, fixtureOnly: true, finalized: true, automaticDeletionEnabled: false });
}
