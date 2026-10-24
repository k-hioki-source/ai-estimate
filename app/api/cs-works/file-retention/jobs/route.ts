import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
    const { data: profile, error: profileError } = await db.from('profiles').select('role')
      .eq('id', user.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') {
      return respond({ error: '管理者のみ利用できます。' }, 403);
    }
    const { data: jobs, error } = await db.from('project_file_retention_jobs')
      .select('file_id,project_id,status,attempt_count,claimed_at,updated_at,last_error')
      .order('updated_at', { ascending: false }).limit(100);
    if (error) return respond({ error: 'ジョブ管理テーブルを取得できません。SQLの適用を確認してください。' }, 500);
    const targetFileId = '2b3abd29-fd48-416c-8a9d-64882e4798d4';
    const targetProjectId = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
    const targetPath = targetProjectId + '/csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
    const { data: targetFile, error: targetFileError } = await db.from('project_files')
      .select('id,project_id,file_name,storage_path').eq('id', targetFileId).maybeSingle();
    const { data: targetJob, error: targetJobError } = await db.from('project_file_retention_jobs')
      .select('file_id,project_id,status,claim_token').eq('file_id', targetFileId).maybeSingle();
    const { data: targetReferences, error: targetReferencesError } = await db.from('project_files')
      .select('id').eq('storage_path', targetPath).limit(3);
    const targetIdentityMatches = !!targetFile && targetFile.project_id === targetProjectId &&
      targetFile.storage_path === targetPath &&
      targetFile.file_name === targetPath.split('/').pop();
    const targetJobMatches = !!targetJob && targetJob.project_id === targetProjectId &&
      targetJob.status === 'claimed' && !!targetJob.claim_token;
    const targetUniqueReference = !!targetReferences &&
      targetReferences.length === 1 && targetReferences[0].id === targetFileId;
    let targetStorageState = 'not_checked';
    let targetContentMatches = false;
    if (targetIdentityMatches && targetJobMatches && targetUniqueReference) {
      const { data: blob, error: downloadError } = await db.storage.from('project-files').download(targetPath);
      targetStorageState = downloadError || !blob ? 'unavailable' : 'present';
      if (blob && !downloadError) {
        targetContentMatches = (await blob.text()) ===
          'CSW_RECOVERY_STAGE_ONLY:' + targetPath.split('/').pop();
      }
    }
    const { data: stagedShares, error: stagedSharesError } = await db.from('project_file_shares')
      .select('id,revoked_at,expires_at').eq('file_id', targetFileId).limit(100);
    const { data: stagedProject, error: stagedProjectError } = await db.from('projects')
      .select('id,status,completed_at').eq('id', targetProjectId).maybeSingle();
    const { data: stagedHold, error: stagedHoldError } = await db.from('project_file_retention_holds')
      .select('is_held').eq('project_id', targetProjectId).maybeSingle();
    const cleanupReadiness = {
      readOnly: true,
      targetFileId,
      sharesChecked: !stagedSharesError,
      shareCount: stagedShares?.length ?? 0,
      sharesTruncated: (stagedShares?.length ?? 0) === 100,
      activeShares: (stagedShares ?? []).filter(share =>
        !share.revoked_at && Date.parse(share.expires_at) > Date.now()).length,
      projectChecked: !stagedProjectError && !!stagedProject,
      projectStatus: stagedProject?.status ?? null,
      retentionHoldChecked: !stagedHoldError,
      retentionHeld: stagedHold?.is_held === true,
      targetPreflightPassed: !targetFileError && !targetJobError && !targetReferencesError &&
        targetIdentityMatches && targetJobMatches && targetUniqueReference &&
        targetStorageState === 'present' && targetContentMatches,
      readyForManualReview: !stagedSharesError && !stagedProjectError && !stagedHoldError &&
        (stagedShares?.length ?? 0) === 0 && targetIdentityMatches &&
        targetJobMatches && targetUniqueReference && targetStorageState === 'present' &&
        targetContentMatches,
      note: 'これは読み取り専用の後片付け事前確認です。削除の許可・実行ではありません。',
    };
    const stagedRecoveryCheck = {
      fileId: targetFileId, projectId: targetProjectId, path: targetPath,
      dbReadOk: !targetFileError && !targetJobError && !targetReferencesError,
      fileMatches: targetIdentityMatches, jobMatches: targetJobMatches,
      uniqueReference: targetUniqueReference, storageState: targetStorageState,
      contentMatches: targetContentMatches,
      allChecksPassed: !targetFileError && !targetJobError && !targetReferencesError &&
        targetIdentityMatches && targetJobMatches && targetUniqueReference &&
        targetStorageState === 'present' && targetContentMatches,
      readOnly: true,
    };
    const rows = jobs ?? [];
    const recoveryNeeded = rows.filter(row => row.status === 'storage_removed' || row.status === 'failed');
    const recoveryChecks = [];
    for (const job of recoveryNeeded.slice(0, 20)) {
      const { data: file, error: fileError } = await db.from('project_files')
        .select('id,project_id,storage_path').eq('id', job.file_id).maybeSingle();
      let storageState = 'not_checked';
      let recordMatches = false;
      if (fileError) {
        storageState = 'db_lookup_failed';
      } else if (!file) {
        storageState = 'db_record_missing';
      } else {
        recordMatches = file.project_id === job.project_id;
        const path = typeof file.storage_path === 'string' ? file.storage_path : '';
        if (!recordMatches || !path.startsWith(job.project_id + '/') || path.includes('..')) {
          storageState = 'invalid_reference';
        } else {
          const { data: objects, error: storageError } = await db.storage.from('project-files')
            .list(path.slice(0, path.lastIndexOf('/')), {
              search: path.slice(path.lastIndexOf('/') + 1), limit: 1000,
            });
          storageState = storageError ? 'storage_lookup_failed'
            : objects?.some(obj => obj.name === path.slice(path.lastIndexOf('/') + 1))
              ? 'present' : 'not_found_in_listing';
        }
      }
      recoveryChecks.push({
        projectId: job.project_id, fileId: job.file_id, jobStatus: job.status,
        recordMatches, storageState, safeToAutoRecover: false,
      });
    }
    return respond({
      stagedRecoveryCheck,
      cleanupReadiness,
      recoveryChecks, inspectedRecoveryJobs: recoveryChecks.length,
      recoveryChecksLimited: recoveryNeeded.length > 20,
      ok: true, readOnly: true, deletionEnabled: false,
      totalDisplayed: rows.length, truncated: rows.length === 100,
      claimed: rows.filter(row => row.status === 'claimed').length,
      storageRemoved: rows.filter(row => row.status === 'storage_removed').length,
      failed: rows.filter(row => row.status === 'failed').length,
      recoveryNeeded: recoveryNeeded.length,
      recoveryCandidates: recoveryNeeded.map(row => ({ projectId: row.project_id, fileId: row.file_id, status: row.status, lastError: row.last_error })),
      recoveryIsManualOnly: true,
      jobs: rows,
    });
  } catch (error) {
    console.error('Retention job status failed:', error);
    return respond({ error: 'ジョブ状態の確認に失敗しました。' }, 500);
  }
}
