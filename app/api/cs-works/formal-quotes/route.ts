import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { formalQuotesEnabled, quoteTotals } from '../../../../lib/cs-works/formal-quotes';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const reply = (x: object, status = 200) => NextResponse.json(x, { status, headers: { 'Cache-Control': 'no-store, private' } });
async function actor(req: NextRequest) {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]; if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw Error('Configuration');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
  const { data, error } = await db.auth.getUser(token); return !error && data.user ? db : null;
}
function failure(e: { code?: string }) {
  if (e.code === '42501') return reply({ error: 'この見積りを操作する権限がありません。' }, 403);
  if (e.code === '40001' || e.code === '23505') return reply({ error: '見積りが更新されています。再読み込みして最新の内容を確認してください。' }, 409);
  if (e.code === '22023') return reply({ error: '明細と納期を確認してください。' }, 400);
  return reply({ error: '正式見積りの設定を確認できません。管理者へお問い合わせください。' }, 503);
}
export async function GET(req: NextRequest) {
  if (!formalQuotesEnabled) return reply({ error: 'Not found' }, 404);
  try {
    const db = await actor(req); if (!db) return reply({ error: 'ログインが必要です。' }, 401);
    const id = req.nextUrl.searchParams.get('projectId'); if (!uuid(id)) return reply({ error: '案件を指定してください。' }, 400);
    const { data, error } = await db.rpc('csworks_get_quotes', { p_project_id: id }); return error ? failure(error) : reply(data);
  } catch { return failure({}); }
}
export async function POST(req: NextRequest) {
  if (!formalQuotesEnabled) return reply({ error: 'Not found' }, 404);
  try {
    const db = await actor(req); if (!db) return reply({ error: 'ログインが必要です。' }, 401);
    const reader = req.body?.getReader(); if (!reader) return reply({ error: '入力がありません。' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 600000) { await reader.cancel(); return reply({ error: '明細の容量が大きすぎます。' }, 413); } chunks.push(value); }
    let b; try { b = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply({ error: '入力形式が不正です。' }, 400); }
    if (!b || !uuid(b.projectId) || !uuid(b.requestId)) return reply({ error: '案件と操作を指定してください。' }, 400);
    let name: string, args: Record<string, unknown>;
    if (b.action === 'order') {
      if (!uuid(b.quoteId)) return reply({ error: '見積りを指定してください。' }, 400);
      name = 'csworks_order_quote'; args = { p_project_id: b.projectId, p_quote_id: b.quoteId, p_request_id: b.requestId };
    } else if (b.action === 'save' || b.action === 'present') {
      if ((b.expectedQuoteId !== null && !uuid(b.expectedQuoteId)) || (b.draftId !== null && !uuid(b.draftId)) || !Number.isSafeInteger(b.editVersion) || b.editVersion < 0 || typeof b.deadline !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.deadline)) return reply({ error: '納期と見積りの版を確認してください。' }, 400);
      try { quoteTotals(b.items); } catch (e) { return reply({ error: (e as Error).message }, 400); }
      name = 'csworks_save_quote'; args = { p_project_id: b.projectId, p_expected_quote_id: b.expectedQuoteId, p_draft_id: b.draftId, p_edit_version: b.editVersion, p_deadline: b.deadline, p_items: b.items, p_present: b.action === 'present', p_request_id: b.requestId };
    } else return reply({ error: '操作が不正です。' }, 400);
    const { data, error } = await db.rpc(name, args); return error ? failure(error) : reply(data);
  } catch { return failure({}); }
}
