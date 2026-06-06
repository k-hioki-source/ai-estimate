
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: '依頼内容を入力してください。' },
        { status: 400 }
      );
    }

    const prompt = `
あなたはテクニカルイラスト制作会社の見積りフォーム入力支援AIです。
ユーザーの依頼文から、最適なフォーム項目を提案してください。

選択肢は必ず以下から選んでください。

sourceType:
- photo_trace
- reference_drawing
- cad_conversion

usage:
- manual
- parts
- sales

style:
- line
- color
- real

判断基準：
photo_trace = 写真や既存画像をトレースする
reference_drawing = 写真・図面・資料から作図する
cad_conversion = XVL・3DCADから作成する

manual = 取扱説明書
parts = パーツカタログ
sales = 販促・WEB・広告・プレゼン用

line = 白黒線画
color = カラーイラスト
real = リアルイラスト

ユーザー依頼文：
${message}

JSONのみで返してください。

{
  "sourceType": "photo_trace" | "reference_drawing" | "cad_conversion",
  "usage": "manual" | "parts" | "sales",
  "style": "line" | "color" | "real",
  "notes": string,
  "reason": string
}
`;

    const response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt,
    });

    let parsed: any = {};

    try {
      parsed = JSON.parse(response.output_text || '{}');
    } catch {
      parsed = {};
    }

    return NextResponse.json({
      sourceType: normalizeSourceType(parsed.sourceType),
      usage: normalizeUsage(parsed.usage),
      style: normalizeStyle(parsed.style),
      notes: parsed.notes || message,
      reason: parsed.reason || '依頼内容からフォーム項目を提案しました。',
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'フォーム提案中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}

function normalizeSourceType(value: string) {
  if (value === 'reference_drawing') return 'reference_drawing';
  if (value === 'cad_conversion') return 'cad_conversion';
  return 'photo_trace';
}

function normalizeUsage(value: string) {
  if (value === 'parts') return 'parts';
  if (value === 'sales') return 'sales';
  return 'manual';
}

function normalizeStyle(value: string) {
  if (value === 'color') return 'color';
  if (value === 'real') return 'real';
  return 'line';
}
