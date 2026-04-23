import OpenAI from 'openai';
import type { VisionScore } from './pricing';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function analyzeImage(base64DataUrl: string, style: string): Promise<VisionScore> {
  const prompt = `
あなたは機械・工業イラストの概算見積り補助AIです。
画像を見て、イラスト化の見積りに効く複雑さを0〜100で評価してください。
背景ではなく対象物を優先して評価してください。
以下のJSONのみを返してください。
{
  "subjectType": "string",
  "complexityScore": 0,
  "partDensity": 0,
  "occlusion": 0,
  "lineDifficulty": 0,
  "realismRequirement": 0,
  "structureComplexity": 0,
  "confidence": 0,
  "reason": "string"
}
補足:
- style は ${style}
- confidence は 0〜1
- complexityScore は見積り観点の総合スコア
- reason は日本語1文で簡潔に
`.trim();

  const response = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'あなたは機械イラスト案件の見積り支援AIです。必ずJSONのみ返してください。'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: base64DataUrl } }
        ]
      }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('AIの解析結果を取得できませんでした。');
  }

  const parsed = JSON.parse(content) as VisionScore;
  return parsed;
}
