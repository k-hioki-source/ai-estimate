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
      style: getString(form.get('style')),
      quantity: Number(getString(form.get('quantity')) || '1'),
      notes: getString(form.get('notes')),
      requestFormalQuote: getString(form.get('requestFormalQuote')) === 'true',
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
        complexityScore: analysis.complexityScore,
        reason: analysis.summary,
      },
      estimate: {
        total: estimate.totalPrice,
        subtotal: estimate.unitPrice,
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
