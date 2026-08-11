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

type ConsultationCategory =
  | 'powerpoint'
  | 'audio'
  | '3dcg_modeling'
  | 'animation'
  | 'video_editing'
  | 'interactive_content'
  | 'combined_production'
  | null;

function detectConsultationRequest(
  notes: string,
  aiDecision?: {
    requiresConsultation?: boolean;
    consultationCategory?: ConsultationCategory;
    consultationReason?: string;
  }
) {
  const text = notes.toLowerCase();
  const has = (...words: string[]) => words.some((word) => text.includes(word));

  const matches: Array<{ category: Exclude<ConsultationCategory, null>; matched: boolean }> = [
    {
      category: 'powerpoint',
      matched:
        has('powerpoint', 'パワーポイント', 'スライドショー') &&
        has('作りたい', '作成', '制作', 'デザイン', '構成'),
    },
    {
      category: 'audio',
      matched: has('ナレーション', 'セリフ', '音声収録', '音声編集', '音声を付け', '音声付き'),
    },
    {
      category: '3dcg_modeling',
      matched: has('3dcgモデリング', '3dモデリング', 'モデリングして', '3dモデル制作', '3dcgモデル制作'),
    },
    {
      category: 'animation',
      matched: has('3dcgアニメーション', '3dアニメーション', '2dアニメーション', '回転アニメーション', 'モーション制作', 'アニメーション制作'),
    },
    {
      category: 'video_editing',
      matched: has('動画編集', '映像制作', 'ビデオ編集', '動画制作'),
    },
    {
      category: 'interactive_content',
      matched: has('インタラクティブ', 'webgl', '操作可能な3d', '操作できる3d', 'ブラウザで回転'),
    },
  ];

  const matched = matches.filter((item) => item.matched);
  const required = matched.length > 0 || aiDecision?.requiresConsultation === true;
  const category: ConsultationCategory =
    matched.length >= 2
      ? 'combined_production'
      : matched[0]?.category || aiDecision?.consultationCategory || null;

  return {
    required,
    category,
    message: required
      ? aiDecision?.consultationReason ||
        '対応可能な内容ですが、制作範囲・点数・尺・音声・納品形式などによって費用が大きく変わるため、詳しい仕様を確認のうえ個別にお見積りいたします。'
      : '',
  };
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
  if (workType === '3d_conversion') score -= 10;

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

  const points: string[] = [];

if (sourceType === 'photo_trace') points.push('写真・画像トレース');
if (sourceType === 'reference_drawing') points.push('資料から作図');
if (sourceType === 'cad_conversion') points.push('3D CADデータ活用');

if (usage === 'manual') points.push('取扱説明書向け');
if (usage === 'parts') points.push('パーツカタログ向け');
if (usage === 'sales') points.push('販促・WEB向け');

if (style === 'line') points.push('白黒線画');
if (style === 'color') points.push('カラーイラスト');
if (style === 'real') points.push('リアル表現');

if (partDensity >= 60) points.push('部品・要素数が多い');
if (lineDifficulty >= 60) points.push('線の整理が必要');
if (structureComplexity >= 60) points.push('構造理解が必要');
if (workType === 'concept_diagram') points.push('概念図・構成図');
if (workType === 'realistic_illustration') points.push('質感・陰影表現');
if (workType === '3d_conversion') points.push('2D図面から立体化');
  
  return {
  score,
  level,
  comment,
  points: points.slice(0, 5),
};
}

