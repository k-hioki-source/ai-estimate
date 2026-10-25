import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY = 86_400_000;
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

/**
 * Retention scheduler. Safe by default:
 * - warns only when CS_WORKS_RETENTION_SEND_WARNINGS=true
 * - NEVER deletes files (deletion is a separate, future-reviewed feature)
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== 'Bearer ' + secret) {
    return reply({ ok: false, error: 'Unauthorized' }, 401);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return reply({ ok: false, error: 'Supabase configuration missing' }, 500);
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = Date.now();
  const cutoff = new Date(now - 23 * DAY).toISOString();
  const { data: projects, error: projectsError } = await supabase.from('projects')
    .select('id,project_code,status,completed_at')
    .eq('status', 'completed').not('completed_at', 'is', null)
    .lte('completed_at', cutoff).order('completed_at', { ascending: true }).limit(200);
  if (projectsError) return reply({ ok: false, error: 'Project query failed' }, 500);
  const ids = (projects ?? []).map(p => p.id);
  if (!ids.length) return reply({ ok: true, dryRun: true, pendingWarnings: 0, overdue: 0, sent: 0, deletionEnabled: false });
  const [holdsResult, notificationsResult] = await Promise.all([
    supabase.from('project_file_retention_holds').select('project_id,is_held').in('project_id', ids),
    supabase.from('project_file_retention_notifications').select('project_id,completed_at,warned_at').in('project_id', ids),
  ]);
  if (holdsResult.error || notificationsResult.error) {
    console.error('Retention state query failed', holdsResult.error, notificationsResult.error);
    return reply({ ok: false, error: 'Retention SQL migration may be missing' }, 500);
  }
  const holds = new Set((holdsResult.data ?? []).filter(x => x.is_held).map(x => x.project_id));
  const notified = new Set((notificationsResult.data ?? []).filter(x => x.warned_at).map(x => x.project_id + ':' + x.completed_at));
  const pending: { id: string; code: string; completedAt: string; dueAt: string; fileCount: number }[] = [];
  let overdue = 0;
  for (const project of projects ?? []) {
    if (!project.completed_at || holds.has(project.id)) continue;
    const { count, error } = await supabase.from('project_files').select('id', { count: 'exact', head: true })
      .eq('project_id', project.id).in('file_type', ['review', 'revision', 'delivery']);
    if (error) return reply({ ok: false, error: 'File query failed' }, 500);
    if (!count) continue;
    const dueAt = new Date(Date.parse(project.completed_at) + 30 * DAY).toISOString();
    if (Date.parse(dueAt) <= now) overdue++;
    if (notified.has(project.id + ':' + project.completed_at)) continue;
    pending.push({ id: project.id, code: project.project_code, completedAt: project.completed_at, dueAt, fileCount: count });
  }
  const sendEnabled = process.env.CS_WORKS_RETENTION_SEND_WARNINGS === 'true';
  if (!sendEnabled) {
    return reply({ ok: true, dryRun: true, pendingWarnings: pending.length, overdue, sent: 0, deletionEnabled: false,
      preview: pending.slice(0, 20).map(x => ({ code: x.code, dueAt: x.dueAt, fileCount: x.fileCount })) });
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return reply({ ok: false, error: 'RESEND_API_KEY missing' }, 500);
  const resend = new Resend(resendKey);
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const to = process.env.NOTIFY_TO_EMAIL || 'k-hioki@create-support.co.jp';
  let sent = 0;
  let failed = 0;
  for (const item of pending) {
    const result = await resend.emails.send({
      from, to,
      subject: '【CS Works】ファイル保管期限の確認（' + item.code + '）',
      text: '案件 ' + item.code + ' の確認・修正・納品ファイル（' + item.fileCount + '件）は、保管期限の確認対象です。\n' +
        '削除予定日：' + new Date(item.dueAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + '\n' +
        '必要な場合は管理画面から削除保留に設定してください。\n' +
        '※現在、自動削除は無効です。\nhttps://estimate.create-support.co.jp/admin/file-retention',
    });
    if (result.error) { failed++; console.error('Retention email failed', result.error); continue; }
    const { error: markError } = await supabase.from('project_file_retention_notifications').upsert({
      project_id: item.id, completed_at: item.completedAt,
      warned_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' });
    if (markError) { failed++; console.error('Retention warning mark failed', markError); }
    else sent++;
  }
  return reply({ ok: failed === 0, dryRun: false, pendingWarnings: pending.length, overdue, sent, failed, deletionEnabled: false }, failed ? 500 : 200);
}
