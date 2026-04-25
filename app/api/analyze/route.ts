import { NextRequest, NextResponse } from 'next/server';
import { analyzeImage } from '../../../lib/openai';
import { calculateEstimate } from '../../../lib/pricing';
import { sendNotificationEmail } from '../../../lib/email';

// -----------------------------
// 型補正（ここが今回のエラー対策）
// -----------------------------
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

// -----------------------------
// メイン処理
// -----------------------------
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
    const mime = file.type || 'image/jpeg';
    const base64 = bytes.toString('base64');

    // -----------------------------
    // 入力取得
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
    // AI解析
    // -----------------------------
    const analysis = await analyzeImage({
      imageBase64: base64,
      style: input.style,
      usage: input.usage,
    });

    // -----------------------------
    // 見積計算
    // -----------------------------
    const estimate = calculateEstimate({
      // ------------------------
// finalScore計算（ここ追加）
// ------------------------
let finalScore =
  analysis.rawComplexityScore * 0.35 +
  analysis.partDensity * 0.2 +
  analysis.structureComplexity * 0.3 +
  analysis.lineDifficulty * 0.15;

// 作業タイプ補正
if (analysis.workType === 'trace') finalScore *= 0.55;
if (analysis.workType === 'normal') finalScore *= 1.0;
if (analysis.workType === 'realistic') finalScore *= 1.25;
if (analysis.workType === 'concept') finalScore *= 1.8;

// スタイル補正
if (input.style === 'line') finalScore *= 0.9;
if (input.style === 'color') finalScore *= 1.05;
if (input.style === 'real') finalScore *= 1.1;

// 用途補正
if (input.usage === 'manual') finalScore *= 0.9;
if (input.usage === 'sales') finalScore *= 1.2;

// 制御（重要）
if (analysis.workType === 'trace') {
  finalScore = Math.min(finalScore, 35);
}

if (analysis.workType === 'concept') {
  finalScore = Math.max(finalScore, 75);
}

finalScore = Math.max(10, Math.min(90, Math.round(finalScore)));
      style: input.style,
      usage: input.usage,
      quantity: input.quantity,
      size: input.size,
      rush: input.rush,
    });

    // -----------------------------
    // メール送信（画像添付あり）
    // -----------------------------
    await sendNotificationEmail({
      company: input.companyName,
      name: input.customerName,
      email: input.email,
      usage: input.usage,
      style: input.style,
      quantity: input.quantity,
      notes: input.notes,
      complexityScore: analysis.complexityScore,
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
    // フロント返却
    // -----------------------------
    return NextResponse.json({
      input: {
        requestFormalQuote: input.requestFormalQuote,
      },
      vision: {
        subjectType: analysis.workType || '機械イラスト',
        complexityScore: analysis.complexityScore,
        partDensity: analysis.partDensity,
        occlusion: analysis.occlusion,
        lineDifficulty: analysis.lineDifficulty,
        structureComplexity: analysis.structureComplexity,
        confidence: analysis.confidence,
        reason: analysis.summary,
      },
      estimate: {
        total: estimate.totalPrice,
        subtotal: estimate.unitPrice,
        deliveryDays: '3〜5営業日',
        complexityBand: '標準',
        basePrice: estimate.unitPrice,
        usageMultiplier: 1,
        styleMultiplier: 1,
        sizeMultiplier: 1,
        rushMultiplier: input.rush === 'rush' ? 1.3 : 1,
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
