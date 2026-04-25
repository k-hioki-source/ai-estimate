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
  // --------------------------------
  // ① finalScore を価格帯に変換
  // --------------------------------
  let basePrice = 3000;

  if (complexityScore <= 30) {
    basePrice = 3000;
  } else if (complexityScore <= 45) {
    basePrice = 5000;
  } else if (complexityScore <= 60) {
    basePrice = 8000;
  } else if (complexityScore <= 75) {
    basePrice = 15000;
  } else if (complexityScore <= 85) {
    basePrice = 25000;
  } else {
    basePrice = 40000;
  }

  // --------------------------------
  // ② 表現補正
  // --------------------------------
  let styleMultiplier = 1;

  if (style === 'line') {
    styleMultiplier = 1;
  }

  if (style === 'color') {
    if (complexityScore <= 45) {
      styleMultiplier = 1.5;
    } else if (complexityScore <= 70) {
      styleMultiplier = 1.6;
    } else {
      styleMultiplier = 1.8;
    }
  }

  if (style === 'real') {
    if (complexityScore <= 45) {
      styleMultiplier = 2.5;
    } else if (complexityScore <= 60) {
      styleMultiplier = 3.0;
    } else if (complexityScore <= 75) {
      styleMultiplier = 3.5;
    } else if (complexityScore <= 85) {
      styleMultiplier = 4.0;
    } else {
      styleMultiplier = 5.0;
    }
  }

  // --------------------------------
  // ③ 用途補正
  // --------------------------------
  let usageMultiplier = 1;

  if (usage === 'manual') {
    usageMultiplier = 0.9;
  }

  if (usage === 'parts') {
    usageMultiplier = 1.1;
  }

  if (usage === 'sales') {
    usageMultiplier = 1.0;
  }

  // --------------------------------
  // ④ サイズ補正
  // --------------------------------
  let sizeMultiplier = 1;

  if (size === 'small') {
    sizeMultiplier = 0.9;
  }

  if (size === 'medium') {
    sizeMultiplier = 1;
  }

  if (size === 'large') {
    sizeMultiplier = 1.2;
  }

  // --------------------------------
  // ⑤ 納期補正
  // --------------------------------
  const rushMultiplier = rush === 'rush' ? 1.3 : 1;

  // --------------------------------
  // ⑥ 点数補正
  // --------------------------------
  let quantityMultiplier = quantity;

  if (quantity >= 10) {
    quantityMultiplier = quantity * 0.8;
  } else if (quantity >= 5) {
    quantityMultiplier = quantity * 0.9;
  }

  // --------------------------------
  // ⑦ 金額算出
  // --------------------------------
  const unitPriceRaw =
    basePrice *
    styleMultiplier *
    usageMultiplier *
    sizeMultiplier *
    rushMultiplier;

  // 100円単位に丸める
  const unitPrice = Math.round(unitPriceRaw / 100) * 100;
  const totalPrice = Math.round((unitPrice * quantityMultiplier) / 100) * 100;

  return {
    unitPrice,
    totalPrice,
    priceText: `${totalPrice.toLocaleString()}円`,
    basePrice,
    usageMultiplier,
    styleMultiplier,
    sizeMultiplier,
    rushMultiplier,
    quantity,
  };
}
