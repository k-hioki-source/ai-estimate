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

    const normalizedMessage = message;

    const forcePartsCatalog =
      normalizedMessage.includes('パーツカタログ') ||
      normalizedMessage.includes('部品カタログ') ||
      normalizedMessage.includes('パーツリスト') ||
      normalizedMessage.includes('部品リスト') ||
      normalizedMessage.includes('部品表');

    const forceReferenceDrawingFromMaterials =
      normalizedMessage.includes('図面') ||
      normalizedMessage.includes('組図') ||
      normalizedMessage.includes('設計図') ||
      normalizedMessage.includes('2D図面') ||
      normalizedMessage.includes('TIFF');

    const forceLineForParts =
      forcePartsCatalog &&
      !normalizedMessage.includes('カラー') &&
      !normalizedMessage.includes('リアル');

    const forcePonchiHomepage =
      (
        normalizedMessage.includes('ポンチ絵') ||
        normalizedMessage.includes('ラフ') ||
        normalizedMessage.includes('手描き')
      ) &&
      (
        normalizedMessage.includes('ホームページ') ||
        normalizedMessage.includes('WEB') ||
        normalizedMessage.includes('Web') ||
        normalizedMessage.includes('サイト')
      );

    const forceReferenceDrawing =
      normalizedMessage.includes('画像から作図') ||
      normalizedMessage.includes('画像を参考に作図') ||
      normalizedMessage.includes('画像をもとに作図') ||
      normalizedMessage.includes('写真を参考に作図') ||
      normalizedMessage.includes('プレゼン用') ||
      normalizedMessage.includes('イメージイラスト') ||
      normalizedMessage.includes('製品説明図') ||
      normalizedMessage.includes('販促用');

    const forceSales =
      normalizedMessage.includes('プレゼン用') ||
      normalizedMessage.includes('イメージイラスト') ||
      normalizedMessage.includes('製品説明図') ||
      normalizedMessage.includes('販促用') ||
      normalizedMessage.includes('ホームページ') ||
      normalizedMessage.includes('WEB') ||
      normalizedMessage.includes('Web') ||
      normalizedMessage.includes('サイト');

    const forceReal =
      normalizedMessage.includes('リアル') ||
      normalizedMessage.includes('リアルな表現') ||
      normalizedMessage.includes('質感') ||
      normalizedMessage.includes('陰影') ||
      normalizedMessage.includes('グラデーション');

    const forcePartsCatalogNotes =
      forcePartsCatalog && forceReferenceDrawingFromMaterials;

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

【制作方法の判定基準】

photo_trace = 写真や既存画像をそのままトレースする作業
reference_drawing = 写真・画像・図面・資料を参考にして新たに説明図やイラストを作図する作業
cad_conversion = XVL・3DCAD・STEP・IGES等から作成する作業

元画像が存在しても、完成イラストを新たに構成する必要がある場合は photo_trace にしない。

【用途判定】

manual = 取扱説明書、作業手順、安全手順、組立説明
parts = パーツカタログ、部品カタログ、パーツリスト、部品リスト、部品表、分解図
sales = 販促資料、製品説明、プレゼン資料、WEB掲載、展示会、広告、パンフレット

【表現判定】

line = 白黒線画
color = カラーイラスト
real = リアルイラスト、写実表現、質感表現、陰影表現、グラデーション表現

reasonは必ず入力文のどの言葉を根拠にしたかを含めて、1〜2文で具体的に説明してください。
例：「図面」と「パーツカタログ」という記載があるため、資料から作図・パーツカタログ用途と判断しました。

【最優先ルール】

「パーツカタログ」「部品カタログ」「部品表」「パーツリスト」「部品リスト」「パーツイラスト」が含まれる場合は usage = parts。

「図面から」「図面をもとに」「2D図面」「組図」「設計図」「TIFF図面」が含まれる場合は sourceType = reference_drawing。

「画像から作図」「画像を参考に作図」「画像をもとに作図」「写真を参考に作図」「写真から説明図」が含まれる場合は sourceType = reference_drawing。

「プレゼン用」「販促用」「イメージイラスト」「製品説明図」「構造説明図」「概念図」「展示会用」「WEB掲載用」「広告用」が含まれる場合は sourceType = reference_drawing、usage = sales。

「リアル」「リアルな表現」「リアルイラスト」「質感」「陰影」「グラデーション」が含まれる場合は style = real。

「カラー」「色付き」「色分け」が含まれる場合は style = color。

「線画」「白黒」「モノクロ」「取説風」「パーツカタログ用」が含まれ、かつ「リアル」「カラー」が含まれない場合は style = line。

ユーザー依頼文：
${message}

