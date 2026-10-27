import { illustrationsEnabled } from '../../../../lib/cs-works/illustrations';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { annotationsEnabled, validateAnnotations, type ReviewBatch } from '../../../../lib/cs-works/image-annotations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
async function actor(req: NextRequest) {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw Error('Missing configuration');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
  const { data, error } = await db.auth.getUser(token);
  return !error && data.user ? { db, user: data.user } : null;
}
function rpcError(error: { code?: string; message?: string }) {
  const code = error.code;
  if (code === '42501') return reply({ error: 'この修正指示を操作する権限がありません。' }, 403);
  if (code === '40001' || code === '23505') return reply({ error: '確認状態または保存内容が更新されています。再読み込みして確認してください。' }, 409);
  if (code === '22023') return reply({ error: '入力内容または確認対象を確認してください。承認前には赤入れの下書きを空にして保存してください。' }, 400);
  return reply({ error: '修正指示の設定を確認できません。管理者へお問い合わせください。' }, 503);
}
export async function GET(req: NextRequest) {
  if (!annotationsEnabled) return reply({ error: 'Not found' }, 404);
  try {
    const who = await actor(req); if (!who) return reply({ error: 'ログインが必要です。' }, 401);
    const projectId = req.nextUrl.searchParams.get('projectId');
    if (!uuid(projectId)) return reply({ error: '案件を指定してください。' }, 400);
    const { db } = who;
    const { data: project, error: projectError } = await db.from('projects').select('id').eq('id', projectId).maybeSingle();
    if (projectError || !project) return reply({ error: '案件が見つかりません。' }, 404);
    const { data: rawBatches, error: bError } = await db.from('project_review_batches').select('id,project_id,round_number,state,message_id' + (illustrationsEnabled ? ',illustration_id,illustration_revision,illustration_label' : '')).eq('project_id', projectId).order('round_number', { ascending: false }).limit(illustrationsEnabled ? 10001 : 101);
    if (bError) return rpcError(bError);
    const batches = rawBatches as unknown as ReviewBatch[] | null;
    if ((batches?.length ?? 0) > (illustrationsEnabled ? 10000 : 100)) return reply({ error: '確認履歴が多いため管理者へお問い合わせください。' }, 409);
    if (!batches?.length) return reply({ batches: [], members: [], annotations: [], files: [] });
    const ids = batches.map(b => b.id);
    const [m, a] = await Promise.all([
      db.from('project_review_batch_files').select('batch_id,file_id', { count: 'exact' }).in('batch_id', ids).limit(10001),
      db.from('project_file_annotations').select('batch_id,file_id,document,version,finalized_at', { count: 'exact' }).in('batch_id', ids).limit(10001),
    ]);
    if (m.error || a.error) return rpcError(m.error || a.error!);
    if ((m.data?.length ?? 0) > 10000 || (a.data?.length ?? 0) > 10000 || m.count !== (m.data?.length ?? 0) || a.count !== (a.data?.length ?? 0)) return reply({ error: '確認履歴の取得上限を超えています。' }, 409);
    const fileIds = [...new Set((m.data ?? []).map(x => x.file_id))];
    const f = fileIds.length ? await db.from('project_files').select('id,project_id,file_name,mime_type,storage_path,file_type,created_at', { count: 'exact' }).eq('project_id', projectId).in('id', fileIds) : { data: [], error: null };
    if (f.error) return rpcError(f.error);
    if ((f.data?.length ?? 0) !== fileIds.length) return reply({ error: '対象ファイルをすべて取得できません。管理者へお問い合わせください。' }, 409);
    return reply({ batches, members: m.data, annotations: a.data, files: f.data });
  } catch { return reply({ error: '修正指示を取得できません。' }, 503); }
}
export async function POST(req: NextRequest) {
  if (!annotationsEnabled) return reply({ error: 'Not found' }, 404);
  try {
    const who = await actor(req); if (!who) return reply({ error: 'ログインが必要です。' }, 401);
    // Limit the actual request body, including chunked requests without Content-Length.
    const reader = req.body?.getReader(); if (!reader) return reply({ error: '入力がありません。' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2_000_000) { await reader.cancel(); return reply({ error: '修正指示の容量が大きすぎます。' }, 413); } chunks.push(value); }
    let body: Record<string, any>;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply({ error: '入力形式が不正です。' }, 400); }
    if (!body || !uuid(body.projectId)) return reply({ error: '案件を指定してください。' }, 400);
    let name: string, args: Record<string, unknown>;
    if (body.action === 'save') {
      if (!uuid(body.batchId) || !uuid(body.fileId) || !Number.isSafeInteger(body.version) || body.version < 0 || !validateAnnotations(body.document)) return reply({ error: '修正指示の内容が不正です。' }, 400);
      name = 'csworks_save_annotations'; args = { p_project_id: body.projectId, p_batch_id: body.batchId, p_file_id: body.fileId, p_expected_version: body.version, p_document: body.document };
    } else if (body.action === 'start') {
      if (!Array.isArray(body.fileIds) || body.fileIds.length < 1 || body.fileIds.length > 100 || !body.fileIds.every(uuid) || new Set(body.fileIds).size !== body.fileIds.length) return reply({ error: '確認対象ファイルを1〜100件選択してください。' }, 400);
      name = 'csworks_start_review'; args = { p_project_id: body.projectId, p_file_ids: body.fileIds };
    } else if (body.action === 'submit') {
      if (!uuid(body.batchId) || !uuid(body.requestId) || !['revision_request', 'approval'].includes(body.reviewAction) || typeof body.comment !== 'string' || body.comment.length > 10000 || (body.reviewAction === 'revision_request' && !body.comment.trim())) return reply({ error: '確認結果・修正内容を入力してください。' }, 400);
      name = 'csworks_submit_review'; args = { p_project_id: body.projectId, p_batch_id: body.batchId, p_request_id: body.requestId, p_action: body.reviewAction, p_comment: body.comment.trim() };
    } else return reply({ error: '操作が不正です。' }, 400);
    const { data, error } = await who.db.rpc(name, args);
    if (error) return rpcError(error);
    return reply(data ?? {});
  } catch { return reply({ error: '修正指示を保存できません。' }, 503); }
}
