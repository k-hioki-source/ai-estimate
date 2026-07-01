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
  sourceType,
  usage,
  style,
  difficultyScore,
  partDensity,
  lineDifficulty,
  structureComplexity,
  summary,
  hasImage,
  hasNotes,
  workType,
}: {
  sourceType: string;
  usage: string;
  style: string;
  difficultyScore: number;
  partDensity: number;
  lineDifficulty: number;
  structureComplexity: number;
  summary?: string;
  hasImage: boolean;
  hasNotes: boolean;
  workType: string;
}) {
  let score = 50;

  // 画像あり
  if (hasImage) score += 15;

  // 備考あり
  if (hasNotes) score += 5;

  // AIコメントが十分
  if (summary && summary.length > 40) score += 5;

  // 写真トレースは判定しやすい
  if (sourceType === 'photo_trace') score += 10;

  // 線画は判定しやすい
  if (style === 'line') score += 10;

  // 単純形状
  if (difficultyScore <= 45) score += 5;

  // 部品少
  if (partDensity <= 40) score += 5;

  // 構造単純
  if (structureComplexity <= 40) score += 5;

  //------------------------------------
  // 難しい案件は減点
  //------------------------------------

  if (workType === 'concept_diagram') score -= 15;

  if (style === 'real') score -= 8;

  if (usage === 'sales') score -= 5;

  if (partDensity >= 80) score -= 5;

  if (structureComplexity >= 80) score -= 5;

  score = Math.max(55, Math.min(98, score));

  let level = '中';
  let comment =
    '入力内容・参考画像をもとに概算見積りを算出しています。';

  if (score >= 90) {
    level = '高';
    comment =
      '対象物を十分認識できており、概算見積りとして信頼できる結果です。';
  } else if (score >= 75) {
    level = '高';
    comment =
      '入力内容・参考画像をもとに概算見積りとして参考になる結果です。';
  } else if (score < 65) {
    level = '低';
    comment =
      '入力内容によって金額が変わる可能性があります。正式見積りをおすすめします。';
  }

  return {
    score,
    level,
    comment,
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
  sourceType: input.sourceType,
  usage: input.usage,
  style: input.style,
  workType: analysis.workType,

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
    comment: '入力内容・参考画像をもとに概算見積りを算出しています。',
  };
}

  const diffRate = Math.abs(systemHours - aiHours) / aiHours;

  let score = Math.round(100 - diffRate * 100);
  score = Math.max(40, Math.min(98, score));

  let level = '中';
let comment =
  '入力内容・参考画像をもとに、概算見積りとして参考になる結果です。';

  if (
    aiMinHours &&
    aiMaxHours &&
    systemHours >= aiMinHours &&
    systemHours <= aiMaxHours
  ) {
    score = Math.max(score, 88);
    level = '高';
    comment =
  '入力内容・参考画像を十分に認識したうえで、概算見積りとして参考になる結果です。';
  } else if (score >= 85) {
    level = '高';
    comment =
  '入力内容・参考画像をもとに、概算見積りとして参考になる結果です。';
  } else if (score < 65) {
    level = '低';
    comment =
  'AI予想制作時間とシステム算出時間に差があるため、正式見積りでの確認をおすすめします。';
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
        reason: analysis.summary,
        estimatedHoursMin: analysis.estimatedHoursMin,
estimatedHours: analysis.estimatedHours,
estimatedHoursMax: analysis.estimatedHoursMax,
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
