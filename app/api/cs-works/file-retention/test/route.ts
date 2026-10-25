import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const DAY = 86_400_000;
function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

// Administrator-triggered dry run. Does not call the cron route and never sends or deletes.
export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return reply({ error: 'ログインが必要です。' }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publishableKey || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
    const auth = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await auth.auth.getUser(authorization.slice(7).trim());
    if (userError || !userData.user) return reply({ error: 'ログインし直してください。' }, 401);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);

    const now = Date.now();
    const { data: projects, error: projectError } = await db.from('projects')
      .select('id,project_code,completed_at').eq('status', 'completed')
      .not('completed_at', 'is', null)
      .lte('completed_at', new Date(now - 23 * DAY).toISOString())
      .order('completed_at', { ascending: true }).limit(200);
    if (projectError) { console.error('Retention test projects:', projectError); return reply({ error: '案件の取得に失敗しました。' }, 500); }
    const ids = (projects ?? []).map(p => p.id);
    if (!ids.length) return reply({ ok: true, dryRun: true, deletionEnabled: false, emailSent: 0, deletedFiles: 0, checkedProjects: 0, warningProjects: 0, overdueProjects: 0, heldProjects: 0, details: [] });
    const [holdResult, notificationResult] = await Promise.all([
      db.from('project_file_retention_holds').select('project_id,is_held').in('project_id', ids),
      db.from('project_file_retention_notifications').select('project_id,completed_at,warned_at').in('project_id', ids),
    ]);
    if (holdResult.error || notificationResult.error) {
      console.error('Retention test state:', holdResult.error, notificationResult.error);
      return reply({ error: '保留・通知履歴テーブルを確認してください。' }, 500);
    }
    const holds = new Set((holdResult.data ?? []).filter(x => x.is_held).map(x => x.project_id));
    const warned = new Set((notificationResult.data ?? []).filter(x => x.warned_at).map(x => x.project_id + ':' + x.completed_at));
    const details: { projectCode: string; fileCount: number; dueAt: string; state: string }[] = [];
    let warningProjects = 0;
    let overdueProjects = 0;
    let heldProjects = 0;
    for (const project of projects ?? []) {
      if (!project.completed_at) continue;
      const { count, error: fileError } = await db.from('project_files').select('id', { count: 'exact', head: true })
        .eq('project_id', project.id).in('file_type', ['review', 'revision', 'delivery']);
      if (fileError) return reply({ error: 'ファイルの取得に失敗しました。' }, 500);
      if (!count) continue;
      const dueAt = new Date(Date.parse(project.completed_at) + 30 * DAY).toISOString();
      const held = holds.has(project.id);
      const overdue = Date.parse(dueAt) <= now;
      if (held) heldProjects++;
      else if (overdue) overdueProjects++;
      else warningProjects++;
      details.push({ projectCode: project.project_code, fileCount: count, dueAt,
        state: held ? '保留中' : overdue ? '期限超過' : warned.has(project.id + ':' + project.completed_at) ? '通知済み' : '通知予定' });
    }
    return reply({ ok: true, dryRun: true, deletionEnabled: false, emailSent: 0, deletedFiles: 0,
      checkedProjects: details.length, warningProjects, overdueProjects, heldProjects, details });
  } catch (error) {
    console.error('Retention test failed:', error);
    return reply({ error: 'テスト実行に失敗しました。' }, 500);
  }
}
