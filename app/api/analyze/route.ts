import { NextRequest, NextResponse } from 'next/server';
import { analyzeImage } from '../../../lib/openai';
import { calculatePrice } from '../../../lib/pricing';
import { sendNotificationEmail } from '../../../lib/email';

function getString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('image');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '画像ファイルがありません。' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'image/jpeg';
    const base64DataUrl = `data:${mime};base64,${bytes.toString('base64')}`;

    const input: EstimateRequest = {
      customerName: getString(form.get('customerName')),
      companyName: getString(form.get('companyName')),
      email: getString(form.get('email')),
      usage: getString(form.get('usage')) as EstimateRequest['usage'],
      size: getString(form.get('size')) as EstimateRequest['size'],
      style: getString(form.get('style')) as EstimateRequest['style'],
      quantity: Number(getString(form.get('quantity')) || '1'),
      rush: getString(form.get('rush')) as EstimateRequest['rush'],
      requestFormalQuote: getString(form.get('requestFormalQuote')) === 'yes',
      notes: getString(form.get('notes'))
    };

    const vision = await analyzeImage(base64DataUrl, input.style);
    const estimate = calculateEstimate(input, vision);

    await sendEstimateNotification({ input, vision, estimate });

    return NextResponse.json({ input, vision, estimate });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: '解析中にエラーが発生しました。環境変数やAPIキー設定を確認してください。' },
      { status: 500 }
    );
  }
}
