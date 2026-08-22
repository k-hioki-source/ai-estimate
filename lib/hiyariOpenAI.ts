import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type HiyariAiAnalysis = {
  sceneSummary: string;
  hazardType: string;
  hazardSummary: string;
  illustrationPlan: string;
  peopleCount: number;
  objectComplexity: number;
  backgroundComplexity: number;
  reconstructionNeed: number;
  compositionChange: boolean;
  difficultyScore: number;
  confidence: number;
  confirmationPoints: string[];
};

function clampNumber(
  value: unknown,
  fallback: number,
  min = 0,
  max = 100
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function analyzeHiyariImage({
  imageBase64,
  mimeType,
  incidentDescription,
  illustrationRequest,
}: {
  imageBase64: string;
  mimeType: string;
  incidentDescription: string;
  illustrationRequest: string;
}): Promise<HiyariAiAnalysis> {
  const prompt = `
あなたは製造業・工場向けの安全教育イラスト制作の見積り補助AIです。

目的は事故原因を断定することではありません。
提供された現場写真と説明から、
「安全教育用の固定タッチのカラーイラストを制作する場合の作画工数」
を判定してください。

【固定するイラスト表現】
・製造業の安全教育資料向け
・ベクター調のカラーイラスト
・人物、設備、荷物、工具などを整理して見やすく描く
・線は明瞭
・陰影は控えめ
・背景は安全教育に必要な範囲で簡潔にする
・写実表現ではなく、説明性を優先する
・納品は Illustrator AI / JPG / PNG を想定

【お客様のヒヤリハット説明】
${incidentDescription}

【イラスト化についての希望】
${illustrationRequest || '特になし。写真と説明をもとに、危険状況が伝わる構図に整理する。'}

【重要】
・事故原因を断定しない
・写真から確認できない事実を勝手に追加しない
・不明点は confirmationPoints に入れる
・人物の顔や個人識別情報は制作上必要なければ簡略化する
・安全教育として危険状況が伝わりにくい場合のみ compositionChange=true
・difficultyScore は「作画難易度」
・objectComplexity は機械、設備、車両、工具、荷物などの描写量
・backgroundComplexity は背景設備・工場環境の描写量
・reconstructionNeed は写真に写っていない部分の補完・形状再構成の必要度

JSONのみで返してください。

{
  "sceneSummary": "写真に写っている状況の短い説明",
  "hazardType": "転倒 | 転落 | はさまれ | 巻き込まれ | 衝突 | 接触 | 落下 | 飛来 | 切創 | やけど | その他",
  "hazardSummary": "安全教育イラストで表現すべきヒヤリハット状況",
  "illustrationPlan": "どのような構図・内容でイラスト化するか",
  "peopleCount": 1,
  "objectComplexity": 0,
  "backgroundComplexity": 0,
  "reconstructionNeed": 0,
  "compositionChange": false,
  "difficultyScore": 0,
  "confidence": 0,
  "confirmationPoints": ["制作前に確認したい点"]
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
    sceneSummary:
      typeof parsed.sceneSummary === 'string'
        ? parsed.sceneSummary
        : '現場写真と説明をもとに状況を確認しました。',
    hazardType:
      typeof parsed.hazardType === 'string' ? parsed.hazardType : 'その他',
    hazardSummary:
      typeof parsed.hazardSummary === 'string'
        ? parsed.hazardSummary
        : incidentDescription,
    illustrationPlan:
      typeof parsed.illustrationPlan === 'string'
        ? parsed.illustrationPlan
        : '写真をもとに安全教育向けの固定タッチで整理して描きます。',
    peopleCount: clampNumber(parsed.peopleCount, 1, 0, 20),
    objectComplexity: clampNumber(parsed.objectComplexity, 50),
    backgroundComplexity: clampNumber(parsed.backgroundComplexity, 40),
    reconstructionNeed: clampNumber(parsed.reconstructionNeed, 30),
    compositionChange: parsed.compositionChange === true,
    difficultyScore: clampNumber(parsed.difficultyScore, 55),
    confidence: clampNumber(parsed.confidence, 70),
    confirmationPoints: Array.isArray(parsed.confirmationPoints)
      ? parsed.confirmationPoints.filter((v: unknown) => typeof v === 'string').slice(0, 5)
      : [],
  };
}
