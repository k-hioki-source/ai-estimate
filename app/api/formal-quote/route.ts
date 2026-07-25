import { NextRequest, NextResponse } from 'next/server';
import { sendNotificationEmail } from '../../../lib/email';

function getString(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get('image') as File | null;
    const base64 = file
      ? Buffer.from(await file.arrayBuffer()).toString('base64')
      : '';

    const totalPrice = Number(getString(form.get('fixedEstimateTotal')) || '0');
    const difficultyScore = Number(
      getString(form.get('fixedDifficultyScore')) || '0'
    );
    const estimatedHours = Number(
      getString(form.get('fixedEstimatedHours')) || '0'
    );
    const confidenceScoreText = getString(
      form.get('fixedConfidenceScore')
    );

    const result = await sendNotificationEmail({
      estimateId: getString(form.get('fixedEstimateId')) || undefined,
      company: getString(form.get('companyName')),
      name: getString(form.get('customerName')),
      email: getString(form.get('email')),
      sourceType: getString(form.get('sourceType')),
      usage: getString(form.get('usage')),
      style: getString(form.get('style')),
      quantity: Number(getString(form.get('quantity')) || '1'),
      notes: getString(form.get('notes')),
      complexityScore: difficultyScore,
      difficultyScore,
      totalPrice,
      estimatedHours,
      requestFormalQuote: true,
      workType:
        getString(form.get('fixedWorkType')) ||
        getString(form.get('fixedSubjectType')),
      aiReason: getString(form.get('fixedReason')),
      aiComment: getString(form.get('fixedReason')),
      confidenceScore: confidenceScoreText
        ? Number(confidenceScoreText)
        : undefined,
      confidenceLevel: getString(form.get('fixedConfidenceLevel')),
      confidenceComment: getString(form.get('fixedConfidenceComment')),
      imageAttachment: file
        ? {
            filename: file.name || 'image.jpg',
            content: base64,
          }
        : undefined,
    });

    if (!result.ok) {
      console.error('正式見積りメール送信エラー', {
        estimateId: result.estimateId,
        failedAt: result.failedAt,
        error: result.error,
      });

      throw new Error(
        result.failedAt === 'admin'
          ? '管理者宛てメールの送信に失敗しました。'
          : 'お客様宛てメールの送信に失敗しました。'
      );
    }

    return NextResponse.json({
      ok: true,
      estimateId: result.estimateId,
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