function detectRequestedIllustrationCount(
  notes: string,
  formQuantity: number
): number {
  const normalized = notes
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
    .toLowerCase();

  const patterns = [
    /(\d+)\s*枚\s*の?\s*イラスト/,
    /イラスト\s*(\d+)\s*枚/,
    /(\d+)\s*点\s*の?\s*イラスト/,
    /イラスト\s*(\d+)\s*点/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const count = Number(match[1]);
    if (Number.isFinite(count) && count >= 1 && count <= 20) {
      return Math.max(formQuantity, count);
    }
  }

  return formQuantity;
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

    // 備考内に「2枚のイラスト」「3点のイラスト」など点数が明記されている場合は、
    // フォーム上の数量1より依頼文の点数を優先する。
    input.quantity = detectRequestedIllustrationCount(
      input.notes,
      input.quantity
    );

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

const consultation = detectConsultationRequest(input.notes, rawAnalysis);

// 要相談案件でも、PowerPoint・音声・動画などに使用する
// イラスト制作部分を切り分けられる場合は参考価格を案内する。
// 3DCGモデリングそのものが中心の案件は、誤解を避けるため表示しない。
const showIllustrationReferencePrice =
  consultation.required &&
  consultation.category !== '3dcg_modeling';

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

const normalizedNotes = input.notes
  .toLowerCase()
  .replace(/[３]/g, '3')
  .replace(/[２]/g, '2')
  .replace(/ｄ/g, 'd')
  .replace(/Ｄ/g, 'd');

const is3DConversionRequest =
  normalizedNotes.includes('2d図面から') ||
  normalizedNotes.includes('pdf図面から') ||
  normalizedNotes.includes('図面から3d') ||
  normalizedNotes.includes('3d組立図') ||
  normalizedNotes.includes('3d部品図') ||
  normalizedNotes.includes('立体図') ||
  normalizedNotes.includes('アイソメ図') ||
  normalizedNotes.includes('斜視図') ||
  normalizedNotes.includes('3dモデル');

if (is3DConversionRequest) {
  workType = '3d_conversion';
  analysis.difficultyScore = Math.max(analysis.difficultyScore, 85);
  analysis.structureComplexity = Math.max(analysis.structureComplexity, 85);
  analysis.lineDifficulty = Math.max(analysis.lineDifficulty, 70);
  analysis.estimatedHoursMin = Math.max(analysis.estimatedHoursMin || 0, 18);
  analysis.estimatedHours = Math.max(analysis.estimatedHours || 0, 20);
  analysis.estimatedHoursMax = Math.max(analysis.estimatedHoursMax || 0, 24);

  analysis.summary =
    '2D・PDF図面から立体構造を再構築し、3D組立図および各3D部品図を作成する案件です。' +
    '図面読解、部品形状の立体化、組立関係の確認が必要なため、通常のテクニカルイラストより工数が大きくなります。';
}

    const conceptWords = ['概念図', 'システム図', '構成図', '製品説明図', '説明図', 'フロー図'];

const isConceptRequest =
  conceptWords.some((word) => input.notes.includes(word)) ||
  (input.usage === 'sales' && input.style === 'real' && analysis.partDensity >= 60);

if (isConceptRequest && workType !== '3d_conversion') {
  workType = 'concept_diagram';
  analysis.difficultyScore = Math.max(analysis.difficultyScore, 85);
  analysis.partDensity = Math.max(analysis.partDensity, 70);
  analysis.lineDifficulty = Math.max(analysis.lineDifficulty, 70);
  analysis.structureComplexity = Math.max(analysis.structureComplexity, 80);
}

if (
  workType !== '3d_conversion' &&
  (input.notes.includes('概念') ||
  input.notes.includes('フロー') ||
  input.notes.includes('全体'))
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

const analysisText = `
  ${input.notes || ''}
  ${analysis.summary || ''}
`.toLowerCase();

let minimumHours = 0;

// ------------------------
// 写真・資料からオリジナルで新規作図する販促用リアル工業イラスト
// ------------------------
const isOriginalReferenceDrawing =
  input.sourceType === 'reference_drawing' &&
  (
    analysisText.includes('オリジナル') ||
    analysisText.includes('新規作図') ||
    analysisText.includes('新規に作図') ||
    analysisText.includes('新たに作図') ||
    analysisText.includes('新しく作図') ||
    analysisText.includes('写真を参考に') ||
    analysisText.includes('資料を参考に')
  );

const hasIndustrialProductKeyword =
  analysisText.includes('ev') ||
  analysisText.includes('バッテリー') ||
  analysisText.includes('コネクター') ||
  analysisText.includes('コネクタ') ||
  analysisText.includes('車両') ||
  analysisText.includes('自動車') ||
  analysisText.includes('機械') ||
  analysisText.includes('工具') ||
  analysisText.includes('装置') ||
  analysisText.includes('製品');

const isOriginalRealSalesIllustration =
  isOriginalReferenceDrawing &&
  input.usage === 'sales' &&
  input.style === 'real' &&
  (analysis.isIndustrialProduct || hasIndustrialProductKeyword);

if (isOriginalRealSalesIllustration && workType !== '3d_conversion') {
  workType = 'realistic_illustration';
  analysis.difficultyScore = Math.max(analysis.difficultyScore, 75);
  analysis.partDensity = Math.max(analysis.partDensity, 65);
  analysis.lineDifficulty = Math.max(analysis.lineDifficulty, 65);
  analysis.structureComplexity = Math.max(analysis.structureComplexity, 60);
  analysis.estimatedHoursMin = Math.max(analysis.estimatedHoursMin || 0, 24);
  analysis.estimatedHours = Math.max(analysis.estimatedHours || 0, 26);
  analysis.estimatedHoursMax = Math.max(analysis.estimatedHoursMax || 0, 30);
  minimumHours = Math.max(minimumHours, 26);

  analysis.summary =
    '写真・参考資料をもとに形状を新規に構成する販促用リアルイラストです。' +
    '単純な写真トレースではなく、パース・形状再構築・質感・陰影・細部表現を含むため、' +
    'オリジナル作図案件として工数を補正しました。';
}

// ------------------------
// 複数の車両・機械製品を並べるカラー案件の補正
// 例：3列車を横並び、3両の鉄道車両、複数の自動車を同一構図で制作
// ------------------------
const normalizedAnalysisText = analysisText
  .replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xfee0)
  );

