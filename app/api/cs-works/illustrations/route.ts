import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { illustrationsEnabled } from '../../../../lib/cs-works/illustrations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const reply = (x: object, status = 200) => NextResponse.json(x, { status, headers: { 'Cache-Control': 'no-store, private' } });
async function actor(req: NextRequest) {
 const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]; if (!token) return null;
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; if (!url || !key) throw Error('Configuration');
 const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
 const { data, error } = await db.auth.getUser(token); return !error && data.user ? db : null;
}
function failure(e: { code?: string; message?: string }) {
 if (e.code === '42501') return reply({ error: 'このイラストを操作する権限がありません。' }, 403);
 if (e.code === '40001' || e.code === '23505') return reply({ error: '確認状態が変わっています。最新の状態を再取得してください。修正依頼後は新しい稿をアップロードして確認依頼してください。' }, 409);
 if (e.code === '22023') return reply({ error: e.message === 'Clear annotation drafts before approval' ? '承認前に対象画像の赤入れ下書きを空にして保存してください。' : '選択したイラスト・ファイル・コメントを確認してください。修正依頼にはコメントが必要です。' }, 400);
 return reply({ error: 'イラスト管理の設定を確認できません。管理者へお問い合わせください。' }, 503);
}
export async function GET(req: NextRequest) {
 if (!illustrationsEnabled) return reply({ error: 'Not found' }, 404);
 try { const db = await actor(req); if (!db) return reply({ error: 'ログインが必要です。' }, 401); const id = req.nextUrl.searchParams.get('projectId'); if (!uuid(id)) return reply({ error: '案件を指定してください。' }, 400); const { data, error } = await db.rpc('csworks_get_illustrations', { p_project_id: id }); return error ? failure(error) : reply(data); } catch { return failure({}); }
}
export async function POST(req: NextRequest) {
 if (!illustrationsEnabled) return reply({ error: 'Not found' }, 404);
 try {
  const db = await actor(req); if (!db) return reply({ error: 'ログインが必要です。' }, 401);
  const reader = req.body?.getReader(); if (!reader) return reply({ error: '入力がありません。' }, 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 100000) { await reader.cancel(); return reply({ error: '入力の容量が大きすぎます。' }, 413); } chunks.push(value); }
  let b; try { b = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply({ error: '入力形式が不正です。' }, 400); }
  if (!b || !uuid(b.projectId)) return reply({ error: '案件を指定してください。' }, 400);
  let name: string, args: Record<string, unknown> = { p_project_id: b.projectId };
  if (b.action === 'prepare' || b.action === 'begin') name = b.action === 'prepare' ? 'csworks_prepare_illustrations' : 'csworks_begin_illustrations';
  else {
   if (!uuid(b.requestId)) return reply({ error: '操作を指定してください。' }, 400);
   args.p_request_id = b.requestId;
   if (b.action === 'attach') {
    if (!uuid(b.illustrationId) || typeof b.name !== 'string' || b.name.length < 1 || b.name.length > 255 || typeof b.path !== 'string' || b.path.length > 300 || !['image/png','image/jpeg','application/pdf'].includes(b.mime) || !Number.isSafeInteger(b.size) || b.size < 1 || b.size > 52428800) return reply({ error: 'PNG・JPEG・PDFの50MB以下のファイルを選択してください。' }, 400);
    name = 'csworks_attach_illustration_file'; Object.assign(args, { p_illustration_id: b.illustrationId, p_name: b.name, p_path: b.path, p_mime: b.mime, p_size: b.size });
   } else if (b.action === 'start') {
    if (!Array.isArray(b.ids) || b.ids.length < 1 || b.ids.length > 200 || b.ids.some((x: unknown) => !uuid(x)) || new Set(b.ids).size !== b.ids.length) return reply({ error: '確認対象を選択してください。' }, 400);
    name = 'csworks_start_illustration_review'; args.p_ids = b.ids;
   } else if (b.action === 'submit') {
    if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 200 || b.items.some((x: any) => !x || !uuid(x.illustrationId) || !uuid(x.batchId) || !['approval','revision_request'].includes(x.action) || typeof x.comment !== 'string' || x.comment.length > 2000 || (x.action === 'revision_request' && !x.comment.trim())) || new Set(b.items.map((x: any) => x.illustrationId)).size !== b.items.length) return reply({ error: '確認結果と修正コメントを確認してください。' }, 400);
    name = 'csworks_submit_illustration_review'; args.p_items = b.items;
   } else return reply({ error: '操作が不正です。' }, 400);
  }
  const { data, error } = await db.rpc(name, args); return error ? failure(error) : reply(data);
 } catch { return failure({}); }
}
