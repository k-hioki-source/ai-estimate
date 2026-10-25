import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This endpoint only audits the exact recovery test fixture after Storage removal.
// It does not delete or mutate DB rows, jobs, or Storage objects.
const PROJECT_ID = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const FILE_ID = '2b3abd29-fd48-416c-8a9d-64882e4798d4';
const NAME = 'csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
const PATH = PROJECT_ID + '/' + NAME;
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return reply({ error: '認証が必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
  const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await auth.auth.getUser(header.slice(7).trim());
  if (identityError || !identity.user) return reply({ error: 'ログインし直してください。' }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles')
    .select('role').eq('id', identity.user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') return reply({ error: '管理者のみ利用できます。' }, 403);

  const [file, job, refs, shares, hold] = await Promise.all([
    db.from('project_files').select('id,project_id,file_name,storage_path').eq('id', FILE_ID).maybeSingle(),
    db.from('project_file_retention_jobs').select('file_id,project_id,status,claim_token').eq('file_id', FILE_ID).maybeSingle(),
    db.from('project_files').select('id').eq('storage_path', PATH).limit(2),
    db.from('project_file_shares').select('id').eq('file_id', FILE_ID).limit(1),
    db.from('project_file_retention_holds').select('is_held').eq('project_id', PROJECT_ID).maybeSingle(),
  ]);
  const checks = {
    fileIdentity: !file.error && file.data?.id === FILE_ID &&
      file.data?.project_id === PROJECT_ID && file.data?.file_name === NAME &&
      file.data?.storage_path === PATH,
    jobState: !job.error && job.data?.file_id === FILE_ID &&
      job.data?.project_id === PROJECT_ID && job.data?.status === 'storage_removed' &&
      !!job.data?.claim_token,
    uniqueReference: !refs.error && refs.data?.length === 1 && refs.data[0]?.id === FILE_ID,
    noShares: !shares.error && shares.data?.length === 0,
    holdChecked: !hold.error,
    notHeld: !hold.error && hold.data?.is_held !== true,
    storageAbsent: false,
  };
  if (checks.fileIdentity && checks.jobState && checks.uniqueReference) {
    const { data: objects, error: storageError } = await db.storage.from('project-files')
      .list(PROJECT_ID, { search: NAME, limit: 1000 });
    checks.storageAbsent = !storageError && !!objects &&
      !objects.some(item => item.name === NAME);
  }
  return reply({
    ok: true, fixtureOnly: true, readOnly: true, deletionEnabled: false,
    fileId: FILE_ID, jobStatus: job.data?.status ?? null,
    checks, readyForManualFinalization: Object.values(checks).every(Boolean),
    note: 'Storage削除後の復旧確認専用です。DBとジョブの削除は実行しません。',
  });
}
