import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROJECT_ID = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const FILE_ID = '2b3abd29-fd48-416c-8a9d-64882e4798d4';
const FILE_NAME = 'csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
const STORAGE_PATH = PROJECT_ID + '/' + FILE_NAME;
const reply = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });

export async function POST(request: NextRequest) {
  const bearer = request.headers.get('authorization') ?? '';
  if (!bearer.startsWith('Bearer ')) return reply({ error: '認証が必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !service) return reply({ error: 'サーバー設定が不足しています。' }, 500);
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: authError } = await auth.auth.getUser(bearer.slice(7).trim());
  if (authError || !identity.user) return reply({ error: '再ログインしてください。' }, 401);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles')
    .select('role').eq('id', identity.user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') return reply({ error: '管理者専用です。' }, 403);

  const [file, job, refs, shares, hold] = await Promise.all([
    db.from('project_files').select('id,project_id,file_name,storage_path').eq('id', FILE_ID).maybeSingle(),
    db.from('project_file_retention_jobs').select('file_id,project_id,status,claim_token').eq('file_id', FILE_ID).maybeSingle(),
    db.from('project_files').select('id').eq('storage_path', STORAGE_PATH).limit(2),
    db.from('project_file_shares').select('id').eq('file_id', FILE_ID).limit(1),
    db.from('project_file_retention_holds').select('is_held').eq('project_id', PROJECT_ID).maybeSingle(),
  ]);
  if (file.error || job.error || refs.error || shares.error || hold.error) {
    return reply({ error: 'DB照合に失敗しました。操作を停止してください。' }, 503);
  }
  const identityMatches = file.data?.id === FILE_ID &&
    file.data?.project_id === PROJECT_ID && file.data?.file_name === FILE_NAME &&
    file.data?.storage_path === STORAGE_PATH;
  const jobStatus = job.data?.status ?? null;
  const jobMatches = job.data?.file_id === FILE_ID &&
    job.data?.project_id === PROJECT_ID && !!job.data?.claim_token;
  const uniqueReference = refs.data?.length === 1 && refs.data[0]?.id === FILE_ID;
  const noShares = shares.data?.length === 0;
  const notHeld = hold.data?.is_held !== true;

  // Download proves presence and validates content. For absence, distinguish a
  // missing object from network/permission failures by checking the Storage list.
  const { data: objects, error: listError } = await db.storage.from('project-files')
    .list(PROJECT_ID, { search: FILE_NAME, limit: 1000 });
  if (listError || !objects) return reply({ error: 'Storage照合に失敗しました。操作を停止してください。' }, 503);
  const storagePresent = objects.some(item => item.name === FILE_NAME);
  let contentMatches = false;
  if (storagePresent) {
    const { data: blob, error: downloadError } = await db.storage.from('project-files').download(STORAGE_PATH);
    if (downloadError || !blob) return reply({ error: 'Storage内容を確認できません。' }, 503);
    contentMatches = (await blob.text()) === 'CSW_RECOVERY_STAGE_ONLY:' + FILE_NAME;
  }
  const safeIdentity = identityMatches && jobMatches && uniqueReference && noShares && notHeld;
  let state: 'before_deletion' | 'storage_removed' | 'interrupted_after_storage' | 'manual_review' = 'manual_review';
  if (safeIdentity && storagePresent && contentMatches && jobStatus === 'claimed') state = 'before_deletion';
  else if (safeIdentity && !storagePresent && jobStatus === 'storage_removed') state = 'storage_removed';
  else if (safeIdentity && !storagePresent && jobStatus === 'claimed') state = 'interrupted_after_storage';
  return reply({
    ok: true, readOnly: true, fixtureOnly: true, deletionEnabled: false,
    state, fileId: FILE_ID, jobStatus, storagePresent, contentMatches,
    checks: { identityMatches, jobMatches, uniqueReference, noShares, notHeld },
    requiresManualReview: state === 'manual_review' || state === 'interrupted_after_storage',
    note: '状態確認のみです。再試行・ジョブ変更・Storage削除は行いません。',
  });
}
