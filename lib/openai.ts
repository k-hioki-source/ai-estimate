import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export type WorkType =
  | 'simple_trace'
  | 'standard_trace'
  | 'technical_drawing'
  | 'realistic_illustration'
  | 'concept_diagram';

export async function analyzeImage({
  imageBase64,
  style,
  usage,
  notes,
}: {
  imageBase64: string;
  style: 'line' | 'color' | 'real';
  usage: 'manual' | 'parts' | 'sales';
  notes?: string;
}) {
  const prompt = `
画像からテクニカルイラスト制作の難易度を判定してください。

【重要】
制作時間ではなく、難易度と作業タイプのみ判定すること。

■作業タイプ
simple_trace / standard_trace / technical_drawing / realistic_illustration / concept_diagram

■難易度スコア
0〜100で評価（50が標準）

判断基準：
・部品数
・線の複雑さ
・構造理解の必要性
・レイアウト設計の有無

【最重要ルール】

以下に該当する場合は必ず concept_diagram に分類すること：

・複数の要素（地形、設備、配管、矢印、流れ）を組み合わせて説明している
・全体の仕組みや流れを示す図
・プレゼン資料、概念図、システム説明図
・レイアウト設計が必要な構成

※見た目がシンプルでも、説明図であれば concept_diagram とする

備考: ${notes || 'なし'}

※備考に以下のワードが含まれる場合は必ず concept_diagram にする：
「概念図」「フロー」「全体図」「システム」「構成図」「説明図」

JSONのみで出力：

{
  "workType": "...",
  "difficultyScore": number,
  "partDensity": number,
  "lineDifficulty": number,
  "structureComplexity": number,
  "summary": string
}

summaryは日本語で簡潔に
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
  image_url: `data:image/jpeg;base64,${imageBase64}`,
  detail: 'auto',
}
        ],
      },
    ],
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.output_text || '{}');
  } catch {}

  return {
    workType: parsed.workType || 'standard_trace',
    difficultyScore: parsed.difficultyScore ?? 50,
    partDensity: parsed.partDensity ?? 50,
    lineDifficulty: parsed.lineDifficulty ?? 50,
    structureComplexity: parsed.structureComplexity ?? 50,
    summary: parsed.summary || '判定結果',
  };
}
