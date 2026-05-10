type SourceType = 'photo_trace' | 'reference_drawing' | 'cad_conversion';
type Usage = 'manual' | 'parts' | 'sales';
type Style = 'line' | 'color' | 'real';

export function calculateEstimate({
  sourceType,
  usage,
  style,
  difficultyScore,
  quantity,
}: {
  sourceType: SourceType;
  usage: Usage;
  style: Style;
  difficultyScore: number;
  quantity: number;
}) {
  const hourlyRate = 3000;

  let baseHours = 1;

  if (sourceType === 'photo_trace') {
    baseHours = 1;
  }

  if (sourceType === 'reference_drawing') {
    baseHours = 3;
  }

  if (sourceType === 'cad_conversion') {
    baseHours = 2.5;
  }

  let usageMultiplier = 1;

  if (usage === 'manual') usageMultiplier = 0.9;
  if (usage === 'parts') usageMultiplier = 1.1;
  if (usage === 'sales') usageMultiplier = 1.3;

  let styleMultiplier = 1;

  if (style === 'line') styleMultiplier = 1;
  if (style === 'color') styleMultiplier = 1.4;
  if (style === 'real') styleMultiplier = 2.2;

  const difficultyFactor = 0.8 + (difficultyScore / 100) * 0.8;

  let hours =
    baseHours *
    usageMultiplier *
    styleMultiplier *
    difficultyFactor;

  if (sourceType === 'photo_trace' && difficultyScore >= 70) {
    hours += 1;
  }

  if (sourceType === 'reference_drawing' && difficultyScore >= 70) {
    hours += 2;
  }

  if (sourceType === 'cad_conversion' && style === 'real') {
    hours += 2;
  }

  hours = Math.max(1, Math.round(hours * 2) / 2);

  let unitPrice = hours * hourlyRate;
  unitPrice = Math.round(unitPrice / 100) * 100;

  let quantityMultiplier = quantity;

  if (quantity >= 10) quantityMultiplier = quantity * 0.8;
  else if (quantity >= 5) quantityMultiplier = quantity * 0.9;

  const totalPrice = Math.round((unitPrice * quantityMultiplier) / 100) * 100;

  return {
    hours,
    unitPrice,
    totalPrice,
    hourlyRate,
    sourceType,
    usageMultiplier,
    styleMultiplier,
    difficultyFactor,
    quantity,
    priceText: `${totalPrice.toLocaleString()}円`,
  };
}
