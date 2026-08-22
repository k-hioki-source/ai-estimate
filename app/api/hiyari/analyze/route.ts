import { NextRequest, NextResponse } from 'next/server';
import { analyzeHiyariImage } from '../../../../lib/hiyariOpenAI';
import { calculateHiyariEstimate } from '../../../../lib/hiyariPricing';

export const runtime = 'nodejs';

function getString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const image = form.get('image') as File | null;
    const incidentDescription = getString(form.get('incidentDescription'));
    const illustrationRequest = getString(form.get('illustrationRequest'));
    const quantity = Math.max(
      1,
      Math.min(50, Number(getString(form.get('quantity')) || '1'))
    );

    if (!image || image.size === 0) {
      return NextResponse.json(
        { error: 'ヒヤリハットの現場写真をアップロードしてください。' },
        { status: 400 }
      );
    }

    if (!incidentDescription) {
      return NextResponse.json(
        { error: 'ヒヤリハットの状況説明を入力してください。' },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await image.arrayBuffer());
    const base64 = bytes.toString('base64');
    const mimeType = image.type || 'image/jpeg';

    const analysis = await analyzeHiyariImage({
      imageBase64: base64,
      mimeType,
      incidentDescription,
      illustrationRequest,
    });

    const estimate = calculateHiyariEstimate({
      peopleCount: analysis.peopleCount,
      objectComplexity: analysis.objectComplexity,
      backgroundComplexity: analysis.backgroundComplexity,
      reconstructionNeed: analysis.reconstructionNeed,
      compositionChange: analysis.compositionChange,
      difficultyScore: analysis.difficultyScore,
      quantity,
    });

    const estimateId = `HY-${new Date()
      .toISOString()
      .replace(/\D/g, '')
      .slice(0, 14)}-${Math.floor(1000 + Math.random() * 9000)}`;

    return NextResponse.json({
      estimateId,
      analysis,
      estimate,
      fixedStyle: {
        name: '安全教育カラーイラスト（固定タッチ）',
        outputFormats: ['AI', 'JPG', 'PNG'],
      },
      note:
        'AI概算です。発注申込み後、写真・内容を確認し、制作条件に大きな差がある場合のみご連絡します。',
    });
  } catch (e) {
    console.error('HIYARI_ANALYZE_ERROR:', e);

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : 'AI解析中にエラーが発生しました。',
      },
      { status: 500 }
    );
  }
}
