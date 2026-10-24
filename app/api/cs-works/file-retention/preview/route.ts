import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RETENTION_DAYS = 30;
const WARNING_DAYS = 7;
const MS_DAY = 86_400_000;

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

/**
 * Read-only retention preview for CS Works administrators.
 * Does NOT delete files, revoke links, send notifications, or change records.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = request.headers.get('authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'ログインが必要です。' }, 401);
    const token = auth.slice(7).trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publicKey || !serviceKey) return json({ error: 'サーバー設定を確認してください。' }, 500);

    const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData.user) return json({ error: '認証に失敗しました。' }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('role').eq('id', authData.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') {
      return json({ error: '管理者のみ利用できます。' }, 403);
    }

    const now = Date.now();
    const warningCutoff = new Date(now - (RETENTION_DAYS - WARNING_DAYS) * MS_DAY).toISOString();
    const { data: projects, error: projectsError } = await admin.from('projects')
      .select('id,project_code,status,completed_at')
      .eq('status', 'completed').not('completed_at', 'is', null)
      .lte('completed_at', warningCutoff)
      .order('completed_at', { ascending: true }).limit(200);
    if (projectsError) return json({ error: '案件を取得できません。' }, 500);

    const rows = [];
    for (const project of projects ?? []) {
      if (!project.completed_at) continue;
      const { data: files, error: filesError } = await admin.from('project_files')
        .select('id,file_name,file_type,storage_path,created_at')
        .eq('project_id', project.id).in('file_type', ['review', 'revision', 'delivery']);
      if (filesError) return json({ error: 'ファイル一覧を取得できません。' }, 500);
      if (!files?.length) continue;
      const due = new Date(Date.parse(project.completed_at) + RETENTION_DAYS * MS_DAY);
      rows.push({
        projectId: project.id,
        projectCode: project.project_code,
        completedAt: project.completed_at,
        deletionDueAt: due.toISOString(),
        state: due.getTime() <= now ? 'overdue' : 'warning',
        fileCount: files.length,
        files: files.map(f => ({ id: f.id, name: f.file_name, type: f.file_type })),
      });
    }

    return json({
      ok: true, dryRun: true, deletionEnabled: false,
      retentionDays: RETENTION_DAYS, warningDays: WARNING_DAYS,
      inspectedProjectLimit: 200, projects: rows,
    });
  } catch (error) {
    console.error('Retention preview failed:', error);
    return json({ error: '削除予定一覧を取得できません。' }, 500);
  }
}
