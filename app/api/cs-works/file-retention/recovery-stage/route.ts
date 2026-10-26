import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TEST_PROJECT = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

// Create an isolated fixture for a later interruption/recovery test.
// Does not delete any Storage objects or existing DB rows.
export async function POST(request: NextRequest) {
  // Deletion testing has ended. Keep historical code for audit, never execute it.
  const testMutationEnabled = false;
  if (!testMutationEnabled) {
    return NextResponse.json({ error: '削除テスト・テストデータ変更は終了し、無効化されています。' }, {
      status: 403, headers: { 'Cache-Control': 'no-store, private' },
    });
  }

  const bearer = request.headers.get('authorization') ?? '';
  if (!bearer.startsWith('Bearer ')) return reply({ error: 'ログインが必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
  const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: authError } = await auth.auth.getUser(bearer.slice(7).trim());
  if (authError || !identity.user) return reply({ error: '再ログインしてください。' }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', identity.user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);
  const { data: project, error: projectError } = await db.from('projects').select('id').eq('id', TEST_PROJECT).maybeSingle();
  if (projectError || !project) return reply({ error: 'テスト案件が見つかりません。' }, 404);

  // Avoid accumulating unfinished fixtures on repeated clicks.
  const { data: existing, error: existingError } = await db.from('project_files')
    .select('id').eq('project_id', TEST_PROJECT)
    .like('file_name', 'csw_recovery_stage_%').limit(1);
  if (existingError) return reply({ error: '既存テスト記録の確認に失敗しました。' }, 500);
  if (existing?.length) return reply({ error: '未完了の復旧テストがあります。先に後片付けしてください。' }, 409);

  const name = 'csw_recovery_stage_' + randomUUID() + '.txt';
  const path = TEST_PROJECT + '/' + name;
  const storage = db.storage.from('project-files');
  let uploaded = false;
  let fileId: string | null = null;
  try {
    const { error: uploadError } = await storage.upload(path,
      new TextEncoder().encode('CSW_RECOVERY_STAGE_ONLY:' + name),
      { contentType: 'text/plain', upsert: false });
    if (uploadError) throw new Error('テストファイルの作成に失敗しました。');
    uploaded = true;
    const { data: file, error: fileError } = await db.from('project_files').insert({
      project_id: TEST_PROJECT, uploaded_by: identity.user.id, file_name: name,
      storage_path: path, mime_type: 'text/plain', file_size: name.length + 24, file_type: 'delivery',
    }).select('id').single();
    if (fileError || !file) throw new Error('テスト用DB記録の作成に失敗しました。');
    fileId = file.id;
    const { data: claim, error: claimError } = await db.rpc('claim_project_file_retention_job', {
      p_file_id: fileId, p_project_id: TEST_PROJECT,
    });
    if (claimError || typeof claim !== 'string') throw new Error('テストジョブの取得に失敗しました。');
    return reply({ ok: true, testOnly: true, projectId: TEST_PROJECT, fileId,
      storagePath: path, storageCreated: true, dbRecordCreated: true,
      jobClaimed: true, storageDeleted: false, automaticDeletionEnabled: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'テストの準備に失敗しました。';
    if (fileId) {
      await db.from('project_file_retention_jobs').delete().eq('file_id', fileId).eq('project_id', TEST_PROJECT);
      await db.from('project_files').delete().eq('id', fileId).eq('project_id', TEST_PROJECT).eq('storage_path', path);
    }
    if (uploaded) await storage.remove([path]);
    return reply({ error: message }, 500);
  }
}
