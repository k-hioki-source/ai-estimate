import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const DAY = 86_400_000;
const TYPES = ['review', 'revision', 'delivery'];
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

/** Read-only, single-file preflight. Never deletes or changes data. */
export async function POST(request: NextRequest) {
  try {
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
    if (profileError || profile?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);

    const input = await request.json().catch(() => null);
    const fileId = input?.fileId;
    if (typeof fileId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(fileId)) {
      return reply({ error: '正しいファイルIDを指定してください。' }, 400);
    }
    const reasons: string[] = [];
    const { data: file, error: fileError } = await db.from('project_files')
      .select('id,project_id,file_name,file_type,storage_path,created_at').eq('id', fileId).maybeSingle();
    if (fileError || !file) return reply({ ok: false, eligible: false, reasons: ['ファイル記録を確認できません。'], readOnly: true });
    const { data: project, error: projectError } = await db.from('projects')
      .select('id,project_code,status,completed_at').eq('id', file.project_id).maybeSingle();
    const { data: hold, error: holdError } = await db.from('project_file_retention_holds')
      .select('is_held').eq('project_id', file.project_id).maybeSingle();
    if (projectError || !project || project.status !== 'completed' || !project.completed_at ||
        !Number.isFinite(Date.parse(project.completed_at)) ||
        Date.parse(project.completed_at) + 30 * DAY > Date.now()) reasons.push('案件の完了日・30日経過を確認できません。');
    if (holdError || hold?.is_held === true) reasons.push('保留中、または保留情報を確認できません。');
    if (!TYPES.includes(file.file_type)) reasons.push('削除対象外のファイル種類です。');
    if (!file.created_at || !project?.completed_at ||
        !Number.isFinite(Date.parse(file.created_at)) ||
        Date.parse(file.created_at) > Date.parse(project.completed_at)) reasons.push('アップロード日時を確認できません。');
    const path = file.storage_path;
    const validPath = typeof path === 'string' && path.startsWith(file.project_id + '/') &&
      !path.includes('..') && !path.includes('\\') && path.split('/').every(Boolean);
    if (!validPath) reasons.push('Storageパスが不正です。');
    if (validPath) {
      const { data: refs, error: refsError } = await db.from('project_files')
        .select('id').eq('storage_path', path).limit(2);
      if (refsError || refs?.length !== 1 || refs[0].id !== file.id) reasons.push('Storageパスの参照が一意ではありません。');
      const { data: blob, error: storageError } = await db.storage.from('project-files').download(path);
      if (storageError || !blob) reasons.push('Storageファイルの存在を確認できません。');
    }
    const { data: shares, error: sharesError } = await db.from('project_file_shares')
      .select('id,revoked_at,expires_at').eq('file_id', file.id).limit(101);
    if (sharesError || !shares || shares.length > 100 ||
        shares.some(share => !share.revoked_at && (!Number.isFinite(Date.parse(share.expires_at)) ||
          Date.parse(share.expires_at) > Date.now()))) reasons.push('共有リンクの状態を確認してください。');
    const { data: job, error: jobError } = await db.from('project_file_retention_jobs')
      .select('status').eq('file_id', file.id).maybeSingle();
    if (jobError || job) reasons.push('既存の削除ジョブがあるため手動確認が必要です。');
    return reply({ ok: true, readOnly: true, deletionEnabled: false, eligible: reasons.length === 0,
      fileId: file.id, fileName: file.file_name, projectCode: project?.project_code ?? null, reasons,
      note: '事前照合結果です。削除許可を保証するものではなく、実行時には再照合が必要です。' });
  } catch (error) {
    console.error('Retention manual preflight failed:', error);
    return reply({ error: '事前照合に失敗しました。' }, 500);
  }
}
