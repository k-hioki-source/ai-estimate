import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PROJECT_ID = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const respond = (data: object, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store, private' } });

/** DB-only recovery state test; never touches Storage or pre-existing file records. */
export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return respond({ error: 'ログインが必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return respond({ error: 'サーバー設定が不足しています。' }, 500);
  const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await auth.auth.getUser(header.slice(7).trim());
  if (identityError || !identity.user) return respond({ error: 'ログインし直してください。' }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', identity.user.id).maybeSingle();
  if (profileError || (profile as { role?: string } | null)?.role !== 'admin') return respond({ error: '管理者のみ利用できます。' }, 403);
  const { data: project, error: projectError } = await db.from('projects').select('id').eq('id', PROJECT_ID).maybeSingle();
  if (projectError || !project) return respond({ error: 'テスト案件が見つかりません。' }, 404);

  const name = '_retention_recovery_test_' + randomUUID() + '.txt';
  const path = PROJECT_ID + '/' + name;
  let fileId: string | null = null;
  let claimed = false;
  let markedFailed = false;
  let retryBlocked = false;
  let storageRemovedState = false;
  let recordDeleted = false;
  let cleaned = false;
  let message = '';
  try {
    const { data: file, error: insertError } = await db.from('project_files').insert({
      project_id: PROJECT_ID, uploaded_by: identity.user.id, file_name: name,
      storage_path: path, mime_type: 'text/plain', file_size: 0, file_type: 'delivery',
    }).select('id').single();
    if (insertError || !file) throw new Error('テストDB記録の作成に失敗しました。');
    fileId = file.id;
    const { data: claim, error: claimError } = await db.rpc('claim_project_file_retention_job', {
      p_file_id: fileId, p_project_id: PROJECT_ID,
    });
    if (claimError || typeof claim !== 'string') throw new Error('ジョブ取得に失敗しました。');
    claimed = true;
    const { data: failed, error: failError } = await db.from('project_file_retention_jobs')
      .update({ status: 'failed', last_error: '[TEST ONLY] Simulated DB failure', updated_at: new Date().toISOString() })
      .eq('file_id', fileId).eq('project_id', PROJECT_ID).eq('claim_token', claim)
      .eq('status', 'claimed').select('file_id');
    if (failError || failed?.length !== 1) throw new Error('失敗状態への遷移に失敗しました。');
    markedFailed = true;

    const { data: second, error: secondError } = await db.rpc('claim_project_file_retention_job', {
      p_file_id: fileId, p_project_id: PROJECT_ID,
    });
    if (secondError) throw new Error('再取得防止の検査に失敗しました。');
    retryBlocked = second === null;
    if (!retryBlocked) throw new Error('失敗ジョブを二重取得できてしまいました。');

    // This is a STATE SIMULATION, not a real Storage removal.
    const { data: moved, error: moveError } = await db.from('project_file_retention_jobs')
      .update({ status: 'storage_removed', last_error: null, updated_at: new Date().toISOString() })
      .eq('file_id', fileId).eq('project_id', PROJECT_ID).eq('claim_token', claim)
      .eq('status', 'failed').select('file_id');
    if (moveError || moved?.length !== 1) throw new Error('復旧状態への遷移に失敗しました。');
    storageRemovedState = true;

    const { data: deleted, error: deleteError } = await db.from('project_files')
      .delete().eq('id', fileId).eq('project_id', PROJECT_ID).eq('storage_path', path).select('id');
    if (deleteError || deleted?.length !== 1) throw new Error('テストDB記録の削除に失敗しました。');
    recordDeleted = true;
    const { data: remaining, error: remainingError } = await db.from('project_file_retention_jobs')
      .select('file_id').eq('file_id', fileId);
    if (remainingError || (remaining?.length ?? 0) !== 0) throw new Error('ジョブの連動削除を確認できませんでした。');
  } catch (error) {
    message = error instanceof Error ? error.message : '復旧状態テストに失敗しました。';
    console.error('Retention recovery state test failed:', error);
  } finally {
    if (fileId) {
      const { error: jobCleanupError } = await db.from('project_file_retention_jobs')
        .delete().eq('file_id', fileId).eq('project_id', PROJECT_ID);
      const { error: fileCleanupError } = await db.from('project_files')
        .delete().eq('id', fileId).eq('project_id', PROJECT_ID).eq('storage_path', path);
      cleaned = !jobCleanupError && !fileCleanupError;
      if (!cleaned) console.error('Retention recovery state cleanup failed', jobCleanupError, fileCleanupError);
    }
  }
  const ok = claimed && markedFailed && retryBlocked && storageRemovedState && recordDeleted && cleaned;
  return respond({ ok, testOnly: true, stateSimulationOnly: true, claimed, markedFailed, retryBlocked,
    storageRemovedState, recordDeleted, cleaned, storageOperations: 0, existingFilesTouched: 0,
    automaticDeletionEnabled: false, ...(ok ? {} : { error: message || 'テストデータの後片付けに失敗しました。' }) }, ok ? 200 : 500);
}
