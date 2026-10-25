import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROJECT_ID = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const FILE_ID = '2b3abd29-fd48-416c-8a9d-64882e4798d4';
const FILE_NAME = 'csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
const STORAGE_PATH = PROJECT_ID + '/' + FILE_NAME;
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

// Dedicated read-only preflight for the exact staged recovery fixture.
// No mutation endpoints are exposed here.
export async function POST(request: NextRequest) {
  const bearer = request.headers.get('authorization') ?? '';
  if (!bearer.startsWith('Bearer ')) return reply({ error: '認証が必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
  const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: authError } = await auth.auth.getUser(bearer.slice(7).trim());
  if (authError || !identity.user) return reply({ error: '再ログインしてください。' }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles')
    .select('role').eq('id', identity.user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') return reply({ error: '管理者のみ利用できます。' }, 403);

  const [fileResult, jobResult, referencesResult, sharesResult, holdResult, lockResult] = await Promise.all([
    db.from('project_files').select('id,project_id,file_name,storage_path').eq('id', FILE_ID).maybeSingle(),
    db.from('project_file_retention_jobs').select('file_id,project_id,status,claim_token').eq('file_id', FILE_ID).maybeSingle(),
    db.from('project_files').select('id').eq('storage_path', STORAGE_PATH).limit(2),
    db.from('project_file_shares').select('id').eq('file_id', FILE_ID).limit(1),
    db.from('project_file_retention_holds').select('is_held').eq('project_id', PROJECT_ID).maybeSingle(),
    db.from('csw_recovery_fixture_execution_locks').select('file_id').eq('file_id', FILE_ID).limit(1),
  ]);
  const checks = {
    fileIdentity: !fileResult.error && fileResult.data?.id === FILE_ID &&
      fileResult.data?.project_id === PROJECT_ID &&
      fileResult.data?.file_name === FILE_NAME &&
      fileResult.data?.storage_path === STORAGE_PATH,
    claimedJob: !jobResult.error && jobResult.data?.file_id === FILE_ID &&
      jobResult.data?.project_id === PROJECT_ID &&
      jobResult.data?.status === 'claimed' && !!jobResult.data?.claim_token,
    uniqueReference: !referencesResult.error && referencesResult.data?.length === 1 &&
      referencesResult.data[0]?.id === FILE_ID,
    noShares: !sharesResult.error && sharesResult.data?.length === 0,
    holdLookup: !holdResult.error,
    notHeld: !holdResult.error && holdResult.data?.is_held !== true,
    executionLockAvailable: !lockResult.error && lockResult.data?.length === 0,
    storageContent: false,
  };
  if (checks.fileIdentity && checks.claimedJob && checks.uniqueReference && checks.noShares && checks.holdLookup) {
    const { data: blob, error } = await db.storage.from('project-files').download(STORAGE_PATH);
    checks.storageContent = !error && !!blob &&
      (await blob.text()) === 'CSW_RECOVERY_STAGE_ONLY:' + FILE_NAME;
  }
  return reply({
    ok: true, readOnly: true, fixtureOnly: true, fileId: FILE_ID,
    checks, readyForManualReview: Object.values(checks).every(Boolean),
    deletionEnabled: false,
    note: '照合のみです。Storage、DB、ジョブ、実行ロックを変更しません。',
  });
}
