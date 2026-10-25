import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TEST_PROJECT = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });

/** DB-only fixture representing a file already removed from Storage. No Storage mutation. */
export async function POST(request: NextRequest) {
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
  const { data: project } = await db.from('projects').select('id').eq('id', TEST_PROJECT).maybeSingle();
  if (!project) return reply({ error: 'テスト案件がありません。' }, 404);

  const filename = '_retention_missing_storage_fixture_' + randomUUID() + '.txt';
  const storagePath = TEST_PROJECT + '/' + filename;
  const { data: file, error: fileError } = await db.from('project_files').insert({
    project_id: TEST_PROJECT, uploaded_by: identity.user.id, file_name: filename,
    storage_path: storagePath, mime_type: 'text/plain', file_size: 0, file_type: 'delivery',
  }).select('id').single();
  if (fileError || !file) return reply({ error: 'テスト用DB記録を作成できませんでした。' }, 500);

  const { data: claim, error: claimError } = await db.rpc('claim_project_file_retention_job', {
    p_file_id: file.id, p_project_id: TEST_PROJECT,
  });
  if (claimError || typeof claim !== 'string') {
    await db.from('project_files').delete().eq('id', file.id).eq('project_id', TEST_PROJECT);
    return reply({ error: 'テスト用ジョブを取得できませんでした。' }, 500);
  }
  const { data: updated, error: updateError } = await db.from('project_file_retention_jobs')
    .update({ status: 'storage_removed', updated_at: new Date().toISOString(),
      last_error: '[TEST ONLY] Storage object intentionally never created' })
    .eq('file_id', file.id).eq('project_id', TEST_PROJECT).eq('claim_token', claim)
    .eq('status', 'claimed').select('file_id');
  if (updateError || updated?.length !== 1) {
    await db.from('project_file_retention_jobs').delete().eq('file_id', file.id).eq('project_id', TEST_PROJECT);
    await db.from('project_files').delete().eq('id', file.id).eq('project_id', TEST_PROJECT);
    return reply({ error: 'テスト用ジョブ状態を更新できませんでした。' }, 500);
  }
  return reply({ ok: true, testOnly: true, fileId: file.id, projectId: TEST_PROJECT,
    fixture: 'storage_removed', storageCreated: false, storageDeleted: false,
    existingFilesTouched: 0, automaticDeletionEnabled: false });
}