const hasVehicleSubject =
  normalizedAnalysisText.includes('列車') ||
  normalizedAnalysisText.includes('鉄道車両') ||
  normalizedAnalysisText.includes('電車') ||
  normalizedAnalysisText.includes('車両') ||
  normalizedAnalysisText.includes('自動車') ||
  normalizedAnalysisText.includes('トラック') ||
  normalizedAnalysisText.includes('バス') ||
  normalizedAnalysisText.includes('重機');

const hasMultipleVehicles =
  /[2-9](?:台|両|列車|車両|種類|点)/.test(normalizedAnalysisText) ||
  /(?:二|三|四|五|六|七|八|九)(?:台|両|列車|車両|種類|点)/.test(
    normalizedAnalysisText
  ) ||
  normalizedAnalysisText.includes('複数車両') ||
  normalizedAnalysisText.includes('複数の車両') ||
  normalizedAnalysisText.includes('横並び');

const isMultiVehicleIllustration =
  hasVehicleSubject &&
  hasMultipleVehicles &&
  input.sourceType === 'reference_drawing' &&
  input.usage === 'sales' &&
  (input.style === 'color' || input.style === 'real');

if (isMultiVehicleIllustration) {
  workType = 'realistic_illustration';
  analysis.difficultyScore = Math.max(analysis.difficultyScore, 82);
  analysis.partDensity = Math.max(analysis.partDensity, 80);
  analysis.lineDifficulty = Math.max(analysis.lineDifficulty, 80);
  analysis.structureComplexity = Math.max(
    analysis.structureComplexity,
    75
  );
  analysis.estimatedHoursMin = Math.max(
    analysis.estimatedHoursMin || 0,
    22
  );
  analysis.estimatedHours = Math.max(
    analysis.estimatedHours || 0,
    24
  );
  analysis.estimatedHoursMax = Math.max(
    analysis.estimatedHoursMax || 0,
    28
  );
  minimumHours = Math.max(minimumHours, 24);

  analysis.summary =
    '複数の車両をそれぞれの写真資料から描き起こし、同じ構図・角度・縮尺に調整して横並びにするカラーイラストです。' +
    '各車両の正確な形状、窓、ライト、連結器、台車などを個別に確認し、パース調整、質感、陰影、全体構図を統一する必要があるため、24時間前後の制作工数を見込みます。';
}

