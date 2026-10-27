import { createHash, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BUCKET = 'project-files';
const DAYS = 7;
const ALLOWED = new Set(['review', 'revision', 'delivery']);
const noStore = { 'Cache-Control': 'no-store, private' };

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !secret) throw new Error('Supabase environment is incomplete');
  return { url, key, secret };
}
function hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
function reply(data: object, status = 200) { return NextResponse.json(data, { status, headers: noStore }); }
function getToken(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}
async function actor(request: NextRequest) {
  const token = getToken(request);
  if (!token) return null;
  const { url, key, secret } = config();
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  return { user: data.user, admin, client };
}
type ShareAdminClient = NonNullable<Awaited<ReturnType<typeof actor>>>['admin'];
async function allowedAccess(admin: ShareAdminClient, userId: string, projectId: string) {
  const { data: project, error } = await admin.from('projects').select('id,user_id').eq('id', projectId).maybeSingle();
  if (error || !project) return false;
  const projectRecord = project as { id: string; user_id: string };
  if (projectRecord.user_id === userId) return true;
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  const profileRecord = profile as { role: string } | null;
  return profileRecord?.role === 'admin';
}
export async function POST(request: NextRequest) {
  try {
    const identity = await actor(request);
    if (!identity) return reply({ error: 'ログインが必要です。' }, 401);
    const body = await request.json() as { fileId?: string; projectId?: string };
    if (!body.fileId || !body.projectId) return reply({ error: 'ファイルが指定されていません。' }, 400);
    const { admin, user } = identity;
    if (!await allowedAccess(admin, user.id, body.projectId)) return reply({ error: 'アクセス権がありません。' }, 403);
    const { data: file, error: fileError } = await admin.from('project_files')
      .select('id,project_id,storage_path,file_type').eq('id', body.fileId).eq('project_id', body.projectId).maybeSingle();
    if (fileError || !file || !ALLOWED.has(file.file_type)) return reply({ error: 'このファイルは共有できません。' }, 400);
    if (file.storage_path.includes('/delivery-final/')) {
      const { data: manifest, error: deliveryError } = await identity.client.rpc('csworks_get_delivery_manifest', { p_project_id: body.projectId });
      if (deliveryError || !manifest?.published || !manifest.assets?.some((asset: { file: { id: string } }) => asset.file.id === file.id)) return reply({ error: '納品済み一覧にあるファイルだけ共有できます。' }, 403);
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + DAYS * 86400_000).toISOString();
    const { data: share, error } = await admin.from('project_file_shares')
      .insert({ file_id: file.id, project_id: body.projectId, token_hash: hash(token), created_by: user.id, expires_at: expiresAt })
      .select('id').single();
    if (error || !share) { console.error('Share creation failed:', error); return reply({ error: '共有リンクを作成できません。SQL設定をご確認ください。' }, 500); }
    const origin = new URL(request.url).origin;
    return reply({ id: share.id, url: origin + '/api/cs-works/file-share/' + token, expiresAt });
  } catch (error) { console.error('Share creation error', error); return reply({ error: '共有リンクを作成できません。' }, 500); }
}
export async function DELETE(request: NextRequest) {
  try {
    const identity = await actor(request);
    if (!identity) return reply({ error: 'ログインが必要です。' }, 401);
    const body = await request.json() as { shareId?: string; projectId?: string };
    if (!body.shareId || !body.projectId) return reply({ error: '共有情報が不足しています。' }, 400);
    const { admin, user } = identity;
    if (!await allowedAccess(admin, user.id, body.projectId)) return reply({ error: 'アクセス権がありません。' }, 403);
    const { data, error } = await admin.from('project_file_shares').update({ revoked_at: new Date().toISOString() })
      .eq('id', body.shareId).eq('project_id', body.projectId).is('revoked_at', null).select('id');
    if (error) return reply({ error: '共有リンクを無効化できません。' }, 500);
    return reply({ ok: true, revoked: (data?.length ?? 0) > 0 });
  } catch (error) { console.error('Share revoke error', error); return reply({ error: '共有リンクを無効化できません。' }, 500); }
}

export async function GET(request: NextRequest) {
  try {
    const identity = await actor(request);
    if (!identity) return reply({ error: 'ログインが必要です。' }, 401);
    const projectId = new URL(request.url).searchParams.get('projectId');
    const fileId = new URL(request.url).searchParams.get('fileId');
    if (!projectId || !fileId) return reply({ error: '対象が指定されていません。' }, 400);
    const { admin, user } = identity;
    if (!await allowedAccess(admin, user.id, projectId)) return reply({ error: 'アクセス権がありません。' }, 403);
    const { data, error } = await admin.from('project_file_shares')
      .select('id,expires_at,created_at').eq('project_id', projectId).eq('file_id', fileId)
      .is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(30);
    if (error) return reply({ error: '共有履歴を取得できません。' }, 500);
    return reply({ shares: data ?? [] });
  } catch (error) { console.error('Share list error', error); return reply({ error: '共有履歴を取得できません。' }, 500); }
}
