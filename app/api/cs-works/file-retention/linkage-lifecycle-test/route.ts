import { createHash, randomBytes, randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TEST_PROJECT_ID = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const reply = (data: object, status = 200) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

/**
 * Creates a unique, unmistakably synthetic file inside ONE approved test project.
 * Tests share revocation, Storage removal and DB cascade, then cleans up.
 * Never deletes the project or any pre-existing project file.
 */
export async function POST(request: NextRequest) {
  const bearer = request.headers.get('authorization') ?? '';
  if (!bearer.startsWith('Bearer ')) return reply({ error: 'ログインが必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
  const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: authError } = await authClient.auth.getUser(bearer.slice(7).trim());
  if (authError || !identity.user) return reply({ error: 'ログインし直してください。' }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', identity.user.id).maybeSingle();
  if (profileError || (profile as { role?: string } | null)?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);
  const { data: project, error: projectError } = await db.from('projects').select('id').eq('id', TEST_PROJECT_ID).maybeSingle();
  if (projectError || !project) return reply({ error: '指定されたテスト案件が見つかりません。' }, 404);

  const unique = randomUUID();
  const path = TEST_PROJECT_ID + '/_retention_link_test_' + unique + '.txt';
  const fileName = '_retention_link_test_' + unique + '.txt';
  const bucket = db.storage.from('project-files');
  const tokenHash = createHash('sha256').update(randomBytes(32)).digest('hex');
  let fileId: string | null = null;
  let shareId: string | null = null;
  let storageCreated = false;
  let storageRemoved = false;
  let shareRevoked = false;
  let fileRowDeleted = false;
  let shareCascadeVerified = false;
  let errorMessage = '';
  let auditLogged = false;
  let auditError = '';

  try {
    const { error: uploadError } = await bucket.upload(path, new TextEncoder().encode('RETENTION_LINK_TEST_' + unique), {
      contentType: 'text/plain', upsert: false,
    });
    if (uploadError) throw new Error('専用テストファイルを作成できませんでした。');
    storageCreated = true;

    const { data: file, error: fileError } = await db.from('project_files').insert({
      project_id: TEST_PROJECT_ID, uploaded_by: identity.user.id, file_name: fileName,
      storage_path: path, mime_type: 'text/plain', file_size: 56, file_type: 'delivery',
    }).select('id').single();
    if (fileError || !file) throw new Error('テスト用ファイル記録を作成できませんでした。');
    fileId = file.id;

    const { data: share, error: shareError } = await db.from('project_file_shares').insert({
      file_id: fileId, project_id: TEST_PROJECT_ID, token_hash: tokenHash,
      created_by: identity.user.id, expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }).select('id').single();
    if (shareError || !share) throw new Error('テスト用共有リンク記録を作成できませんでした。');
    shareId = share.id;

    const { data: revoked, error: revokeError } = await db.from('project_file_shares')
      .update({ revoked_at: new Date().toISOString() }).eq('id', shareId).eq('file_id', fileId)
      .is('revoked_at', null).select('id,revoked_at');
    if (revokeError || revoked?.length !== 1 || !revoked[0].revoked_at) {
      throw new Error('共有リンクの無効化を確認できませんでした。');
    }
    shareRevoked = true;

    const { error: removeError } = await bucket.remove([path]);
    if (removeError) throw new Error('Storage削除に失敗しました。');
    const { error: missingError } = await bucket.download(path);
    if (!missingError) throw new Error('Storage削除後も取得できました。');
    storageRemoved = true;

    const { data: deleted, error: deleteError } = await db.from('project_files')
      .delete().eq('id', fileId).eq('project_id', TEST_PROJECT_ID).eq('storage_path', path).select('id');
    if (deleteError || deleted?.length !== 1) throw new Error('テスト用DBファイル記録を削除できませんでした。');
    fileRowDeleted = true;

    const { data: remaining, error: remainingError } = await db.from('project_file_shares')
      .select('id').eq('id', shareId);
    if (remainingError) throw new Error('共有履歴の最終確認に失敗しました。');
    shareCascadeVerified = remaining?.length === 0;
    if (!shareCascadeVerified) throw new Error('共有履歴が残っています。');
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : '連動テストに失敗しました。';
    console.error('Retention linkage lifecycle test failed:', error);
  } finally {
    // Only cleanup the exact random records created by this request.
    if (shareId && !shareCascadeVerified) {
      const { error } = await db.from('project_file_shares').delete().eq('id', shareId).eq('project_id', TEST_PROJECT_ID);
      if (error) console.error('Retention test share cleanup failed:', error);
    }
    if (fileId && !fileRowDeleted) {
      const { error } = await db.from('project_files').delete()
        .eq('id', fileId).eq('project_id', TEST_PROJECT_ID).eq('storage_path', path);
      if (error) console.error('Retention test DB cleanup failed:', error);
    }
    if (storageCreated && !storageRemoved) {
      const { error } = await bucket.remove([path]);
      if (error) console.error('Retention test Storage cleanup failed:', error);
    }
  }

  const deletionSucceeded = storageCreated && shareRevoked && storageRemoved && fileRowDeleted && shareCascadeVerified;
  // Persist a durable audit record only for a synthetic file created by this request.
  // A failed log write is surfaced as a failed test, not a false success.
  if (fileId) {
    const { error: logError } = await db.from('project_file_retention_deletion_logs').insert({
      project_id: TEST_PROJECT_ID,
      file_id: fileId,
      storage_path: path,
      outcome: deletionSucceeded ? 'deleted' : 'failed',
      detail: deletionSucceeded
        ? '[TEST ONLY] Synthetic file lifecycle verified; not an automatic deletion.'
        : '[TEST ONLY] Synthetic lifecycle failed: ' + (errorMessage || 'Unknown error'),
    });
    if (logError) {
      auditError = '削除履歴の保存に失敗しました。SQLテーブルと権限を確認してください。';
      console.error('Retention lifecycle audit insert failed:', logError);
    } else {
      auditLogged = true;
    }
  } else {
    auditError = 'ファイル記録を作成できず、履歴の記録対象がありません。';
  }
  const ok = deletionSucceeded && auditLogged;
  return reply({
    ok, testOnly: true, projectId: TEST_PROJECT_ID,
    shareRevoked, storageRemoved, fileRowDeleted, shareCascadeVerified,
    existingFilesTouched: 0, automaticDeletionEnabled: false,
    auditLogged,
    ...(ok ? {} : { error: auditError || errorMessage || '連動テストに失敗しました。' }),
  }, ok ? 200 : 500);
}