// オートバイ・自転車などの最低工数
if (
  reasonText.includes('オートバイ') ||
  reasonText.includes('バイク') ||
  reasonText.includes('自転車')
) {
  minimumHours = Math.max(minimumHours, 2.5);
}

// 人物・キャラクターが含まれるか
const hasCharacter =
  analysisText.includes('キャラ') ||
  analysisText.includes('人物') ||
  analysisText.includes('女性') ||
  analysisText.includes('男性');

// キャラクターなどの改変指示があるか
const hasModification =
  analysisText.includes('改変') ||
  analysisText.includes('変更') ||
  analysisText.includes('修正') ||
  analysisText.includes('描き直し') ||
  analysisText.includes('表情') ||
  analysisText.includes('ポーズ') ||
  analysisText.includes('髪型') ||
  analysisText.includes('服装');

// 高密度なカラー画像トレース
const isComplexColorTrace =
  input.sourceType === 'photo_trace' &&
  input.usage === 'sales' &&
  input.style === 'color' &&
  analysis.difficultyScore >= 65;

// 高密度カラー画像は最低18時間
if (isComplexColorTrace) {
  minimumHours = Math.max(minimumHours, 18);
}

// キャラクター改変を含む場合は最低33時間
// 33時間 × 3,000円 ＝ 99,000円
if (
  isComplexColorTrace &&
  hasCharacter &&
  hasModification
) {
  minimumHours = Math.max(minimumHours, 33);

  analysis.summary =
    `${analysis.summary || ''} ` +
    '既存のカラー画像全体のトレースに加えて、人物・キャラクターの改変、' +
    '背景、文字、アイコン、レイアウトの再現が必要な高密度案件として工数を補正しました。';
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
  notes: consultation.required
    ? `【個別見積り対象】\n${consultation.message}\n\n${input.notes}`
    : input.notes,
  workType,
});
// -----------------------------
// 応急処置：最低工数補正
// -----------------------------
if (minimumHours > 0 && estimate.hours < minimumHours) {
  estimate.hours = minimumHours;

  estimate.unitPrice =
    Math.round(
      (minimumHours * estimate.hourlyRate) / 100
    ) * 100;

  estimate.totalPrice =
    estimate.unitPrice * input.quantity;
}

// estimateMatchはここで1回だけ
const estimateMatch = calculateEstimateMatch({
  systemHours: estimate.hours,
  aiMinHours: analysis.estimatedHoursMin,
  aiHours: analysis.estimatedHours,
  aiMaxHours: analysis.estimatedHoursMax,
});

// confidenceも1回だけ
const confidence = calculateConfidence({
  sourceType: input.sourceType,
  usage: input.usage,
  style: input.style,
  workType,

  difficultyScore: analysis.difficultyScore,
  partDensity: analysis.partDensity,
  lineDifficulty: analysis.lineDifficulty,
  structureComplexity: analysis.structureComplexity,

  summary: analysis.summary,

  hasImage: !!base64,
  hasNotes: !!input.notes,
});




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
    const notificationResult = await sendNotificationEmail({
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
      estimateId: notificationResult.estimateId,
      requiresConsultation: consultation.required,
      consultationCategory: consultation.category,
      consultationMessage: consultation.message,
      showIllustrationReferencePrice,
      illustrationReferencePrice: showIllustrationReferencePrice
        ? estimate.totalPrice
        : null,

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
  console.error('ANALYZE_ERROR:', e);

  return NextResponse.json(
    {
      error:
        e instanceof Error
          ? e.message
          : '解析中にエラーが発生しました',
    },
    { status: 500 }
  );
}
}
