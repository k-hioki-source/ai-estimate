import { NextRequest, NextResponse } from 'next/server';
import { analyzeImage } from '../../../lib/openai';
import { calculateEstimate } from '../../../lib/pricing';
import { sendNotificationEmail } from '../../../lib/email';

function getString(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

function getStyle(value: string): 'line' | 'color' | 'real' {
  if (value === 'color') return 'color';
  if (value === 'real') return 'real';
  return 'line';
}

function getUsage(value: string): 'manual' | 'parts' | 'sales' {
  if (value === 'parts') return 'parts';
  if (value === 'sales') return 'sales';
  return 'manual';
}

function getSize(value: string): 'small' | 'medium' | 'large' {
  if (value === 'small') return 'small';
  if (value === 'large') return 'large';
  return 'medium';
}

function getRush(value: string): 'normal' | 'rush' {
  if (value === 'rush') return 'rush';
  return 'normal';
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get('image') as File | null;
    if (!file) {
      return NextResponse.json({ error: '画像がありません' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString('base64');

    const input = {
      customerName: getString(form.get('customerName')),
      companyName: getString(form.get('companyName')),
      email: getString(form.get('email')),
      usage: getUsage(getString(form.get('usage'))),
      size: getSize(getString(form.get('size'))),
      style: getStyle(getString(form.get('style'))),
      rush: getRush(getString(form.get('rush'))),
      quantity: Number(getString(form.get('quantity')) || '1'),
      notes: getString(form.get('notes')),
      requestFormalQuote: ['true', 'yes', 'on'].includes(
        getString(form.get('requestFormalQuote'))
      ),
    };

    // -----------------------------
    // AI解析
    // -----------------------------
    const analysis = await analyzeImage({
      imageBase64: base64,
      style: input.style,
      usage: input.usage,
    });

    // -----------------------------
    // ★ finalScore（最重要ロジック）
    // -----------------------------
    let finalScore =
      (analysis.rawComplexityScore ?? 50) * 0.25 +
      (analysis.partDensity ?? 50) * 0.25 +
      (analysis.structureComplexity ?? 50) * 0.35 +
      (analysis.lineDifficulty ?? 50) * 0.15;

    // 作業タイプ補正
    if (analysis.workType === 'trace') finalScore *= 0.55;
    if (analysis.workType === 'normal') finalScore *= 1.0;
    if (analysis.workType === 'realistic') finalScore *= 1.25;
    if (analysis.workType === 'concept') finalScore *= 2.2;

    // スタイル補正
    if (input.style === 'line') finalScore *= 0.9;
    if (input.style === 'color') finalScore *= 1.05;
    if (input.style === 'real') finalScore *= 1.1;

    // 用途補正
    if (input.usage === 'manual') finalScore *= 0.9;
    if (input.usage === 'sales') finalScore *= 1.2;

    // 最低ライン制御（超重要）
    if (analysis.workType === 'trace') {
      finalScore = Math.min(finalScore, 35);
    }

    if (analysis.workType === 'normal') {
      finalScore = Math.max(finalScore, 40);
    }

    if (analysis.workType === 'concept') {
      finalScore = Math.max(finalScore, 80);
    }

    // clamp
    finalScore = Math.max(10, Math.min(90, Math.round(finalScore)));

    // -----------------------------
    // 見積計算
    // -----------------------------
    const estimate = calculateEstimate({
      complexityScore: finalScore,
      style: input.style,
      usage: input.usage,
      quantity: input.quantity,
      size: input.size,
      rush: input.rush,
    });

    // -----------------------------
    // メール送信
    // -----------------------------
    await sendNotificationEmail({
      company: input.companyName,
      name: input.customerName,
      email: input.email,
      usage: input.usage,
      style: input.style,
      quantity: input.quantity,
      notes: input.notes,
      complexityScore: finalScore,
      totalPrice: estimate.totalPrice,
      requestFormalQuote: input.requestFormalQuote,
      imageAttachment: input.requestFormalQuote
        ? {
            filename: file.name || 'image.jpg',
            content: base64,
          }
        : undefined,
    });

    // -----------------------------
    // レスポンス
    // -----------------------------
    return NextResponse.json({
      input: {
        requestFormalQuote: input.requestFormalQuote,
      },
      vision: {
        subjectType: analysis.workType || '機械イラスト',
        complexityScore: finalScore,
        partDensity: analysis.partDensity ?? 50,
        occlusion: analysis.occlusion ?? 50,
        lineDifficulty: analysis.lineDifficulty ?? 50,
        structureComplexity: analysis.structureComplexity ?? 50,
        confidence: analysis.confidence ?? 0.7,
        reason: analysis.summary || '画像と条件から総合判定しました。',
      },
      estimate: {
        total: estimate.totalPrice,
        subtotal: estimate.totalPrice,
        deliveryDays: '3〜5営業日',
        complexityBand: '標準',
        basePrice: estimate.basePrice ?? estimate.unitPrice,
        usageMultiplier: estimate.usageMultiplier ?? 1,
        styleMultiplier: estimate.styleMultiplier ?? 1,
        sizeMultiplier: estimate.sizeMultiplier ?? 1,
        rushMultiplier: estimate.rushMultiplier ?? 1,
        quantity: input.quantity,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: '解析中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
