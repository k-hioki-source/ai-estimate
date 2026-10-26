import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Isolated one-off test fixture only. Never use this endpoint for customer files.
const PROJECT_ID = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const FILE_ID = '2b3abd29-fd48-416c-8a9d-64882e4798d4';
const NAME = 'csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
const PATH = PROJECT_ID + '/' + NAME;
const CONFIRM = 'DELETE_EXACT_RECOVERY_TEST_FIXTURE';
const respond = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });

export async function POST(request: NextRequest) {
  // Deletion testing has ended. Keep historical code for audit, never execute it.
  const testMutationEnabled = false;
  if (!testMutationEnabled) {
    return NextResponse.json({ error: '削除テスト・テストデータ変更は終了し、無効化されています。' }, {
      status: 403, headers: { 'Cache-Control': 'no-store, private' },
    });
  }

  // Defense in depth: never allow fixture mutation from Production, even if a flag is enabled.
  if (process.env.VERCEL_ENV !== 'preview') {
    return respond({ error: 'テスト用変更APIはPreview環境でのみ実行できます。' }, 403);
  }

  // Deployment flag deliberately defaults to OFF.
  if (process.env.CSWORKS_ENABLE_TEST_FIXTURE_CLEANUP !== 'true') {
    return respond({ error: 'テスト用後片付けは無効です。', enabled: false }, 403);
  }
  const body = await request.json().catch(() => null);
  if (body?.fileId !== FILE_ID || body?.confirmation !== CONFIRM) {
    return respond({ error: '専用テストファイルの確認情報が一致しません。' }, 400);
  }
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return respond({ error: '認証が必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !service) return respond({ error: '環境変数が不足しています。' }, 500);
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await auth.auth.getUser(header.slice(7).trim());
  if (identityError || !identity.user) return respond({ error: 'ログインし直してください。' }, 401);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles')
    .select('role').eq('id', identity.user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') return respond({ error: '管理者専用です。' }, 403);

  const [file, job, refs, shares, hold] = await Promise.all([
    db.from('project_files').select('id,project_id,file_name,storage_path').eq('id', FILE_ID).maybeSingle(),
    db.from('project_file_retention_jobs').select('file_id,project_id,status,claim_token').eq('file_id', FILE_ID).maybeSingle(),
    db.from('project_files').select('id').eq('storage_path', PATH).limit(2),
    db.from('project_file_shares').select('id').eq('file_id', FILE_ID).limit(1),
    db.from('project_file_retention_holds').select('is_held').eq('project_id', PROJECT_ID).maybeSingle(),
  ]);
  if (file.error || job.error || refs.error || shares.error || hold.error ||
      file.data?.id !== FILE_ID || file.data?.project_id !== PROJECT_ID ||
      file.data?.file_name !== NAME || file.data?.storage_path !== PATH ||
      job.data?.project_id !== PROJECT_ID || job.data?.status !== 'claimed' ||
      !job.data?.claim_token || refs.data?.length !== 1 || refs.data[0]?.id !== FILE_ID ||
      shares.data?.length !== 0 || hold.data?.is_held === true) {
    return respond({ error: '実行直前の安全照合に失敗しました。変更していません。' }, 409);
  }
  const { data: blob, error: downloadError } = await db.storage.from('project-files').download(PATH);
  if (downloadError || !blob || (await blob.text()) !== 'CSW_RECOVERY_STAGE_ONLY:' + NAME) {
    return respond({ error: 'テスト専用のStorage内容が一致しません。変更していません。' }, 409);
  }

  // Atomic, durable one-shot latch: primary key allows exactly one request to
  // pass, including when requests reach different Vercel instances concurrently.
  // If the migration is absent, or a previous attempt exists, fail closed.
  // The latch is intentionally never released automatically after any error.
  const { error: latchError } = await db.from('csw_recovery_fixture_execution_locks')
    .insert({ file_id: FILE_ID, project_id: PROJECT_ID, claim_token: job.data.claim_token });
  if (latchError) {
    return respond({
      error: '実行権の取得に失敗しました。重複実行またはDB設定未反映の可能性があるため停止します。',
      requiresManualReview: true,
    }, 409);
  }

  // Storage and Postgres cannot be deleted atomically.
  // Mark the job as storage_removed after the Storage operation so an interrupted
  // cleanup remains visible for manual investigation. Never auto-retry.
  const { error: removeError } = await db.storage.from('project-files').remove([PATH]);
  if (removeError) return respond({ error: 'Storage削除に失敗しました。ジョブを残しています。' }, 500);
  // Storage.remove() succeeding does not by itself prove that the exact object is absent.
  // Fail closed if the listing is unavailable or potentially truncated. Do not advance
  // the job; the separate read-only state diagnostic will classify the partial state.
  const { data: remaining, error: verifyError } = await db.storage.from('project-files')
    .list(PROJECT_ID, { search: NAME, limit: 1000 });
  if (verifyError || !remaining || remaining.length >= 1000 ||
      remaining.some(item => item.name === NAME)) {
    return respond({
      error: 'Storage削除後の不存在を確認できません。ジョブを変更せず、手動調査が必要です。',
      partial: true, requiresManualReview: true,
    }, 503);
  }
  const { data: marked, error: markError } = await db.from('project_file_retention_jobs')
    .update({ status: 'storage_removed' })
    .eq('file_id', FILE_ID).eq('project_id', PROJECT_ID)
    .eq('status', 'claimed').eq('claim_token', job.data.claim_token)
    .select('file_id');
  if (markError || marked?.length !== 1) {
    return respond({ error: 'Storage削除後のジョブ更新に失敗しました。手動復旧が必要です。', partial: true }, 500);
  }
  // Leave the DB record and job for a separately reviewed recovery step.
  // This is intentional: do not silently remove the audit trail.
  return respond({
    ok: true, fixtureOnly: true, storageRemoved: true, databaseRecordPreserved: true,
    jobStatus: 'storage_removed', requiresManualRecovery: true,
    automaticDeletionEnabled: false,
  });
}
