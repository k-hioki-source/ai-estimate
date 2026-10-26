import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
  try {
    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return reply({ error: 'ログインが必要です。' }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publicKey || !serviceKey) return reply({ error: 'サーバー設定エラー' }, 500);
    const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(authorization.slice(7).trim());
    if (authError || !authData.user) return reply({ error: '認証に失敗しました。' }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile } = await admin.from('profiles').select('role').eq('id', authData.user.id).maybeSingle();
    if ((profile as { role?: string } | null)?.role !== 'admin') return reply({ error: '管理者のみ操作できます。' }, 403);
    const body = await request.json() as { projectId?: string; held?: boolean };
    if (!body.projectId || typeof body.held !== 'boolean') return reply({ error: '入力内容を確認してください。' }, 400);
    const { data: project } = await admin.from('projects').select('id,status').eq('id', body.projectId).maybeSingle();
    if (!project || project.status !== 'completed') return reply({ error: '完了済み案件のみ設定できます。' }, 409);
    const { error } = await admin.from('project_file_retention_holds').upsert({
      project_id: body.projectId, is_held: body.held,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' });
    if (error) { console.error('Retention hold update failed', error); return reply({ error: '保留設定を保存できません。' }, 500); }
    return reply({ ok: true, held: body.held });
  } catch (error) { console.error('Retention hold error', error); return reply({ error: '保留設定に失敗しました。' }, 500); }
}
