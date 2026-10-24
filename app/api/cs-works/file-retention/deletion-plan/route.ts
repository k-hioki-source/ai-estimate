import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const DAY = 86_400_000;
const BUCKET = 'project-files';
const TYPES = ['review', 'revision', 'delivery'];
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

/** Read-only deletion plan. Never removes objects or DB records. */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return reply({ error: 'ログインが必要です。' }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publicKey || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
    const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: authError } = await auth.auth.getUser(authHeader.slice(7).trim());
    if (authError || !identity.user) return reply({ error: 'ログインし直してください。' }, 401);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', identity.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);

    const now = Date.now();
    const { data: projects, error: projectsError } = await db.from('projects')
      .select('id,project_code,status,completed_at').eq('status', 'completed')
      .not('completed_at', 'is', null).lte('completed_at', new Date(now - 30 * DAY).toISOString())
      .order('completed_at', { ascending: true }).limit(200);
    if (projectsError) return reply({ error: '案件の取得に失敗しました。' }, 500);
    const ids = (projects ?? []).map(p => p.id);
    if (!ids.length) return reply({ ok: true, dryRun: true, deletionEnabled: false, projects: [], inspectedProjects: 0, readyFiles: 0, blockedFiles: 0, heldProjects: 0, truncated: false });
    const { data: holds, error: holdsError } = await db.from('project_file_retention_holds').select('project_id,is_held').in('project_id', ids);
    if (holdsError) return reply({ error: '保留情報の取得に失敗しました。' }, 500);
    const heldIds = new Set((holds ?? []).filter(h => h.is_held).map(h => h.project_id));
    const results: { projectId: string; projectCode: string; state: string; readyFiles: number; blockedFiles: number; details: string[]; candidates: { id: string; name: string; type: string }[] }[] = [];
    let readyFiles = 0, blockedFiles = 0, heldProjects = 0;
    for (const project of projects ?? []) {
      if (!project.completed_at) continue;
      if (heldIds.has(project.id)) { heldProjects++; results.push({ projectId: project.id, projectCode: project.project_code, state: '保留中', readyFiles: 0, blockedFiles: 0, details: [], candidates: [] }); continue; }
      const { data: files, error: filesError } = await db.from('project_files')
        .select('id,file_name,file_type,storage_path,created_at')
        .eq('project_id', project.id).in('file_type', TYPES).limit(1001);
      if (filesError) return reply({ error: '対象ファイルの取得に失敗しました。' }, 500);
      if ((files ?? []).length > 1000) return reply({ error: '1案件のファイル数が上限を超えています。手動確認が必要です。' }, 409);
      let ready = 0, blocked = 0;
      const details: string[] = [];
      const candidates: { id: string; name: string; type: string }[] = [];
      for (const file of files ?? []) {
        const path = file.storage_path as string | null;
        // Reject malformed paths, uploads after completion, and unsupported types.
        if (!path || path.startsWith('/') || path.includes('..') || !TYPES.includes(file.file_type) ||
          !file.created_at || Date.parse(file.created_at) > Date.parse(project.completed_at)) {
          blocked++; details.push(file.file_name + '：要確認（パス・作成日）'); continue;
        }
        const slash = path.lastIndexOf('/');
        const folder = slash >= 0 ? path.slice(0, slash) : '';
        const basename = path.slice(slash + 1);
        // List storage rather than assuming the DB entry proves the object exists.
        const { data: objects, error: storageError } = await db.storage.from(BUCKET).list(folder, { limit: 1000, search: basename });
        if (storageError || !objects?.some(object => object.name === basename && object.id)) {
          blocked++; details.push(file.file_name + '：要確認（Storage照合不可）'); continue;
        }
        const { data: duplicatePaths, error: duplicateError } = await db.from('project_files')
          .select('id').eq('storage_path', path).limit(2);
        if (duplicateError || duplicatePaths?.length !== 1 || duplicatePaths[0].id !== file.id) {
          blocked++; details.push(file.file_name + '：要確認（Storageパスの重複参照）'); continue;
        }
        const { data: shares, error: sharesError } = await db.from('project_file_shares')
          .select('id,revoked_at,expires_at').eq('file_id', file.id).limit(101);
        if (sharesError || !shares || shares.length > 100 ||
            shares.some(share => !share.revoked_at && (!Number.isFinite(Date.parse(share.expires_at)) || Date.parse(share.expires_at) > now))) {
          blocked++; details.push(file.file_name + '：要確認（共有リンク）'); continue;
        }
        candidates.push({ id: file.id, name: file.file_name, type: file.file_type });
        ready++;
      }
      readyFiles += ready; blockedFiles += blocked;
      if (ready || blocked) results.push({ projectId: project.id, projectCode: project.project_code, state: blocked ? '要確認あり' : '照合済み（削除は未実行）', readyFiles: ready, blockedFiles: blocked, details, candidates });
    }
    return reply({ ok: true, dryRun: true, deletionEnabled: false, inspectedProjects: projects?.length ?? 0,
      readyFiles, blockedFiles, heldProjects, truncated: (projects?.length ?? 0) === 200, projects: results });
  } catch (error) {
    console.error('Retention deletion plan error:', error);
    return reply({ error: '削除対象の照合に失敗しました。' }, 500);
  }
}
