import { sendNotificationEmail } from '../../../lib/email';
import { NextRequest, NextResponse } from 'next/server';
import { analyzeImage } from '../../../lib/openai';
import { calculateEstimate } from '../../../lib/pricing';

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

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get('image') as File | null;
if (!file) {
  return NextResponse.json({ error: '画像がありません' }, { status: 400 });
}

// ★ここ追加（mime取得）
const mimeType = file.type || 'image/jpeg';

const bytes = Buffer.from(await file.arrayBuffer());
const base64 = bytes.toString('base64');

    // -----------------------------
    // 入力
    // -----------------------------
    const input = {
      usage: getUsage(getString(form.get('usage'))),
      style: getStyle(getString(form.get('style'))),
      quantity: Number(getString(form.get('quantity')) || '1'),
      notes: getString(form.get('notes')),

      // ★ フロントエラー防止用
      requestFormalQuote: ['true', 'yes', 'on'].includes(
        getString(form.get('requestFormalQuote'))
      ),
    };

    // -----------------------------
    // AI解析（分類＋難易度）
    // -----------------------------
    const analysis = await analyzeImage({
  imageBase64: base64,
  mimeType, // ←追加
  style: input.style,
  usage: input.usage,
  notes: input.notes,
});

    // ★ここ追加
let workType = analysis.workType;

if (
  input.notes.includes('概念') ||
  input.notes.includes('フロー') ||
  input.notes.includes('全体')
) {
  workType = 'concept_diagram';
}

    // ------------------------
// technical補正（ここ追加）
// ------------------------
if (analysis.workType === 'technical_drawing') {
  if (analysis.structureComplexity < 45) {
    workType = 'standard_trace';
  } else {
    workType = 'technical_drawing';
  }
}

    // -----------------------------
    // 見積計算（固定ロジック）
    // -----------------------------
    const estimate = calculateEstimate({
      workType: analysis.workType,
      difficultyScore: analysis.difficultyScore,
      quantity: input.quantity,
    });

    // -----------------------------
    // レスポンス
    // -----------------------------
    await sendNotificationEmail({
  company: getString(form.get('companyName')),
  name: getString(form.get('customerName')),
  email: getString(form.get('email')),
  usage: input.usage,
  style: input.style,
  quantity: input.quantity,
  notes: input.notes,
  complexityScore: analysis.difficultyScore,
  totalPrice: estimate.totalPrice,
  requestFormalQuote: input.requestFormalQuote,
  imageAttachment: input.requestFormalQuote
    ? {
        filename: file.name || 'image.jpg',
        content: base64,
      }
    : undefined,
});
    return NextResponse.json({
      // ★ フロント互換（これが無いと落ちる）
      input: {
        requestFormalQuote: input.requestFormalQuote,
      },

      // ▼ AI判定
      vision: {
        subjectType: workType,
        complexityScore: analysis.difficultyScore,
        partDensity: analysis.partDensity,
        lineDifficulty: analysis.lineDifficulty,
        structureComplexity: analysis.structureComplexity,
        confidence: 0.7,
        reason: analysis.summary,
      },

      // ▼ 見積
      estimate: {
        total: estimate.totalPrice,
        subtotal: estimate.unitPrice,
        deliveryDays: '3〜5営業日',
        basePrice: estimate.unitPrice,
        hourlyRate: estimate.hourlyRate,

        // ★ フロント表示用
        estimatedHours: estimate.hours,
        adjustedHours: estimate.hours,

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
