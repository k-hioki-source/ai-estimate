import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function analyzeImage({
  imageBase64,
  style,
  usage,
}: {
  imageBase64: string;
  style: 'line' | 'color' | 'real';
  usage: 'manual' | 'parts' | 'sales';
}) {
  const prompt = `
あなたはテクニカルイラスト制作会社の見積担当です。
画像を見て「制作難易度」と「作業内容」を判断してください。

重要：
見た目の派手さではなく、実際の制作工数で判定してください。
単純なトレースは低く、概念図・構成設計が必要なものは高くしてください。

作業タイプは以下から1つ選択してください。

- trace（写真トレース・単純な線画）
- normal（通常の作図）
- realistic（リアルイラスト・質感表現）
- concept（概念図・レイアウト・構成設計が必要）

JSONのみで出力してください。

{
  "complexityScore": number,
  "workType": "trace" | "normal" | "realistic" | "concept",
  "partDensity": number,
  "occlusion": number,
  "lineDifficulty": number,
  "structureComplexity": number,
  "confidence": number,
  "summary": string
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
            image_url: `data:image/jpeg;base64,${imageBase64}`,
            detail: 'auto',
          },
        ],
      },
    ],
  });

  let text = response.output_text || '';

  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('JSON parse error:', text);
    parsed = {};
  }

  const rawScore = Number(parsed.complexityScore ?? 50);
  const workType = parsed.workType ?? 'normal';
  const partDensity = Number(parsed.partDensity ?? 50);
  const occlusion = Number(parsed.occlusion ?? 50);
  const lineDifficulty = Number(parsed.lineDifficulty ?? 50);
  const structureComplexity = Number(parsed.structureComplexity ?? 50);
  const confidence = Number(parsed.confidence ?? 0.7);

  let adjustedScore = rawScore;

  // 作業タイプ補正：強すぎると価格が暴れるので弱め
  if (workType === 'trace') adjustedScore *= 0.6;
  if (workType === 'normal') adjustedScore *= 1.0;
  if (workType === 'realistic') adjustedScore *= 1.15;
  if (workType === 'concept') adjustedScore *= 1.25;

  // スタイル補正
  if (style === 'line' && rawScore <= 40 && partDensity <= 45) {
    adjustedScore *= 0.7;
  }

  if (style === 'color') {
    adjustedScore *= 1.03;
  }

  if (style === 'real') {
    adjustedScore *= 1.08;
  }

  // 用途補正
  if (usage === 'sales') {
    adjustedScore *= 1.05;
  }

  // 密度・構造補正
  if (partDensity >= 70) adjustedScore *= 1.05;
  if (structureComplexity >= 70) adjustedScore *= 1.08;

  // 100張り付き防止
  // 作業タイプごとの最低スコア保証
if (workType === 'trace') {
  adjustedScore = Math.min(adjustedScore, 35);
}

if (workType === 'normal') {
  adjustedScore = Math.max(adjustedScore, 30);
}

if (workType === 'realistic') {
  adjustedScore = Math.max(adjustedScore, 55);
}

if (workType === 'concept') {
  adjustedScore = Math.max(adjustedScore, 80);
}

// 100張り付き防止
adjustedScore = Math.max(10, Math.min(90, Math.round(adjustedScore)));

  return {
  rawComplexityScore: rawScore,
  workType,
  partDensity,
  occlusion,
  lineDifficulty,
  structureComplexity,
  confidence,
  summary: parsed.summary ?? '',
};
}
