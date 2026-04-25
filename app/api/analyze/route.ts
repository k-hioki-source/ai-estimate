import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { calculateEstimate } from '../../../lib/pricing';
import { sendNotificationEmail } from '../../../lib/email';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getString(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get('image') as File | null;
    if (!file) {
      return NextResponse.json({ error: '画像がありません' }, { status: 400 });
    }

    // ===== 画像をbase64化 =====
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'image/jpeg';
    const base64DataUrl = `data:${mime};base64,${bytes.toString('base64')}`;

    // ===== 入力値 =====
    const input = {
      customerName: getString(form.get('customerName')),
      companyName: getString(form.get('companyName')),
      email: getString(form.get('email')),
      usage: getString(form.get('usage')),
      size: getString(form.get('size')),
      style: getStyle(getString(form.get('style'))),
      quantity: Number(getString(form.get('quantity')) || '1'),
      notes: getString(form.get('notes')),
      requestFormalQuote: ['true', 'yes', 'on'].includes(
  getString(form.get('requestFormalQuote'))
),
    };

    // ===== AI解析 =====
    const prompt = `
あなたはテクニカルイラストの見積り専門家です。
画像を見て複雑さを数値化してください（0〜100）。

JSONで出力：
{
  "complexityScore": 数値,
  "summary": "理由"
}
`;
function getStyle(value: string): 'line' | 'color' | 'real' {
  if (value === 'color') return 'color';
  if (value === 'real') return 'real';
  return 'line';
}
    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            {
              type: 'input_image',
              image_url: base64DataUrl,
              detail: 'auto',
            },
          ],
        },
      ],
    });

    let analysis: any = {};
    try {
      const text = response.output_text || '{}';
      analysis = JSON.parse(text);
    } catch {
      analysis = { complexityScore: 50, summary: '解析失敗のため中央値' };
    }

    // ===== 見積り =====
    const estimate = calculateEstimate({
      complexityScore: analysis.complexityScore ?? 50,
      style: input.style,
      quantity: input.quantity,
    });

    // ===== メール送信 =====
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

      // ✔チェック時のみ画像添付
      imageAttachment: input.requestFormalQuote
        ? {
            filename: file.name || 'uploaded-image.jpg',
            content: bytes.toString('base64'),
          }
        : undefined,
    });

    // ===== フロント返却（今朝仕様に合わせる） =====
    return NextResponse.json({
  input: {
    requestFormalQuote: input.requestFormalQuote,
  },
  vision: {
    subjectType: '機械・製品イラスト',
    complexityScore: analysis.complexityScore ?? 50,
    partDensity: analysis.partDensity ?? 50,
    occlusion: analysis.occlusion ?? 50,
    lineDifficulty: analysis.lineDifficulty ?? 50,
    realismRequirement: analysis.realismRequirement ?? 50,
    structureComplexity: analysis.structureComplexity ?? 50,
    confidence: analysis.confidence ?? 0.7,
    reason: analysis.summary ?? '画像と入力条件をもとに概算判定しました。',
  },
  estimate: {
    total: estimate.totalPrice ?? 0,
    subtotal: estimate.totalPrice ?? 0,
    deliveryDays: '3〜5営業日',
    complexityBand: '標準',
    basePrice: estimate.unitPrice ?? 0,
    usageMultiplier: 1,
    styleMultiplier: 1,
    sizeMultiplier: 1,
    rushMultiplier: 1,
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
