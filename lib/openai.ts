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

export type AnalyzeImageResult = {
  estimatedHours: number;
  workType: WorkType;
  difficulty: 'easy' | 'standard' | 'medium' | 'hard' | 'very_hard';
  baseDrawingHours: number;
  detailHours: number;
  structureUnderstandingHours: number;
  colorOrRealisticHours: number;
  layoutHours: number;
  partDensity: number;
  lineDifficulty: number;
  structureComplexity: number;
  confidence: number;
  summary: string;
};

export async function analyzeImage({
  imageBase64,
  style,
  usage,
}: {
  imageBase64: string;
  style: 'line' | 'color' | 'real';
  usage: 'manual' | 'parts' | 'sales';
}): Promise<AnalyzeImageResult> {
  const prompt = `
あなたはテクニカルイラスト制作会社の見積担当です。
画像と条件をもとに、制作に必要な「想定制作時間」を見積もってください。

重要：
金額ではなく、プロのイラストレーターが実際に作業する場合の制作時間を推定してください。
制作時間は、ラフ確認・作図・線整理・塗り・質感表現・レイアウト調整を含みます。
ただし、営業対応・打ち合わせ・大幅修正は含めません。

条件：
- 用途: ${usage}
- 表現: ${style}

作業タイプは以下から1つ選んでください。

- simple_trace：単純な写真トレース、部品が少ない、形状が簡単
- standard_trace：写真トレースだが、線整理や細部の判断が必要
- technical_drawing：構造理解が必要な機械・部品・断面図
- realistic_illustration：質感、陰影、グラデーション、リアル表現が必要
- concept_diagram：概念図、全体構成、レイアウト設計、複数要素の説明図

時間感覚の目安：
- simple_trace：0.8〜1.5時間
- standard_trace：1.5〜3時間
- technical_drawing：3〜8時間
- realistic_illustration：6〜18時間
- concept_diagram：15〜40時間

必ずJSONのみで返してください。
summaryは日本語50文字以内。

{
  "estimatedHours": number,
  "workType": "simple_trace" | "standard_trace" | "technical_drawing" | "realistic_illustration" | "concept_diagram",
  "difficulty": "easy" | "standard" | "medium" | "hard" | "very_hard",
  "baseDrawingHours": number,
  "detailHours": number,
  "structureUnderstandingHours": number,
  "colorOrRealisticHours": number,
  "layoutHours": number,
  "partDensity": number,
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

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.output_text || '{}');
  } catch {
    parsed = {};
  }

  const workType = normalizeWorkType(parsed.workType);
  const rawHours = Number(parsed.estimatedHours ?? 2);

  let estimatedHours = rawHours;

  // 作業タイプごとの下限・上限でAIの暴れを抑える
  const range = getHourRange(workType);
  estimatedHours = Math.max(range.min, Math.min(range.max, estimatedHours));

  // 表現補正
  if (style === 'color') {
    estimatedHours *= 1.15;
  }

  if (style === 'real') {
    estimatedHours *= 1.35;
  }

  // 用途補正
  if (usage === 'sales') {
    estimatedHours *= 1.15;
  }

  // 小数0.5時間単位に丸める
  estimatedHours = Math.max(0.8, Math.round(estimatedHours * 2) / 2);

  return {
    estimatedHours,
    workType,
    difficulty: normalizeDifficulty(parsed.difficulty),
    baseDrawingHours: Number(parsed.baseDrawingHours ?? estimatedHours * 0.5),
    detailHours: Number(parsed.detailHours ?? estimatedHours * 0.2),
    structureUnderstandingHours: Number(
      parsed.structureUnderstandingHours ?? estimatedHours * 0.15
    ),
    colorOrRealisticHours: Number(
      parsed.colorOrRealisticHours ?? (style === 'real' ? estimatedHours * 0.25 : 0)
    ),
    layoutHours: Number(parsed.layoutHours ?? 0),
    partDensity: Number(parsed.partDensity ?? 50),
    lineDifficulty: Number(parsed.lineDifficulty ?? 50),
    structureComplexity: Number(parsed.structureComplexity ?? 50),
    confidence: Number(parsed.confidence ?? 0.7),
    summary:
      typeof parsed.summary === 'string'
        ? parsed.summary
        : '画像と条件から制作工数を推定しました。',
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

function normalizeDifficulty(value: string): AnalyzeImageResult['difficulty'] {
  if (value === 'easy') return 'easy';
  if (value === 'standard') return 'standard';
  if (value === 'medium') return 'medium';
  if (value === 'hard') return 'hard';
  if (value === 'very_hard') return 'very_hard';
  return 'standard';
}

function getHourRange(workType: WorkType) {
  if (workType === 'simple_trace') return { min: 0.8, max: 1.5 };
  if (workType === 'standard_trace') return { min: 1.5, max: 3 };
  if (workType === 'technical_drawing') return { min: 3, max: 8 };
  if (workType === 'realistic_illustration') return { min: 6, max: 18 };
  if (workType === 'concept_diagram') return { min: 15, max: 40 };
  return { min: 1.5, max: 3 };
}
