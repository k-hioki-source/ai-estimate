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
  let basePrice = 3000;

  if (complexityScore <= 30) basePrice = 3000;
  else if (complexityScore <= 50) basePrice = 6000;
  else if (complexityScore <= 70) basePrice = 12000;
  else if (complexityScore <= 85) basePrice = 25000;
  else basePrice = 40000;

  let styleMultiplier = 1;

  if (style === 'line') {
    styleMultiplier = 1;
  }

  if (style === 'color') {
    if (complexityScore <= 50) styleMultiplier = 1.5;
    else if (complexityScore <= 70) styleMultiplier = 1.4;
    else styleMultiplier = 1.7;
  }

  if (style === 'real') {
    if (complexityScore <= 50) styleMultiplier = 2.5;
    else if (complexityScore <= 70) styleMultiplier = 3.0;
    else if (complexityScore <= 85) styleMultiplier = 3.5;
    else styleMultiplier = 5.0;
  }

  let usageMultiplier = 1;

  if (usage === 'manual') usageMultiplier = 0.9;
  if (usage === 'parts') usageMultiplier = 1.1;
  if (usage === 'sales') usageMultiplier = 1.0;

  let sizeMultiplier = 1;

  if (size === 'small') sizeMultiplier = 0.9;
  if (size === 'medium') sizeMultiplier = 1;
  if (size === 'large') sizeMultiplier = 1.2;

  const rushMultiplier = rush === 'rush' ? 1.3 : 1;

  let quantityMultiplier = quantity;

  if (quantity >= 10) quantityMultiplier = quantity * 0.8;
  else if (quantity >= 5) quantityMultiplier = quantity * 0.9;

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
