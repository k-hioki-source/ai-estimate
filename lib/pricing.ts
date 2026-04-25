export function calculateEstimate({
  complexityScore,
  style,
  usage,
  quantity,
  size,
  rush,
}: {
  complexityScore: number;
  style: 'line' | 'color' | 'real';
  usage: 'manual' | 'parts' | 'sales';
  quantity: number;
  size: 'small' | 'medium' | 'large';
  rush: 'normal' | 'rush';
}) {
  // ---------------------------
  // ① ベース価格（ここがコア）
  // ---------------------------
  let basePrice = 3000;

  if (complexityScore <= 30) basePrice = 3000;
  else if (complexityScore <= 50) basePrice = 6000;
  else if (complexityScore <= 70) basePrice = 12000;
  else if (complexityScore <= 85) basePrice = 25000;
  else basePrice = 50000;

  // ---------------------------
  // ② 表現倍率
  // ---------------------------
  let styleMultiplier = 1;

  if (style === 'line') styleMultiplier = 1;
  if (style === 'color') styleMultiplier = 1.7;
  if (style === 'real') {
    // リアルは難易度依存で可変
    if (complexityScore <= 50) styleMultiplier = 2.5;
    else if (complexityScore <= 70) styleMultiplier = 4;
    else if (complexityScore <= 85) styleMultiplier = 6;
    else styleMultiplier = 9;
  }

  // ---------------------------
  // ③ 用途倍率
  // ---------------------------
  let usageMultiplier = 1;

  if (usage === 'manual') usageMultiplier = 0.9; // 取説取りに行く
  if (usage === 'parts') usageMultiplier = 1.2;
  if (usage === 'sales') usageMultiplier = 1.4;

  // ---------------------------
  // ④ サイズ倍率
  // ---------------------------
  let sizeMultiplier = 1;

  if (size === 'small') sizeMultiplier = 0.9;
  if (size === 'medium') sizeMultiplier = 1;
  if (size === 'large') sizeMultiplier = 1.3;

  // ---------------------------
  // ⑤ 特急倍率
  // ---------------------------
  let rushMultiplier = rush === 'rush' ? 1.3 : 1;

  // ---------------------------
  // ⑥ 点数補正（ボリュームディスカウント）
  // ---------------------------
  let quantityMultiplier = quantity;

  if (quantity >= 5) quantityMultiplier = quantity * 0.9;
  if (quantity >= 10) quantityMultiplier = quantity * 0.8;

  // ---------------------------
  // ⑦ 合計
  // ---------------------------
  const unitPrice =
    basePrice *
    styleMultiplier *
    usageMultiplier *
    sizeMultiplier *
    rushMultiplier;

  const totalPrice = Math.round(unitPrice * quantityMultiplier);

  return {
    unitPrice: Math.round(unitPrice),
    totalPrice,
    priceText: `${totalPrice.toLocaleString()}円`,
  };
}
