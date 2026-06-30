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

  // AI生成画像・完全ベクター化案件を自動判定
  if (
    sourceType === 'photo_trace' &&
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

  // 簡単な取説用写真トレースは1hに抑える
  if (
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
