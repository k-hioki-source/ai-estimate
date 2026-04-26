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

    // -----------------------------
    // 画像 → base64
    // -----------------------------
    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString('base64');

    // -----------------------------
    // 入力
    // -----------------------------
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
    // AI解析（工数）
    // -----------------------------
    const analysis = await analyzeImage({
  imageBase64: base64,
  style: input.style,
  usage: input.usage,
  notes: input.notes, // ←追加
});

    // -----------------------------
    // 見積計算（時間 × 3000円）
    // -----------------------------
    const estimate = calculateEstimate({
      estimatedHours: analysis.estimatedHours,
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
      complexityScore: Math.round(analysis.estimatedHours * 10), // 表示用
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

      // ▼ 判定情報
      vision: {
  subjectType: analysis.workType,
  complexityScore: Math.round(analysis.estimatedHours * 10),
  estimatedHours: analysis.estimatedHours, // ←ここ追加
  partDensity: analysis.partDensity,
  lineDifficulty: analysis.lineDifficulty,
  structureComplexity: analysis.structureComplexity,
  confidence: analysis.confidence,
  reason: analysis.summary,
},

      // ▼ 見積
      estimate: {
        total: estimate.totalPrice,
        subtotal: estimate.unitPrice,
        deliveryDays: '3〜5営業日',
        basePrice: estimate.unitPrice,
        hourlyRate: estimate.hourlyRate,
        estimatedHours: estimate.estimatedHours,
        adjustedHours: estimate.adjustedHours,
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
