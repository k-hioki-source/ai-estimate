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

    // -----------------------------
    // 画像 → base64
    // -----------------------------
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
    };

    // -----------------------------
    // AI解析（分類＋難易度）
    // -----------------------------
    const analysis = await analyzeImage({
      imageBase64: base64,
      style: input.style,
      usage: input.usage,
      notes: input.notes,
    });

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
    return NextResponse.json({
      vision: {
        subjectType: analysis.workType,
        complexityScore: analysis.difficultyScore,
        partDensity: analysis.partDensity,
        lineDifficulty: analysis.lineDifficulty,
        structureComplexity: analysis.structureComplexity,
        confidence: 0.7,
        reason: analysis.summary,
      },

      estimate: {
        total: estimate.totalPrice,
        subtotal: estimate.unitPrice,
        deliveryDays: '3〜5営業日',
        basePrice: estimate.unitPrice,
        hourlyRate: estimate.hourlyRate,

        // 👇 フロント用
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
