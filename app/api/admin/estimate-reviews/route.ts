import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/google-calendar-auth';
import { estimateReviewColumns } from '../../../../lib/estimate-review-display';

const columns = estimateReviewColumns + ',status,created_at';
const pageSize = 20;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request.headers.get('authorization'));
    if (!admin) return json({ error: '管理者権限が必要です。' }, 403);
    const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return json({ error: 'ページ番号が不正です。' }, 400);
    const offset = (page - 1) * pageSize;
    const { data, error } = await admin.db.from('estimate_reviews').select(columns)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + pageSize);
    if (error) throw error;
    return json({ reviews: data.slice(0, pageSize), hasNext: data.length > pageSize });
  } catch (error) {
    console.error('Estimate review admin list failed', error);
    return json({ error: '投稿一覧を取得できませんでした。' }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request.headers.get('authorization'));
    if (!admin) return json({ error: '管理者権限が必要です。' }, 403);
    const body = await request.json().catch(() => null);
    const id = body?.id;
    const status = body?.status;
    const comment = body?.admin_comment;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) ||
        !['pending', 'published', 'hidden'].includes(status) ||
        typeof comment !== 'string' || comment.length > 1000) {
      return json({ error: '公開状態とコメント（1,000文字以内）を確認してください。' }, 400);
    }
    const { data, error } = await admin.db.from('estimate_reviews')
      .update({ status, admin_comment: comment.trim() }).eq('id', id).select(columns).maybeSingle();
    if (error) throw error;
    if (!data) return json({ error: '投稿が見つかりませんでした。' }, 404);
    return json({ review: data });
  } catch (error) {
    console.error('Estimate review admin update failed', error);
    return json({ error: '投稿を更新できませんでした。' }, 500);
  }
}
