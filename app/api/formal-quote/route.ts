
import { NextRequest, NextResponse } from 'next/server';
import { sendNotificationEmail } from '../../../lib/email';

function getString(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get('image') as File | null;
    const base64 = file ? Buffer.from(await file.arrayBuffer()).toString('base64') : '';

    const totalPrice = Number(getString(form.get('fixedEstimateTotal')) || '0');
    const complexityScore = Number(getString(form.get('fixedDifficultyScore')) || '0');

    await sendNotificationEmail({
      company: getString(form.get('companyName')),
      name: getString(form.get('customerName')),
      email: getString(form.get('email')),
      usage: getString(form.get('usage')),
      style: getString(form.get('style')),
      quantity: Number(getString(form.get('quantity')) || '1'),
      notes:
        getString(form.get('notes')) +
        `

【固定された概算結果】
作業内容：${getString(form.get('fixedSubjectType'))}
概算金額：${totalPrice.toLocaleString()}円
想定制作時間：${getString(form.get('fixedEstimatedHours'))}時間
難易度スコア：${complexityScore}
判定理由：${getString(form.get('fixedReason'))}`,
      complexityScore,
      totalPrice,
      requestFormalQuote: true,
      imageAttachment: file
        ? {
            filename: file.name || 'image.jpg',
            content: base64,
          }
        : undefined,
    });

    return NextResponse.json({
      ok: true,
      message: '正式見積り依頼を送信しました。',
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: '正式見積り依頼の送信に失敗しました。' },
      { status: 500 }
    );
  }
}
