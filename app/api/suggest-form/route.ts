
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
photo_trace = 写真や既存画像をそのままトレースする

reference_drawing = 写真・画像・図面・資料を参考にして
新たに説明図やイラストを作成する

リアルイラスト
販促用イメージイラスト
製品説明図
プレゼン資料用イラスト
WEB掲載用イラスト
展示会用イラスト

これらは元画像が存在しても
reference_drawing を優先する

cad_conversion = XVL・3DCADから作成する

manual = 取扱説明書
parts = パーツカタログ
sales = 販促・WEB・広告・プレゼン用

【用途判定ルール】

製品説明図 → sales
構造説明図 → sales
システム説明図 → sales
プレゼン資料 → sales
展示会パネル → sales

取扱説明書 → manual
作業手順 → manual
安全手順 → manual

パーツカタログ → parts
分解図 → parts
部品表 → parts

line = 白黒線画
color = カラーイラスト
real = リアルイラスト

【最優先の仕分けルール】

「パーツカタログ」「部品カタログ」「部品表」「パーツリスト」「部品リスト」「パーツイラスト」
という語が含まれる場合は、必ず usage = parts とする。

「図面から」「図面をもとに」「2D図面」「組図」「設計図」「TIFF図面」
という語が含まれる場合は、必ず sourceType = reference_drawing とする。

以下の場合は sourceType = reference_drawing とする

・プレゼン用
・販促用
・イメージイラスト
・製品説明図
・概念図
・展示会用
・WEB掲載用
・広告用
・リアルイラスト

元画像が存在しても、
完成イラストを新たに構成する必要があるため
photo_trace にしない

「線画」「白黒」「モノクロ」「取説風」「パーツカタログ用」
という語が含まれる場合は、style = line を優先する。

例：
ユーザー文：
「図面からパーツカタログ用のイラストを描いて」

正しい出力：
{
  "sourceType": "reference_drawing",
  "usage": "parts",
  "style": "line",
  "notes": "支給資料：図面\n用途：パーツカタログ\n内容：パーツカタログ用イラスト\n表現：白黒線画",
  "reason": "図面をもとに作図するため制作方法は資料から作図、パーツカタログ用のため用途はパーツカタログと判断しました。"
}

ユーザー依頼文：
${message}

notesは、ユーザー文をそのままコピーしないでください。
見積りに必要な制作条件として、箇条書き風に短く整理してください。

例：
ユーザー文：
「図面と写真があります。パーツカタログ用の分解図を白黒線画で作りたいです。」

notes：
「支給資料：図面・写真
用途：パーツカタログ
内容：分解図
表現：白黒線画」

JSONのみで返してください。

reasonは選択理由を1〜2文で説明してください。
notesは整理された制作条件にしてください。

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
      notes:
  typeof parsed.notes === 'string' && parsed.notes.trim()
    ? parsed.notes
    : `依頼内容：${message}`,
      
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
