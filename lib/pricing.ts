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
  quantity: number;
}) {
  const hourlyRate = 3000;

  const score = Math.max(0, Math.min(100, difficultyScore));

  // -----------------------------
  // ① 制作方法ごとの基本工数
  // -----------------------------
  let baseHours = 1;

    // 写真・画像トレースは難易度で段階化
 if (sourceType === 'photo_trace') {
  // トレースは基本1時間スタート
  baseHours = 1;
}

  if (sourceType === 'reference_drawing') {
    // 写真・図面・資料から作図
    if (score <= 30) baseHours = 2;
    else if (score <= 55) baseHours = 3;
    else if (score <= 75) baseHours = 5;
    else baseHours = 8;
  }

  if (sourceType === 'cad_conversion') {
    // XVL・3DCADから作成
    if (score <= 30) baseHours = 1.5;
    else if (score <= 55) baseHours = 2.5;
    else if (score <= 75) baseHours = 4;
    else baseHours = 6;
  }

  // -----------------------------
  // ② 用途補正
  // -----------------------------
  let usageMultiplier = 1;

  if (usage === 'manual') usageMultiplier = 0.9;
  if (usage === 'parts') usageMultiplier = 1.1;
  if (usage === 'sales') usageMultiplier = 1.25;

  // -----------------------------
  // ③ 表現補正
  // -----------------------------
  let styleMultiplier = 1;

  if (style === 'line') styleMultiplier = 1;
if (style === 'color') styleMultiplier = 1.2;
if (style === 'real') styleMultiplier = 1.5;

  // -----------------------------
  // ④ AI難易度補正（0.1刻み）
  // 低難度は抑え、中〜高難度で上がりやすくする
  // -----------------------------
  const difficultyMultiplier = getDifficultyMultiplier(score);

  // -----------------------------
  // ⑤ 構造補正
  // 「簡単そうだけど線起こしが面倒」な案件を拾う
  // -----------------------------
  let structureBonusHours = 0;

  if (sourceType === 'photo_trace' && score >= 50) {
    structureBonusHours += 0.5;
  }

  if (sourceType === 'photo_trace' && score >= 65) {
    structureBonusHours += 0.5;
  }

  if (sourceType === 'reference_drawing' && score >= 65) {
    structureBonusHours += 1;
  }

  if (sourceType === 'reference_drawing' && score >= 80) {
    structureBonusHours += 1.5;
  }

  if (sourceType === 'cad_conversion' && score >= 70) {
    structureBonusHours += 1;
  }

  // -----------------------------
  // ⑥ 工数算出
  // -----------------------------
  let hours =
    baseHours *
      usageMultiplier *
      styleMultiplier *
      difficultyMultiplier +
    structureBonusHours;
   // -----------------------------
// パーツ用途補正
// -----------------------------
if (usage === 'parts') {
  hours += 1.5;
}
  // -----------------------------
// 分解図・組図補正
// -----------------------------
if (isExplodedView) {
  hours += 2;
}

if (hasLeaderLines) {
  hours += 1;
}

if (hasPartNumbers) {
  hours += 1;
}
  // -----------------------------
// リアル表現補正
// -----------------------------
if (style === 'real' && lineDifficulty >= 50) {
  hours += 1;
}

if (style === 'real' && lineDifficulty >= 70) {
  hours += 2;
}

if (style === 'real' && structureComplexity >= 70) {
  hours += 2;
}

  // 最低工数
  hours = Math.max(1, hours);

  // 0.5時間単位に丸め
  hours = Math.round(hours * 2) / 2;

  if (sourceType === 'photo_trace' && partDensity >= 70) {
  hours += 1;
}

if (sourceType === 'photo_trace' && lineDifficulty >= 50) {
  hours += 0.5;
}

if (sourceType === 'photo_trace' && lineDifficulty >= 70) {
  hours += 1;
}

if (sourceType === 'photo_trace' && structureComplexity >= 50) {
  hours += 1;
}

if (sourceType === 'photo_trace' && structureComplexity >= 70) {
  hours += 1;
}
  
  // -----------------------------
  // ⑦ 金額算出
  // -----------------------------
  let unitPrice = hours * hourlyRate;

  // 最低金額
  unitPrice = Math.max(3000, unitPrice);

  // 100円単位に丸め
  unitPrice = Math.round(unitPrice / 100) * 100;

  // -----------------------------
  // ⑧ 点数補正
  // -----------------------------
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
    structureBonusHours,
    quantity,

    priceText: `${totalPrice.toLocaleString()}円`,
  };
}

function getDifficultyMultiplier(score: number) {
const min = 0.9;
const max = 1.4;

const curved = Math.pow(score / 100, 2);
  // 低難度は上がりにくく、高難度で伸びるカーブ

  const multiplier = min + curved * (max - min);

  // 0.1刻み
  return Math.round(multiplier * 10) / 10;
}
