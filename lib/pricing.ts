export function calculateEstimate({
  estimatedHours,
  style,
  usage,
  quantity,
  size,
  rush,
}: {
  estimatedHours: number;
  style: 'line' | 'color' | 'real';
  usage: 'manual' | 'parts' | 'sales';
  quantity: number;
  size: 'small' | 'medium' | 'large';
  rush: 'normal' | 'rush';
}) {
  const hourlyRate = 3000;

  let adjustedHours = estimatedHours;

  // サイズ補正
  let sizeMultiplier = 1;
  if (size === 'small') sizeMultiplier = 0.9;
  if (size === 'medium') sizeMultiplier = 1;
  if (size === 'large') sizeMultiplier = 1.2;

  // 特急補正
  const rushMultiplier = rush === 'rush' ? 1.3 : 1;

  adjustedHours *= sizeMultiplier;
  adjustedHours *= rushMultiplier;

  // 0.5h単位に丸める
  adjustedHours = Math.max(0.8, Math.round(adjustedHours * 2) / 2);

  // 単価
  let unitPrice = adjustedHours * hourlyRate;

  // 最低料金
  unitPrice = Math.max(3000, unitPrice);

  // 100円単位に丸める
  unitPrice = Math.round(unitPrice / 100) * 100;

  // 点数補正
  let quantityMultiplier = quantity;

  if (quantity >= 10) {
    quantityMultiplier = quantity * 0.8;
  } else if (quantity >= 5) {
    quantityMultiplier = quantity * 0.9;
  }

  const totalPrice = Math.round((unitPrice * quantityMultiplier) / 100) * 100;

  return {
    hourlyRate,
    estimatedHours,
    adjustedHours,
    unitPrice,
    totalPrice,
    priceText: `${totalPrice.toLocaleString()}円`,
    quantity,
    sizeMultiplier,
    rushMultiplier,
  };
}
