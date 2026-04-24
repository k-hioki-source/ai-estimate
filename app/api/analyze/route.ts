import { NextRequest, NextResponse } from 'next/server';
import { analyzeImage } from '../../../lib/openai';
import { calculateEstimate } from '../../../lib/pricing';
import { sendNotificationEmail } from '../../../lib/email';

function getString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get('image');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '画像ファイルが見つかりません。' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'image/jpeg';
    const base64DataUrl = `data:${mime};base64,${bytes.toString('base64')}`;

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
      imageDataUrl: base64DataUrl,
    };

    const analysis = await analyzeImage({
      imageDataUrl: input.imageDataUrl,
      usage: input.usage,
      style: input.style,
      size: input.size,
      notes: input.notes,
    });

    const estimate = calculateEstimate({
      complexityScore: analysis.complexityScore ?? 50,
      style: input.style,
      quantity: input.quantity,
    });

    await sendNotificationEmail({
      company: input.companyName,
      name: input.customerName,
      email: input.email,
      usage: input.usage,
      style: input.style,
      quantity: input.quantity,
      notes: input.notes,
      complexityScore: analysis.complexityScore ?? 50,
      totalPrice: estimate.totalPrice ?? 0,
    });

    return NextResponse.json({
  input: {
    requestFormalQuote: input.requestFormalQuote,
  },
  vision: {
    subjectType: '機械系',
    complexityScore: analysis.complexityScore,
    partDensity: analysis.partDensity,
    occlusion: analysis.occlusion,
    lineDifficulty: analysis.lineDifficulty,
    realismRequirement: analysis.realismRequirement,
    structureComplexity: analysis.structureComplexity,
    confidence: analysis.confidence,
    reason: analysis.summary,
  },
  estimate: {
    total: estimate.totalPrice,
    subtotal: estimate.unitPrice,
    deliveryDays: '3〜5営業日',
    complexityBand: '',
    basePrice: estimate.unitPrice,
    usageMultiplier: 1,
    styleMultiplier: 1,
    sizeMultiplier: 1,
    rushMultiplier: 1,
    quantity: input.quantity,
  },
});
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: '解析中にエラーが発生しました。環境変数やAPIキー設定を確認してください。' },
      { status: 500 }
    );
  }
}
