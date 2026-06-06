import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export type SourceType =
  | 'photo_trace'
  | 'reference_drawing'
  | 'cad_conversion';

export type WorkType =
  | 'simple_trace'
  | 'standard_trace'
  | 'technical_drawing'
  | 'realistic_illustration'
  | 'concept_diagram';

export async function analyzeImage({
  imageBase64,
  mimeType,
  sourceType,
  style,
  usage,
  notes,
}: {
  imageBase64: string;
  mimeType?: string;
  sourceType: SourceType;
  style: 'line' | 'color' | 'real';
  usage: 'manual' | 'parts' | 'sales';
  notes?: string;
}) {
  const prompt = `
あなたはテクニカルイラスト制作会社の見積担当です。
画像と入力条件をもとに、制作難易度を判定してください。

【重要】
制作時間や金額は出さないでください。
AIは「難易度スコア」と「作業タイプ」だけを判定します。
見た目の単純さではなく、制作工程の複雑さで判断してください。

【入力条件】
- 制作方法: ${sourceType}
- 用途: ${usage}
- 表現: ${style}
- 備考: ${notes || 'なし'}

【制作方法の意味】
photo_trace：
写真や既存画像をもとに、形状をトレースする作業。
ただし、部品点数が多い場合や線整理が多い場合は難易度を上げる。

reference_drawing：
写真・図面・資料を読み取り、新たに作図する作業。
構造理解、断面、分解図、部品の関係整理が必要な場合は難易度を高くする。

cad_conversion：
XVL・3DCADデータをもとに、線画、3DCG、販促用画像を作成する作業。
形状抽出だけで済む場合は中程度、整理や見せ方の調整が必要な場合は高くする。

【作業タイプ】
simple_trace：
単純な写真トレース。単体部品で形状が簡単。

standard_trace：
写真・画像トレースだが、線整理や細部判断が必要。

technical_drawing：
断面図、分解図、内部構造、部品点数の多い図、構造理解が必要な図。

realistic_illustration：
質感、陰影、グラデーション、リアル表現が必要な図。

concept_diagram：
複数要素を組み合わせ、全体の仕組み・流れ・概念を説明する図。
地形、設備、配管、矢印、流れ、システム全体、レイアウト設計を含むもの。

【重要な判定ルール】
・standard_traceであってもリアル表現の場合は technical_drawing とする。
・単体の工具、部品、パーツを写真からなぞるだけなら technical_drawing にしない。
・ただし、分解図、断面図、内部構造、部品点数が多い場合は technical_drawing とする。
・「分解図」「断面」「内部」「部品点数」「構造理解」が備考にある場合は難易度を上げる。
・「概念図」「フロー」「全体図」「システム」「構成図」「説明図」が備考にある場合は concept_diagram を強く検討する。
・層構造、材質説明、断面説明、単体製品の説明図は concept_diagram ではなく technical_drawing とする。
・concept_diagram は、複数要素や全体構成を説明する場合に限定する。
・リアル表現の場合は realistic_illustration を強く検討するが、単純な部品であれば technical_drawing に留める。

【難易度スコア】
0〜100で評価してください。
50が標準です。

評価基準：
・部品点数
・線の複雑さ
・構造理解の必要性
・断面、分解、内部構造の有無
・レイアウト設計の有無
・リアル表現、質感表現の必要性

JSONのみで出力してください。

{
  "workType": "...",
  "difficultyScore": number,
  "partDensity": number,
  "lineDifficulty": number,
  "structureComplexity": number,

  "isExplodedView": boolean,
  "hasLeaderLines": boolean,
  "hasPartNumbers": boolean,
  "isIndustrialProduct": boolean,
  "summary": string
}

summaryは日本語で簡潔に書いてください。
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
            image_url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`,
            detail: 'auto',
          },
        ],
      },
    ],
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.output_text || '{}');
  } catch {
    parsed = {};
  }

  return {
    workType: normalizeWorkType(parsed.workType),
    difficultyScore: clampNumber(parsed.difficultyScore, 50, 0, 100),
    partDensity: clampNumber(parsed.partDensity, 50, 0, 100),
    lineDifficulty: clampNumber(parsed.lineDifficulty, 50, 0, 100),
    structureComplexity: clampNumber(parsed.structureComplexity, 50, 0, 100),
    isExplodedView: parsed.isExplodedView ?? false,
hasLeaderLines: parsed.hasLeaderLines ?? false,
hasPartNumbers: parsed.hasPartNumbers ?? false,
    isIndustrialProduct: parsed.isIndustrialProduct ?? false,
    summary:
      typeof parsed.summary === 'string'
        ? parsed.summary
        : '画像と条件から難易度を判定しました。',
  };
}

function normalizeWorkType(value: string): WorkType {
  if (value === 'simple_trace') return 'simple_trace';
  if (value === 'standard_trace') return 'standard_trace';
  if (value === 'technical_drawing') return 'technical_drawing';
  if (value === 'realistic_illustration') return 'realistic_illustration';
  if (value === 'concept_diagram') return 'concept_diagram';
  return 'standard_trace';
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
