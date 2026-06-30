import { sendNotificationEmail } from '../../../lib/email';
import { NextRequest, NextResponse } from 'next/server';
import { analyzeImage } from '../../../lib/openai';
import { calculateEstimate } from '../../../lib/pricing';
import fs from 'fs/promises';
import path from 'path';

function getString(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

function getStyle(value: string): 'line' | 'color' | 'real' {
  if (value === 'color') return 'color';
  if (value === 'real') return 'real';
  return 'line';
}

function getUsage(value: string): 'manual' | 'parts' | 'sales' {
  if (value === 'parts') return 'parts';
  if (value === 'sales') return 'sales';
  return 'manual';
}

function getSourceType(
  value: string
): 'photo_trace' | 'reference_drawing' | 'cad_conversion' {
  if (value === 'reference_drawing') return 'reference_drawing';
  if (value === 'cad_conversion') return 'cad_conversion';
  return 'photo_trace';
}

function calculateConfidence({
  difficultyScore,
  partDensity,
  lineDifficulty,
  structureComplexity,
  summary,
  hasImage,
  hasNotes,
}: {
  difficultyScore: number;
  partDensity: number;
  lineDifficulty: number;
  structureComplexity: number;
  summary?: string;
  hasImage: boolean;
  hasNotes: boolean;
}) {
  let score = 70;

  if (hasImage) score += 10;
  if (hasNotes) score += 5;

  if (summary && summary.length >= 20) score += 5;

  const spread = Math.max(
    partDensity,
    lineDifficulty,
    structureComplexity
  ) - Math.min(
    partDensity,
    lineDifficulty,
    structureComplexity
  );

  if (spread <= 25) score += 5;
  if (spread >= 50) score -= 10;

  if (difficultyScore >= 40 && difficultyScore <= 80) score += 3;
  if (difficultyScore >= 90) score -= 5;

  score = Math.max(40, Math.min(95, score));

  let level = '中';
  let comment = '概算見積りとして参考になる結果です。';

  if (score >= 80) {
    level = '高';
    comment = '対象物を認識できており、概算見積りとして十分参考になる結果です。';
  } else if (score < 65) {
    level = '低';
    comment = '参考情報が少ないため、正式見積りでは金額が変わる可能性があります。';
  }

  return {
    score,
    level,
    comment,
    tips: [
      '参考画像を追加',
      '使用用途を詳しく入力',
      '希望する表現方法を指定',
    ],
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get('image') as File | null;
const sampleImagePath = getString(form.get('sampleImagePath'));

let mimeType = 'image/jpeg';
let base64 = '';
let attachmentFileName = 'sample.jpg';

if (file && file.size > 0) {
  mimeType = file.type || 'image/jpeg';
  const bytes = Buffer.from(await file.arrayBuffer());
  base64 = bytes.toString('base64');
  attachmentFileName = file.name || 'image.jpg';
} else if (sampleImagePath) {
  const safeSamplePath = sampleImagePath.replace(/^\/+/, '');

  const fullPath = path.join(process.cwd(), 'public', safeSamplePath);

  const bytes = await fs.readFile(fullPath);
  base64 = bytes.toString('base64');

  if (sampleImagePath.endsWith('.png')) {
    mimeType = 'image/png';
  } else if (sampleImagePath.endsWith('.webp')) {
    mimeType = 'image/webp';
  } else {
    mimeType = 'image/jpeg';
  }

  attachmentFileName = path.basename(sampleImagePath);
} else {
  return NextResponse.json(
    { error: '参考画像またはサンプル画像を選択してください' },
    { status: 400 }
  );
}

    // -----------------------------
    // 入力
    // -----------------------------
    
      const input = {
      sourceType: getSourceType(getString(form.get('sourceType'))),
      usage: getUsage(getString(form.get('usage'))),
      style: getStyle(getString(form.get('style'))),
      quantity: Number(getString(form.get('quantity')) || '1'),
      notes: getString(form.get('notes')),

      // ★ フロントエラー防止用
      requestFormalQuote: ['true', 'yes', 'on'].includes(
        getString(form.get('requestFormalQuote'))
      ),
    };

    // -----------------------------
    // AI解析（分類＋難易度）
    // -----------------------------
    const rawAnalysis = await analyzeImage({
  imageBase64: base64,
  mimeType,
  sourceType: input.sourceType,
  style: input.style,
  usage: input.usage,
  notes: input.notes,
});

const analysis = {
  ...rawAnalysis,
};

// ------------------------
// 備考による補正（ここ追加）
// ------------------------

if (
  input.notes.includes('分解') ||
  input.notes.includes('断面') ||
  input.notes.includes('内部')
) {
  analysis.structureComplexity += 20;
}

const partMatch = input.notes.match(/(\d+)点/);

if (partMatch) {
  const parts = Number(partMatch[1]);

  if (parts >= 10) {
    analysis.partDensity += 20;
  }

  if (parts >= 20) {
    analysis.partDensity += 40;
  }
}    

    // ★ここ追加
let workType = analysis.workType;

    const conceptWords = ['概念図', 'システム図', '構成図', '製品説明図', '説明図', 'フロー図'];

const isConceptRequest =
  conceptWords.some((word) => input.notes.includes(word)) ||
  (input.usage === 'sales' && input.style === 'real' && analysis.partDensity >= 60);

if (isConceptRequest) {
  workType = 'concept_diagram';
  analysis.difficultyScore = Math.max(analysis.difficultyScore, 85);
  analysis.partDensity = Math.max(analysis.partDensity, 70);
  analysis.lineDifficulty = Math.max(analysis.lineDifficulty, 70);
  analysis.structureComplexity = Math.max(analysis.structureComplexity, 80);
}

if (
  input.notes.includes('概念') ||
  input.notes.includes('フロー') ||
  input.notes.includes('全体')
) {
  workType = 'concept_diagram';
}

// ------------------------
// technical補正
// ------------------------
if (workType === 'technical_drawing') {
  if (analysis.structureComplexity < 45) {
    workType = 'standard_trace';
  } else {
    workType = 'technical_drawing';
  }
}

// ------------------------
// リアル判定の過剰評価補正
// アイソメ・フラット系の軽いカラーイラストを
// realistic_illustration から外す
// ------------------------
if (
  workType === 'realistic_illustration' &&
  analysis.difficultyScore <= 70 &&
  analysis.summary &&
  !analysis.summary.includes('質感') &&
  !analysis.summary.includes('金属感') &&
  !analysis.summary.includes('反射') &&
  !analysis.summary.includes('写実')
) {
  workType = 'technical_drawing';
  analysis.difficultyScore = Math.min(analysis.difficultyScore, 55);
}

const reasonText = analysis.summary || '';

let minimumHours = 0;

if (
  reasonText.includes('オートバイ') ||
  reasonText.includes('バイク') ||
  reasonText.includes('自転車')
) {
  minimumHours = 2.5;
}
    
    // -----------------------------
    // 見積計算（固定ロジック）
    // -----------------------------
 const estimate = calculateEstimate({
  sourceType: input.sourceType,
  usage: input.usage,
  style: input.style,
  difficultyScore: analysis.difficultyScore,
  partDensity: analysis.partDensity,
  lineDifficulty: analysis.lineDifficulty,
  structureComplexity: analysis.structureComplexity,
  isExplodedView: analysis.isExplodedView,
  hasLeaderLines: analysis.hasLeaderLines,
  hasPartNumbers: analysis.hasPartNumbers,
  quantity: input.quantity,
  isIndustrialProduct: analysis.isIndustrialProduct,
  description: input.notes,
  notes: input.notes,
});
const estimateMatch = calculateEstimateMatch({
  systemHours: estimate.hours,
  aiMinHours: analysis.estimatedHoursMin,
  aiHours: analysis.estimatedHours,
  aiMaxHours: analysis.estimatedHoursMax,
});
const confidence = calculateConfidence({
  difficultyScore: analysis.difficultyScore,
  partDensity: analysis.partDensity,
  lineDifficulty: analysis.lineDifficulty,
  structureComplexity: analysis.structureComplexity,
  summary: analysis.summary,
  hasImage: !!base64,
  hasNotes: !!input.notes,
});


if (minimumHours > 0 && estimate.hours < minimumHours) {
  estimate.hours = minimumHours;
  estimate.unitPrice = Math.round(minimumHours * 3000 / 100) * 100;
  estimate.totalPrice = estimate.unitPrice;
}

    function calculateEstimateMatch({
  systemHours,
  aiMinHours,
  aiHours,
  aiMaxHours,
}: {
  systemHours: number;
  aiMinHours?: number;
  aiHours?: number;
  aiMaxHours?: number;
}) {
  if (!aiHours || aiHours <= 0) {
    return {
      score: 70,
      level: '中',
      comment: 'AI予想制作時間が不足しているため、概算見積りとして参考値です。',
    };
  }

  const diffRate = Math.abs(systemHours - aiHours) / aiHours;

  let score = Math.round(100 - diffRate * 100);
  score = Math.max(40, Math.min(98, score));

  let level = '中';
  let comment = 'AI予想制作時間とシステム算出時間にやや差があります。';

  if (
    aiMinHours &&
    aiMaxHours &&
    systemHours >= aiMinHours &&
    systemHours <= aiMaxHours
  ) {
    score = Math.max(score, 88);
    level = '高';
    comment = 'AI予想制作時間の範囲内に収まっており、概算見積りとして参考になる結果です。';
  } else if (score >= 85) {
    level = '高';
    comment = 'AI予想制作時間とシステム算出時間が近く、概算見積りとして参考になる結果です。';
  } else if (score < 65) {
    level = '低';
    comment = 'AI予想制作時間とシステム算出時間に差があるため、正式見積りでの確認をおすすめします。';
  }

  return {
    score,
    level,
    comment,
  };
}
    
    // -----------------------------
    // レスポンス
    // -----------------------------
    await sendNotificationEmail({
  company: getString(form.get('companyName')),
  name: getString(form.get('customerName')),
  email: getString(form.get('email')),
  usage: input.usage,
  sourceType: input.sourceType,
  style: input.style,
  quantity: input.quantity,
  notes: input.notes,
  complexityScore: analysis.difficultyScore,
  totalPrice: estimate.totalPrice,
  requestFormalQuote: input.requestFormalQuote,

  workType: workType,
estimatedHours: estimate.hours,
  
  aiReason: analysis.summary || '',
  confidenceScore: confidence.score,
confidenceLevel: confidence.level,
confidenceComment: confidence.comment,
  imageAttachment: {
  filename: attachmentFileName,
  content: base64,
},
});
    return NextResponse.json({
      // ★ フロント互換（これが無いと落ちる）
      input: {
        requestFormalQuote: input.requestFormalQuote,
        estimateMatch,
      },

      // ▼ AI判定
      vision: {
        subjectType: workType,
        complexityScore: analysis.difficultyScore,
        partDensity: analysis.partDensity,
        lineDifficulty: analysis.lineDifficulty,
        structureComplexity: analysis.structureComplexity,
        confidence: 0.7,
        estimatedHoursMin: analysis.estimatedHoursMin,
estimatedHours: analysis.estimatedHours,
estimatedHoursMax: analysis.estimatedHoursMax,
        reason: analysis.summary,
      },

      // ▼ 見積
      estimate: {
        total: estimate.totalPrice,
        subtotal: estimate.unitPrice,
        sourceType: input.sourceType,
        deliveryDays: '3〜5営業日',
        basePrice: estimate.unitPrice,
        hourlyRate: estimate.hourlyRate,

        // ★ フロント表示用
        estimatedHours: estimate.hours,
        adjustedHours: estimate.hours,

        quantity: input.quantity,
      },
      confidence,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: '解析中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
