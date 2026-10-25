import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const DAY = 86_400_000;
const MAX_FILES_PER_RUN = 20;
const ELIGIBLE_TYPES = ['review', 'revision', 'delivery'];
// Deliberately hard-disabled pending review of production data and failure recovery.
const ACTUAL_DELETION_ENABLED = false;

const respond = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

/** Cron-authorized retention executor preview. Never modifies Storage or DB. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return respond({ ok: false, error: 'Unauthorized' }, 401);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return respond({ ok: false, error: 'Supabase configuration missing' }, 500);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = Date.now();
  const { data: projects, error: projectsError } = await db.from('projects')
    .select('id,project_code,completed_at,status').eq('status', 'completed')
    .not('completed_at', 'is', null).lte('completed_at', new Date(now - 30 * DAY).toISOString())
    .order('completed_at', { ascending: true }).limit(200);
  if (projectsError) return respond({ ok: false, error: 'Unable to query completed projects' }, 500);
  const ids = (projects ?? []).map(project => project.id);
  if (!ids.length) return respond({ ok: true, dryRun: true, deletionEnabled: false, eligible: [], blocked: [], limit: MAX_FILES_PER_RUN });
  const { data: holds, error: holdsError } = await db.from('project_file_retention_holds')
    .select('project_id,is_held').in('project_id', ids);
  if (holdsError) return respond({ ok: false, error: 'Unable to query retention holds' }, 500);
  const held = new Set((holds ?? []).filter(row => row.is_held).map(row => row.project_id));
  const eligible: { projectCode: string; fileId: string; fileName: string }[] = [];
  const blocked: { projectCode: string; reason: string }[] = [];
  for (const project of projects ?? []) {
    if (held.has(project.id)) { blocked.push({ projectCode: project.project_code, reason: '削除保留' }); continue; }
    const { data: files, error: filesError } = await db.from('project_files')
      .select('id,file_name,file_type,storage_path,created_at').eq('project_id', project.id)
      .in('file_type', ELIGIBLE_TYPES).order('created_at', { ascending: true }).limit(1001);
    if (filesError) return respond({ ok: false, error: 'Unable to query files' }, 500);
    if ((files ?? []).length > 1000) {
      blocked.push({ projectCode: project.project_code, reason: 'ファイル数上限超過' }); continue;
    }
    for (const file of files ?? []) {
      if (eligible.length >= MAX_FILES_PER_RUN) break;
      const path = file.storage_path as string | null;
      if (!path || !path.startsWith(project.id + '/') || path.includes('..') ||
          !file.created_at || !project.completed_at ||
          !Number.isFinite(Date.parse(file.created_at)) ||
          Date.parse(file.created_at) > Date.parse(project.completed_at)) {
        blocked.push({ projectCode: project.project_code, reason: 'パスまたは作成日時の確認が必要' });
        continue;
      }
      const slash = path.lastIndexOf('/');
      const { data: objects, error: storageError } = await db.storage.from('project-files')
        .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1000 });
      if (storageError || !objects?.some(obj => obj.name === path.slice(slash + 1) && obj.id)) {
        blocked.push({ projectCode: project.project_code, reason: 'Storage照合不可' }); continue;
      }
      eligible.push({ projectCode: project.project_code, fileId: file.id, fileName: file.file_name });
    }
    if (eligible.length >= MAX_FILES_PER_RUN) break;
  }
  // Keep the guard visible to reviewers. Enabling deletion requires a separate audited change.
  if (ACTUAL_DELETION_ENABLED) return respond({ ok: false, error: 'Deletion implementation is not approved' }, 503);
  return respond({ ok: true, dryRun: true, deletionEnabled: false,
    eligible, blocked, maxFilesPerRun: MAX_FILES_PER_RUN,
    inspectedProjects: projects?.length ?? 0, projectLimitReached: (projects?.length ?? 0) === 200,
    deletedFiles: 0, changedRows: 0 });
}
