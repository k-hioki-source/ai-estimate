import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { illustrationDeliveryEnabled } from '../../../../lib/cs-works/delivery';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
function failure(e: { code?: string }) { return e.code === '42501' ? reply({ error: 'この納品ファイルを操作する権限がありません。' }, 403) : ['40001','23505'].includes(e.code || '') ? reply({ error: '納品状態が変わりました。最新の一覧を取得してください。' }, 409) : e.code === '22023' ? reply({ error: '対象のイラストとファイルを確認してください。' }, 400) : reply({ error: '納品一覧を取得できません。時間をおいて再試行するか、管理者へお問い合わせください。' }, 503); }
async function actor(req: NextRequest) {
 const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]; if (!token) return null;
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; if (!url || !key) throw Error('Configuration');
 const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
 const { data, error } = await db.auth.getUser(token); return !error && data.user ? db : null;
}
export async function GET(req: NextRequest) {
 if (!illustrationDeliveryEnabled) return reply({ error: 'Not found' }, 404);
 try { const db = await actor(req); if (!db) return reply({ error: 'ログインが必要です。' }, 401); const pid = req.nextUrl.searchParams.get('projectId'); if (!uuid(pid)) return reply({ error: '案件を指定してください。' }, 400); const { data, error } = await db.rpc('csworks_get_delivery_manifest', { p_project_id: pid }); return error ? failure(error) : reply(data); } catch { return failure({}); }
}
export async function POST(req: NextRequest) {
 if (!illustrationDeliveryEnabled) return reply({ error: 'Not found' }, 404);
 try {
  const db = await actor(req); if (!db) return reply({ error: 'ログインが必要です。' }, 401);
  const reader = req.body?.getReader(); if (!reader) return reply({ error: '入力がありません。' }, 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 10000) { await reader.cancel(); return reply({ error: '入力が大きすぎます。' }, 413); } chunks.push(value); }
  let b; try { b = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply({ error: '入力形式が不正です。' }, 400); }
  if (!b || !uuid(b.projectId)) return reply({ error: '案件を指定してください。' }, 400);
  let name: string, args: Record<string, unknown> = { p_project_id: b.projectId };
  if (b.action === 'attach') {
   if (!uuid(b.requestId) || (b.illustrationId !== null && !uuid(b.illustrationId)) || typeof b.name !== 'string' || !b.name.trim() || b.name.length > 255 || /[\x00-\x1f\x7f]/.test(b.name) || typeof b.path !== 'string' || b.path !== `${b.projectId}/delivery-final/${b.requestId}` || typeof b.mime !== 'string' || !b.mime || b.mime.length > 150 || !Number.isSafeInteger(b.size) || b.size < 1 || b.size > 52428800) return reply({ error: '50MB以下のファイルを選択してください。' }, 400);
   name = 'csworks_register_delivery_file'; Object.assign(args, { p_illustration_id: b.illustrationId, p_request_id: b.requestId, p_name: b.name, p_path: b.path, p_mime: b.mime, p_size: b.size });
  } else if (b.action === 'remove' && uuid(b.fileId)) { name = 'csworks_remove_delivery_file'; args.p_file_id = b.fileId; }
  else return reply({ error: '操作が不正です。' }, 400);
  const { data, error } = await db.rpc(name, args); return error ? failure(error) : reply(data || { ok: true });
 } catch { return failure({}); }
}
