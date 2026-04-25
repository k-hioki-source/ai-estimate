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
  // -----------------------------
  // AIプロンプト（ここが重要）
  // -----------------------------
  const prompt = `
あなたはテクニカルイラスト制作会社の見積担当です。
画像を見て「制作難易度」と「作業内容」を判断してください。

以下の2つを必ず出力してください：

① 複雑さスコア（0〜100）
② 作業タイプ（以下から1つ選択）

- trace（写真トレース・単純な線画）
- normal（通常の作図）
- realistic（リアルイラスト・質感表現）
- concept（概念図・レイアウト・構成設計が必要）

---

判断基準：

■ trace
・シンプル形状
・部品少ない
・トレース中心

■ normal
・一般的な取説・機械図
・適度な部品数

■ realistic
・グラデーション
・質感表現
・陰影あり

■ concept
・全体構成が重要
・複数要素（地形・設備・流れなど）
・説明図・インフォグラフィック

---

以下のJSONで出力してください：

{
  "complexityScore": number,
  "workType": "trace" | "normal" | "realistic" | "concept",
  "partDensity": number,
  "occlusion": number,
  "lineDifficulty": number,
  "structureComplexity": number,
  "summary": string
}
`;

  // -----------------------------
  // OpenAI API呼び出し
  // -----------------------------
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

  // -----------------------------
  // テキスト抽出（新形式対応）
  // -----------------------------
  let text = '';

  for (const item of response.output || []) {
    if (item.type === 'message') {
      for (const c of item.content || []) {
        if (c.type === 'output_text') {
          text += c.text;
        }
      }
    }
  }

  // -----------------------------
  // JSONパース
  // -----------------------------
  let parsed: any = {};
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    console.error('JSON parse error:', text);
    parsed = {};
  }

  // -----------------------------
  // 値取得
  // -----------------------------
  const rawScore = Number(parsed.complexityScore ?? 50);
  const workType = parsed.workType ?? 'normal';
  const partDensity = Number(parsed.partDensity ?? 50);
  const occlusion = Number(parsed.occlusion ?? 50);
  const lineDifficulty = Number(parsed.lineDifficulty ?? 50);
  const structureComplexity = Number(parsed.structureComplexity ?? 50);

  // -----------------------------
  // ★ 補正ロジック（ここがコア）
  // -----------------------------
  let adjustedScore = rawScore;

  // 作業タイプ補正（最重要）
  if (workType === 'trace') adjustedScore *= 0.6;
  if (workType === 'normal') adjustedScore *= 1.0;
  if (workType === 'realistic') adjustedScore *= 1.3;
  if (workType === 'concept') adjustedScore *= 1.6;

  // スタイル補正
  if (style === 'line' && rawScore <= 40 && partDensity <= 45) {
    adjustedScore *= 0.7;
  }

  if (style === 'color') {
    adjustedScore *= 1.05;
  }

  if (style === 'real') {
    adjustedScore *= 1.2;
  }

  // 用途補正
  if (usage === 'sales') {
    adjustedScore *= 1.15;
  }

  // 構造難易度
  if (structureComplexity >= 70) {
    adjustedScore *= 1.2;
  }

  // 部品密度
  if (partDensity >= 70) {
    adjustedScore *= 1.1;
  }

  // 最終整形
  adjustedScore = Math.max(10, Math.min(100, Math.round(adjustedScore)));

  // -----------------------------
  // return
  // -----------------------------
  return {
    complexityScore: adjustedScore,
    workType,
    partDensity,
    occlusion,
    lineDifficulty,
    structureComplexity,
    confidence: Number(parsed.confidence ?? 0.7),
    summary: parsed.summary ?? '',
  };
}
