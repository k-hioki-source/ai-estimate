type SourceType = 'photo_trace' | 'reference_drawing' | 'cad_conversion';
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
}) {
  const hourlyRate = 3000;

  const score = clamp(difficultyScore, 0, 100);
  const part = clamp(partDensity, 0, 100);
  const line = clamp(lineDifficulty, 0, 100);
  const structure = clamp(structureComplexity, 0, 100);

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
    if (line >= 60) hours += 0.5;
    if (line >= 80) hours += 0.5;
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

    if (line >= 60) {
      hours += 0.5;
    }

    if (line >= 80) {
      hours += 1;
    }

    if (structure >= 75) {
      hours += 1;
    }
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
