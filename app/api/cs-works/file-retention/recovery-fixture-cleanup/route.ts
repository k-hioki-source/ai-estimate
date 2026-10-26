import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TEST_PROJECT = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });

export async function POST(request: NextRequest) {
  // Deletion testing has ended. Keep historical code for audit, never execute it.
  const testMutationEnabled = false;
  if (!testMutationEnabled) {
    return NextResponse.json({ error: '削除テスト・テストデータ変更は終了し、無効化されています。' }, {
      status: 403, headers: { 'Cache-Control': 'no-store, private' },
    });
  }

  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return reply({ error: '認証が必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !service) return reply({ error: '環境変数が不足しています。' }, 500);
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await auth.auth.getUser(header.slice(7).trim());
  if (identityError || !identity.user) return reply({ error: '再ログインしてください。' }, 401);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await db.from('profiles').select('role').eq('id', identity.user.id).maybeSingle();
  if (profile?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);

  const { data: files, error: fileError } = await db.from('project_files')
    .select('id,storage_path,file_name').eq('project_id', TEST_PROJECT)
    .like('file_name', '_retention_missing_storage_fixture_%').limit(100);
  if (fileError) return reply({ error: 'テスト記録を確認できませんでした。' }, 500);
  let removed = 0;
  let skipped = 0;
  for (const file of files ?? []) {
    const expectedPrefix = TEST_PROJECT + '/_retention_missing_storage_fixture_';
    if (!file.storage_path?.startsWith(expectedPrefix) || !file.file_name.startsWith('_retention_missing_storage_fixture_')) {
      skipped++; continue;
    }
    const { data: job, error: jobError } = await db.from('project_file_retention_jobs')
      .select('status,last_error').eq('file_id', file.id).eq('project_id', TEST_PROJECT).maybeSingle();
    if (jobError || job?.status !== 'storage_removed' ||
        !job.last_error?.startsWith('[TEST ONLY] Storage object intentionally never created')) {
      skipped++; continue;
    }
    // Verify no Storage object exists; never remove Storage objects here.
    const { data: objects, error: storageError } = await db.storage.from('project-files')
      .list(TEST_PROJECT, { search: file.file_name, limit: 1000 });
    if (storageError || objects?.some(object => object.name === file.file_name)) { skipped++; continue; }
    const { error: deleteJobError } = await db.from('project_file_retention_jobs')
      .delete().eq('file_id', file.id).eq('project_id', TEST_PROJECT);
    if (deleteJobError) { skipped++; continue; }
    const { data: deleted, error: deleteFileError } = await db.from('project_files')
      .delete().eq('id', file.id).eq('project_id', TEST_PROJECT).eq('storage_path', file.storage_path).select('id');
    if (deleteFileError || deleted?.length !== 1) { skipped++; continue; }
    removed++;
  }
  return reply({ ok: skipped === 0, removed, skipped, storageDeleted: 0,
    automaticDeletionEnabled: false }, skipped === 0 ? 200 : 409);
}
