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
あなたはテクニカルイラスト制作会社の見積担当です。
画像と条件をもとに「制作工数（時間）」を現実的に見積もってください。

【重要】
見た目ではなく、実際の制作作業時間で判断してください。

条件：
- 用途: ${usage}
- 表現: ${style}
- 備考: ${notes || 'なし'}

---

■作業タイプ定義（必ずどれか1つ）

simple_trace：
・単純な写真トレース
・形状が単純、部品少ない

standard_trace：
・写真トレースだが判断が必要
・線整理、微妙な形状調整あり

technical_drawing：
・断面図、内部構造
・構造理解が必要

realistic_illustration：
・質感、陰影、グラデーション
・リアルな見た目重視

concept_diagram：
・複数要素（地形、設備、流れ）
・レイアウト設計が必要
・説明図、インフォグラフィック

---

■超重要ルール（ここで精度が決まる）

・単体の部品 → trace系
・構造説明 → technical_drawing
・リアル表現 → realistic
・全体説明図（海、工場、流れ、矢印など）→ concept_diagram

※ concept_diagram は見た目がシンプルでも必ず高工数

---

■時間目安（厳守）

simple_trace：0.8〜1.5時間
standard_trace：1.5〜3時間
technical_drawing：3〜8時間
realistic_illustration：6〜18時間
concept_diagram：20〜40時間

※ concept_diagram は20時間未満にしない

---

■出力（JSONのみ）

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

summaryは日本語50文字以内で簡潔に説明
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

  let estimatedHours = Number(parsed.estimatedHours ?? 2);

  // -------------------------
  // 下限・上限で暴れ防止
  // -------------------------
  const range = getHourRange(workType);

  estimatedHours = Math.max(range.min, Math.min(range.max, estimatedHours));

  // -------------------------
  // 補正（軽め）
  // -------------------------
  if (style === 'color') estimatedHours *= 1.05;
  if (style === 'real') estimatedHours *= 1.25;
  if (usage === 'sales') estimatedHours *= 1.15;

  // 0.5h単位丸め
  estimatedHours = Math.max(0.8, Math.round(estimatedHours * 2) / 2);

  return {
    estimatedHours,
    workType,
    difficulty: normalizeDifficulty(parsed.difficulty),
    baseDrawingHours: Number(parsed.baseDrawingHours ?? estimatedHours * 0.5),
    detailHours: Number(parsed.detailHours ?? estimatedHours * 0.2),
    structureUnderstandingHours: Number(
      parsed.structureUnderstandingHours ?? estimatedHours * 0.2
    ),
    colorOrRealisticHours: Number(
      parsed.colorOrRealisticHours ?? (style === 'real' ? estimatedHours * 0.3 : 0)
    ),
    layoutHours: Number(
      parsed.layoutHours ??
        (workType === 'concept_diagram' ? estimatedHours * 0.3 : 0)
    ),
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

// -------------------------
// ユーティリティ
// -------------------------

function normalizeWorkType(value: string): WorkType {
  if (value === 'simple_trace') return 'simple_trace';
  if (value === 'standard_trace') return 'standard_trace';
  if (value === 'technical_drawing') return 'technical_drawing';
  if (value === 'realistic_illustration') return 'realistic_illustration';
  if (value === 'concept_diagram') return 'concept_diagram';
  return 'standard_trace';
}

function normalizeDifficulty(value: string) {
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
  if (workType === 'technical_drawing') return { min: 2.5, max: 6 };
  if (workType === 'realistic_illustration') return { min: 6, max: 18 };
  if (workType === 'concept_diagram') return { min: 20, max: 40 };
  return { min: 1, max: 3 };
}
