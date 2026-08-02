type SourceType =
  | 'photo_trace'
  | 'reference_drawing'
  | 'cad_conversion'
  | 'ai_vectorization';

type Usage = 'manual' | 'parts' | 'sales';
type Style = 'line' | 'color' | 'real';


export function calculateEstimate({
  sourceType,
  usage,
  style,
  difficultyScore,
  partDensity,
  lineDifficulty,
  structureComplexity,
  isExplodedView,
  hasLeaderLines,
  hasPartNumbers,
  isIndustrialProduct,
  quantity,
  description = '',
  notes = '',
}: {
  sourceType: SourceType;
  usage: Usage;
  style: Style;
  difficultyScore: number;
  partDensity: number;
  lineDifficulty: number;
  structureComplexity: number;
  isExplodedView: boolean;
  hasLeaderLines: boolean;
  hasPartNumbers: boolean;
  isIndustrialProduct: boolean;
  quantity: number;
  description?: string;
  notes?: string;
}) {
  const hourlyRate = 3000;

  let score = clamp(difficultyScore, 0, 100);
  const part = clamp(partDensity, 0, 100);
  const line = clamp(lineDifficulty, 0, 100);
  const structure = clamp(structureComplexity, 0, 100);

  const text = `${description} ${notes}`.toLowerCase();

  // フォームの制作方法と依頼文が食い違う場合の補正。
  // 写真と同じ角度・内容を線画化する案件は photo_trace として計算する。
  // 別角度や見えない部分の描き起こしは reference_drawing のまま扱う。
  const isPhotoBasedTrace =
    text.includes('支給資料：写真') ||
    text.includes('支給資料:写真') ||
    text.includes('製品写真から') ||
    text.includes('写真から');

  const requiresDrawingFromReference =
    text.includes('別角度') ||
    text.includes('角度変更') ||
    text.includes('見えない部分') ||
    text.includes('推測して') ||
    text.includes('描き起こし');

  if (
    sourceType === 'reference_drawing' &&
    isPhotoBasedTrace &&
    !requiresDrawingFromReference
  ) {
    sourceType = 'photo_trace';
  }

  const hasVectorKeyword =
    text.includes('パス') ||
    text.includes('ベクター') ||
    text.includes('ベクターデータ') ||
    text.includes('illustrator') ||
    text.includes('aiデータ') ||
    text.includes('アウトライン');

  const hasFullPath =
    text.includes('すべての要素') ||
    text.includes('全ての要素') ||
    text.includes('背景を含む') ||
    text.includes('全てパス') ||
    text.includes('完全パス');

  const noImageAllowed =
    text.includes('画像は使用しません') ||
    text.includes('画像使用不可') ||
    text.includes('画像は使用不可') ||
    text.includes('画像不可') ||
    text.includes('画像は使用不可');

  const hasSignboard =
    text.includes('看板') ||
    text.includes('原寸') ||
    text.includes('2000mm') ||
    text.includes('2,000mm') ||
    text.includes('w2,000') ||
    text.includes('塗り足し');

  const hasAiGenerated =
    text.includes('生成ai') ||
    text.includes('ai生成') ||
    text.includes('aiで作成') ||
    text.includes('ai画像');

  const hasLogoOrText =
    text.includes('ロゴ') ||
    text.includes('文字') ||
    text.includes('社名') ||
    text.includes('電話番号') ||
    text.includes('住所');

  const hasBeforeAfterOutline =
    text.includes('アウトライン前') ||
    text.includes('アウトライン後') ||
    text.includes('アウトライン前のai') ||
    text.includes('アウトライン後のai');

  // 支給画像・AI生成画像を元にした、小規模なロゴ／切文字データ調整。
  // 「AI生成」＋「アウトライン」だけで完全ベクター化案件に昇格させない。
  const hasSimpleLogoWork =
    text.includes('ロゴ') ||
    text.includes('屋号') ||
    text.includes('マーク') ||
    text.includes('切文字') ||
    text.includes('ステッカー') ||
    text.includes('フォント化');

  const hasLimitedColor =
    text.includes('単色') ||
    text.includes('1色') ||
    text.includes('１色') ||
    text.includes('2色') ||
    text.includes('２色');

  const hasNewDesignWork =
    text.includes('新規デザイン') ||
    text.includes('デザイン提案') ||
    text.includes('複数案') ||
    text.includes('コンセプト') ||
    text.includes('ロゴ制作') ||
    text.includes('ロゴ作成');

  const hasComplexLogoWork =
    text.includes('キャラクター') ||
    text.includes('細かい装飾') ||
    text.includes('不鮮明') ||
    text.includes('入稿代行') ||
    text.includes('複数サイズ') ||
    text.includes('複数仕様');

  const isSimpleLogoVectorization =
    sourceType === 'photo_trace' &&
    score <= 40 &&
    hasVectorKeyword &&
    hasSimpleLogoWork &&
    (hasAiGenerated || text.includes('支給')) &&
    (hasLimitedColor || style === 'line') &&
    !hasFullPath &&
    !noImageAllowed &&
    !hasSignboard &&
    !hasNewDesignWork &&
    !hasComplexLogoWork;

  // AI生成画像・完全ベクター化案件を自動判定
  if (
    sourceType === 'photo_trace' &&
    !isSimpleLogoVectorization &&
    hasVectorKeyword &&
    (hasAiGenerated || hasFullPath || noImageAllowed || hasSignboard)
  ) {
    sourceType = 'ai_vectorization';
    score = Math.max(score, 75);
  }

  let baseHours = 1;

  if (sourceType === 'photo_trace') {
    baseHours = 1;
  }

  if (sourceType === 'reference_drawing') {
    if (score <= 30) baseHours = 2;
    else if (score <= 55) baseHours = 3;
    else if (score <= 75) baseHours = 5;
    else baseHours = 8;
  }

  if (sourceType === 'cad_conversion') {
    if (score <= 30) baseHours = 1.5;
    else if (score <= 55) baseHours = 2.5;
    else if (score <= 75) baseHours = 4;
    else baseHours = 6;
  }

  if (sourceType === 'ai_vectorization') {
    if (score <= 50) baseHours = 5;
    else if (score <= 70) baseHours = 7;
    else if (score <= 85) baseHours = 9;
    else baseHours = 12;
  }

  let usageMultiplier = 1;

  if (usage === 'manual') usageMultiplier = 0.9;
  if (usage === 'parts') usageMultiplier = 1.1;
  if (usage === 'sales') usageMultiplier = 1.25;

  let styleMultiplier = 1;

  if (style === 'line') styleMultiplier = 1;
  if (style === 'color') styleMultiplier = 1.2;
  if (style === 'real') styleMultiplier = 1.5;

 

  const difficultyMultiplier = getDifficultyMultiplier(score);

  let hours =
    baseHours *
    usageMultiplier *
    styleMultiplier *
    difficultyMultiplier;

   if (
  usage === 'sales' &&
  style === 'real' &&
  (
    notes.includes('構造') ||
    notes.includes('解説図') ||
    notes.includes('断面') ||
    notes.includes('土') ||
    notes.includes('草')
  )
) {
  hours = Math.max(hours, 8);
}

  if (
  usage === 'sales' &&
  style === 'real' &&
  score >= 60
) {
  hours = Math.max(hours, 8);
}

  if (
    style === 'real' &&
    usage === 'sales' &&
    score >= 80
  ) {
    hours = Math.max(hours, 30);
  }

  // -----------------------------
  // 制作方法別の基本補正
  // -----------------------------
  if (sourceType === 'photo_trace') {
    if (score >= 60) hours += 0.5;
    if (score >= 80) hours += 0.5;
  }

  if (sourceType === 'reference_drawing') {
    if (score >= 65) hours += 1;
    if (score >= 80) hours += 1.5;
  }

  if (sourceType === 'cad_conversion') {
    if (score >= 70) hours += 1;
  }

  // -----------------------------
  // AI生成画像・完全ベクター化補正
  // -----------------------------
  if (sourceType === 'ai_vectorization') {
    hours = Math.max(hours, 7);

    if (hasFullPath) {
      hours += 1.5;
      score = Math.max(score, 80);
    }

    if (noImageAllowed) {
      hours += 1.2;
      score = Math.max(score, 82);
    }

    if (hasSignboard) {
      hours += 0.8;
    }

    if (hasLogoOrText) {
      hours += 1.2;
    }

    if (hasBeforeAfterOutline) {
      hours += 0.4;
    }

    if (hasAiGenerated) {
      hours += 1;
    }

    // 今回のような看板用完全パス化案件の最低工数
    if (
      hasVectorKeyword &&
      hasFullPath &&
      noImageAllowed &&
      hasSignboard
    ) {
      hours = Math.max(hours, 10);
      score = Math.max(score, 85);
    }
  }

  // -----------------------------
  // パーツカタログ・分解図補正
  // -----------------------------
  if (usage === 'parts') {
    hours += sourceType === 'photo_trace' ? 0.5 : 1.5;
  }

  if (isExplodedView) {
    hours += sourceType === 'photo_trace' ? 1 : 2;
  }

  if (hasLeaderLines) {
    hours += sourceType === 'photo_trace' ? 0.5 : 1;
  }

  if (hasPartNumbers) {
    hours += sourceType === 'photo_trace' ? 0.5 : 1;
  }

  // -----------------------------
  // トレースの複雑さ補正
  // -----------------------------
  if (sourceType === 'photo_trace') {
    if (part >= 75) hours += 0.5;
    if (structure >= 60) hours += 0.5;
    if (structure >= 75) hours += 0.5;
    if (line >= 60) hours += 1;
    if (line >= 80) hours += 1;
  }

  // -----------------------------
  // リアル表現補正
  // -----------------------------
  if (style === 'real') {
    if (isIndustrialProduct) {
      hours += sourceType === 'photo_trace' ? 1.5 : 3;
    }

    if (isIndustrialProduct && line >= 70) {
      hours += sourceType === 'photo_trace' ? 0.5 : 1.5;
    }

    if (isIndustrialProduct && score >= 80) {
      hours += sourceType === 'photo_trace' ? 0.5 : 1.5;
    }

    if (line >= 60) hours += 0.5;
    if (line >= 80) hours += 1;
    if (structure >= 75) hours += 1;
  }

  // 販促・WEB掲載用のリアルな機械製品は、形状の再現だけでなく、
  // 金属・樹脂・ゴムなどの質感、曲面の陰影、細かな段差や継ぎ目の
  // 描き分けに時間がかかるため、最低15時間を確保する。
  // 単純な工業部品まで一律に引き上げないよう、難易度60以上に限定する。
  if (
    sourceType === 'photo_trace' &&
    usage === 'sales' &&
    style === 'real' &&
    isIndustrialProduct &&
    score >= 60
  ) {
    hours = Math.max(hours, 15);
    score = Math.max(score, 70);
  }

  // 小規模なロゴ・切文字案件は、アウトライン整理と出力用データ調整を
  // 含む標準工数として5時間にする（新規デザインや完全パス化は対象外）。
  if (isSimpleLogoVectorization) {
    hours = 5;
  }

  // 簡単な取説用写真トレースは1hに抑える
  if (
    !isSimpleLogoVectorization &&
    sourceType === 'photo_trace' &&
    usage === 'manual' &&
    style === 'line' &&
    score <= 55 &&
    part <= 40 &&
    line <= 50 &&
    structure <= 40 &&
    !isExplodedView &&
    !hasLeaderLines &&
    !hasPartNumbers
  ) {
    hours = 0.8;
  }

  // 丸め
  hours = Math.max(0.8, hours);
  hours = Math.round(hours * 10) / 10;

  let unitPrice = hours * hourlyRate;
  unitPrice = Math.max(3000, unitPrice);
  unitPrice = Math.round(unitPrice / 100) * 100;

  let quantityMultiplier = quantity;

  if (quantity >= 10) {
    quantityMultiplier = quantity * 0.8;
  } else if (quantity >= 5) {
    quantityMultiplier = quantity * 0.9;
  }

  const totalPrice =
    Math.round((unitPrice * quantityMultiplier) / 100) * 100;

  return {
    hours,
    unitPrice,
    totalPrice,
    hourlyRate,
    sourceType,
    usageMultiplier,
    styleMultiplier,
    difficultyMultiplier,
    quantity,
    priceText: `${totalPrice.toLocaleString()}円`,
  };
}

function getDifficultyMultiplier(score: number) {
  const min = 0.9;
  const max = 1.4;
  const curved = Math.pow(score / 100, 2);
  const multiplier = min + curved * (max - min);

  return Math.round(multiplier * 10) / 10;
}

function clamp(value: number, min: number, max: number) {
  const n = Number(value);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
