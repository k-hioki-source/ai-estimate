import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type AnalyzeImageInput = {
  imageDataUrl: string;
  usage?: string;
  style?: string;
  size?: string;
  notes?: string;
};

export type AnalyzeImageResult = {
  complexityScore: number;
  partDensity: number;
  occlusion: number;
  lineDifficulty: number;
  realismRequirement: number;
  structureComplexity: number;
  confidence: number;
  summary: string;
};

export async function analyzeImage(
  input: AnalyzeImageInput
): Promise<AnalyzeImageResult> {
  const prompt = `
あなたは機械・工業イラスト案件の見積り補助AIです。
入力画像を見て、見積り用の複雑さを0〜100で評価してください。

評価軸:
- complexityScore
- partDensity
- occlusion
- lineDifficulty
- realismRequirement
- structureComplexity
- confidence

追加情報:
- 用途: ${input.usage ?? ''}
- 表現: ${input.style ?? ''}
- サイズ: ${input.size ?? ''}
- 備考: ${input.notes ?? ''}

JSONのみで返してください。
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
            image_url: input.imageDataUrl,
          },
        ],
      },
    ],
  });

  const text =
    response.output_text ||
    '{"complexityScore":50,"partDensity":50,"occlusion":50,"lineDifficulty":50,"realismRequirement":50,"structureComplexity":50,"confidence":0.7,"summary":"標準的な難易度"}';

  let parsed: Partial<AnalyzeImageResult> = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }

  return {
    complexityScore: Number(parsed.complexityScore ?? 50),
    partDensity: Number(parsed.partDensity ?? 50),
    occlusion: Number(parsed.occlusion ?? 50),
    lineDifficulty: Number(parsed.lineDifficulty ?? 50),
    realismRequirement: Number(parsed.realismRequirement ?? 50),
    structureComplexity: Number(parsed.structureComplexity ?? 50),
    confidence: Number(parsed.confidence ?? 0.7),
    summary: String(parsed.summary ?? '標準的な難易度'),
  };
}