notes はユーザー文をそのままコピーしない。
見積りに必要な条件として短く整理して記載する。

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

    const baseNotes = forcePartsCatalogNotes
      ? `支給資料：${getSuppliedMaterials(normalizedMessage)}
用途：パーツカタログ
内容：パーツイラスト
表現：白黒線画`
      : forcePonchiHomepage
        ? `支給資料：ポンチ絵
用途：ホームページ掲載
内容：挿絵・イメージイラスト
表現：カラーイラスト`
        : buildNotesFromMessage(normalizedMessage);

    const finalNotes = `${baseNotes}

【お客様ご入力内容】
${normalizedMessage}`;

    return NextResponse.json({
      sourceType:
        forceReferenceDrawingFromMaterials || forcePonchiHomepage
          ? 'reference_drawing'
          : forceReferenceDrawing
            ? 'reference_drawing'
            : normalizeSourceType(parsed.sourceType),

      usage:
        forcePartsCatalog
          ? 'parts'
          : forcePonchiHomepage
            ? 'sales'
            : forceSales
              ? 'sales'
              : normalizeUsage(parsed.usage),

      style:
        forceLineForParts
          ? 'line'
          : forcePonchiHomepage
            ? 'color'
            : forceReal
              ? 'real'
              : normalizeStyle(parsed.style),

      notes: finalNotes,

      reason:
        typeof parsed.reason === 'string' && parsed.reason.trim()
          ? parsed.reason
          : buildReason(
              normalizedMessage,
              forcePartsCatalog,
              forceReferenceDrawingFromMaterials,
              forceReferenceDrawing,
              forceSales,
              forceReal
            ),
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

function buildNotesFromMessage(message: string) {
  const materials: string[] = [];

  if (message.includes('写真')) materials.push('写真');
  if (message.includes('画像')) materials.push('画像');
  if (message.includes('図面')) materials.push('図面');
  if (message.includes('組図')) materials.push('組図');
  if (message.includes('ポンチ絵')) materials.push('ポンチ絵');
  if (message.includes('ラフ')) materials.push('ラフ');
  if (message.includes('Excel') || message.includes('エクセル')) {
    materials.push('Excelリスト');
  }

  let usage = '未指定';
  if (message.includes('パーツカタログ') || message.includes('部品カタログ')) {
    usage = 'パーツカタログ';
  } else if (message.includes('取扱説明書') || message.includes('取説')) {
    usage = '取扱説明書';
  } else if (
    message.includes('ホームページ') ||
    message.includes('WEB') ||
    message.includes('Web') ||
    message.includes('サイト') ||
    message.includes('プレゼン') ||
    message.includes('販促')
  ) {
    usage = '販促・WEB掲載';
  }

  let content = '未指定';
  if (message.includes('分解図')) content = '分解図';
  else if (message.includes('パーツカタログ')) content = 'パーツイラスト';
  else if (message.includes('製品説明図')) content = '製品説明図';
  else if (message.includes('構造説明図')) content = '構造説明図';
  else if (message.includes('イメージイラスト')) content = 'イメージイラスト';
  else if (message.includes('挿絵')) content = '挿絵';

  let style = '未指定';
  if (message.includes('リアル')) style = 'リアルイラスト';
  else if (message.includes('カラー') || message.includes('色')) {
    style = 'カラーイラスト';
  } else if (
    message.includes('線画') ||
    message.includes('白黒') ||
    message.includes('モノクロ') ||
    message.includes('パーツカタログ')
  ) {
    style = '白黒線画';
  }

  return `支給資料：${materials.length ? materials.join('・') : '未指定'}
用途：${usage}
内容：${content}
表現：${style}`;
}

function getSuppliedMaterials(message: string) {
  const materials: string[] = [];

  if (message.includes('写真')) materials.push('写真');
  if (message.includes('画像')) materials.push('画像');
  if (message.includes('図面')) materials.push('図面');
  if (message.includes('組図')) materials.push('組図');
  if (message.includes('Excel') || message.includes('エクセル')) {
    materials.push('Excelリスト');
  }

  return materials.length ? materials.join('・') : '未指定';
}

function buildReason(
  message: string,
  forcePartsCatalog: boolean,
  forceReferenceDrawingFromMaterials: boolean,
  forceReferenceDrawing: boolean,
  forceSales: boolean,
  forceReal: boolean
) {
  const reasons: string[] = [];

  if (forceReferenceDrawingFromMaterials) {
    reasons.push('図面・組図などの資料から新規作図と判断');
  }

  if (forceReferenceDrawing) {
    reasons.push('説明図・販促用イラストのため資料から作図と判断');
  }

  if (forcePartsCatalog) {
    reasons.push('パーツカタログ用途と判断');
  }

  if (forceSales) {
    reasons.push('販促・WEB・プレゼン用途と判断');
  }

  if (forceReal) {
    reasons.push('リアル表現の指定を検出');
  }

  if (reasons.length === 0) {
    reasons.push('依頼内容から最も近い制作条件を選択');
  }

  return reasons.join('／');
}
