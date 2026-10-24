import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TEST_PROJECT_ID = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';

export async function POST(request: NextRequest) {
  const respond = (body: object, status = 200) => NextResponse.json(body, {
    status, headers: { 'Cache-Control': 'no-store, private' },
  });
  try {
    const header = request.headers.get('authorization') ?? '';
    if (!header.startsWith('Bearer ')) return respond({ error: 'ログインが必要です。' }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publicKey || !serviceKey) return respond({ error: 'サーバー設定が不足しています。' }, 500);
    const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: user, error: userError } = await auth.auth.getUser(header.slice(7).trim());
    if (userError || !user.user) return respond({ error: 'ログインし直してください。' }, 401);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await db.from('profiles')
      .select('role').eq('id', user.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') {
      return respond({ error: '管理者のみ利用できます。' }, 403);
    }
    const { data: project, error: projectError } = await db.from('projects')
      .select('id').eq('id', TEST_PROJECT_ID).maybeSingle();
    if (projectError || !project) return respond({ error: 'テスト案件が見つかりません。' }, 404);

    const fileName = '_retention_claim_test_' + randomUUID() + '.txt';
    const path = TEST_PROJECT_ID + '/' + fileName;
    let fileId: string | null = null;
    let firstToken: string | null = null;
    let secondToken: string | null = null;
    let verified = false;
    let cleanupOk = true;
    let errorMessage = '';

    try {
      // A synthetic DB row only; no Storage object is created or removed.
      const { data: file, error: fileError } = await db.from('project_files').insert({
        project_id: TEST_PROJECT_ID,
        uploaded_by: user.user.id,
        file_name: fileName,
        storage_path: path,
        mime_type: 'text/plain',
        file_size: 0,
        file_type: 'delivery',
      }).select('id').single();
      if (fileError || !file) throw new Error('テスト用ファイル記録を作成できませんでした。');
      fileId = file.id;

      // Race two identical claims against the same newly-created file.
      const [first, second] = await Promise.all([
        db.rpc('claim_project_file_retention_job', { p_file_id: fileId, p_project_id: TEST_PROJECT_ID }),
        db.rpc('claim_project_file_retention_job', { p_file_id: fileId, p_project_id: TEST_PROJECT_ID }),
      ]);
      if (first.error || second.error) throw new Error('ジョブ取得処理が失敗しました。');
      firstToken = typeof first.data === 'string' ? first.data : null;
      secondToken = typeof second.data === 'string' ? second.data : null;
      const acquired = Number(!!firstToken) + Number(!!secondToken);
      const { data: jobs, error: jobsError } = await db.from('project_file_retention_jobs')
        .select('file_id,project_id,status').eq('file_id', fileId);
      if (jobsError) throw new Error('ジョブ取得結果を確認できませんでした。');
      verified = acquired === 1 && jobs?.length === 1 &&
        jobs[0].project_id === TEST_PROJECT_ID && jobs[0].status === 'claimed';
      if (!verified) throw new Error('重複実行防止の期待結果と一致しません。');
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'ジョブ取得テストに失敗しました。';
      console.error('Retention claim test failed', error);
    } finally {
      if (fileId) {
        const { error: jobCleanupError } = await db.from('project_file_retention_jobs')
          .delete().eq('file_id', fileId).eq('project_id', TEST_PROJECT_ID);
        const { error: fileCleanupError } = await db.from('project_files')
          .delete().eq('id', fileId).eq('project_id', TEST_PROJECT_ID).eq('storage_path', path);
        cleanupOk = !jobCleanupError && !fileCleanupError;
        if (!cleanupOk) console.error('Retention claim test cleanup failed', jobCleanupError, fileCleanupError);
      }
    }
    const ok = verified && cleanupOk;
    return respond({
      ok, testOnly: true, concurrentAttempts: 2,
      successfulClaims: Number(!!firstToken) + Number(!!secondToken),
      oneClaimOnly: verified, cleanupOk,
      existingFilesTouched: 0, storageFilesDeleted: 0,
      automaticDeletionEnabled: false,
      ...(ok ? {} : { error: errorMessage || 'テストデータの後片付けに失敗しました。' }),
    }, ok ? 200 : 500);
  } catch (error) {
    console.error('Retention claim test setup failed', error);
    return respond({ error: 'ジョブ取得テストを開始できませんでした。' }, 500);
  }
}
