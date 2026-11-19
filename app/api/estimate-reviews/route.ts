import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { adminClient } from '../../../lib/google-calendar-auth';
import {
  estimateReviewConsentVersion,
  estimateReviewImageHash,
  estimateReviewInputLimit,
  readEstimateReviewTicket,
} from '../../../lib/estimate-review-token';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (process.env.ESTIMATE_REVIEWS_ENABLED !== '1') {
    return NextResponse.json({ error: '投稿受付を停止しています。' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: '投稿データを確認してください。' }, { status: 400 });
  }

  const rating = form.get('rating');
  const token = form.get('ticket');
  const image = form.get('image');
  const ticket = typeof token === 'string' ? readEstimateReviewTicket(token) : null;
  if (!ticket) {
    return NextResponse.json({ error: '投稿期限が切れました。もう一度AI概算見積りを実行してください。' }, { status: 400 });
  }
  if (typeof rating !== 'string' || !/^[1-5]$/.test(rating) ||
      form.get('consentVersion') !== String(estimateReviewConsentVersion) ||
      !(image instanceof File) || !image.size || image.size > estimateReviewInputLimit) {
    return NextResponse.json({ error: '画像、星評価、公開への同意を確認してください。' }, { status: 400 });
  }

  const bytes = Buffer.from(await image.arrayBuffer());
  if (estimateReviewImageHash(bytes) !== ticket.imageHash) {
    return NextResponse.json({ error: '見積り時の参考画像を確認できませんでした。' }, { status: 400 });
  }

  let jpeg: Buffer;
  try {
    const source = sharp(bytes, { limitInputPixels: 25_000_000 });
    const { format } = await source.metadata();
    if (format !== 'jpeg' && format !== 'png' && format !== 'webp') {
      return NextResponse.json({ error: 'JPEG、PNG、WebPの画像を使用してください。' }, { status: 400 });
    }
    jpeg = await source.rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 78 }).toBuffer();
  } catch {
    return NextResponse.json({ error: '公開用の画像を作成できませんでした。' }, { status: 400 });
  }

  try {
    const { id, amount, price_type, quantity, style, unit_hours } = ticket;
    const { error } = await adminClient().from('estimate_reviews').insert({
      id, amount, price_type, quantity, style, unit_hours,
      rating: Number(rating),
      image_base64: jpeg.toString('base64'),
      consent_version: estimateReviewConsentVersion,
    });
    if (error?.code === '23505') return NextResponse.json({ accepted: true });
    if (error) throw error;
    return NextResponse.json({ accepted: true }, { status: 201 });
  } catch (error) {
    console.error('Estimate review insert failed', error);
    return NextResponse.json({ error: '投稿を保存できませんでした。' }, { status: 500 });
  }
}
