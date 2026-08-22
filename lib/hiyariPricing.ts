export type HiyariAnalysis = {
  peopleCount: number;
  objectComplexity: number;
  backgroundComplexity: number;
  reconstructionNeed: number;
  compositionChange: boolean;
  difficultyScore: number;
};

export type HiyariPriceInput = HiyariAnalysis & {
  quantity: number;
};

export function calculateHiyariEstimate(input: HiyariPriceInput) {
  const hourlyRate = 3000;
  const minimumUnitPrice = 15000;

  let hours = 5;

  // 人物
  if (input.peopleCount >= 2) {
    hours += Math.min(3, (input.peopleCount - 1) * 0.8);
  }

  // 設備・道具・車両などの描写量
  if (input.objectComplexity >= 70) hours += 2;
  else if (input.objectComplexity >= 45) hours += 1;

  // 背景
  if (input.backgroundComplexity >= 70) hours += 2;
  else if (input.backgroundComplexity >= 45) hours += 1;

  // 写真に写っていない部分の補完・再構成
  if (input.reconstructionNeed >= 75) hours += 3;
  else if (input.reconstructionNeed >= 50) hours += 1.5;

  // 危険場面が写真のままでは伝わらず、構図変更が必要
  if (input.compositionChange) hours += 1;

  // 全体難易度
  if (input.difficultyScore >= 85) hours += 2;
  else if (input.difficultyScore >= 70) hours += 1;

  hours = Math.max(5, Math.round(hours * 10) / 10);

  let unitPrice = Math.max(minimumUnitPrice, hours * hourlyRate);
  unitPrice = Math.round(unitPrice / 100) * 100;

  const quantity = Math.max(1, Math.min(50, Math.round(input.quantity || 1)));

  let quantityMultiplier = quantity;
  if (quantity >= 10) quantityMultiplier = quantity * 0.8;
  else if (quantity >= 5) quantityMultiplier = quantity * 0.9;

  const totalPrice =
    Math.round((unitPrice * quantityMultiplier) / 100) * 100;

  let deliveryDays = '3〜5営業日';
  if (hours >= 10) deliveryDays = '5〜7営業日';
  if (quantity >= 5) deliveryDays = '別途ご相談';

  return {
    hourlyRate,
    hours,
    unitPrice,
    quantity,
    totalPrice,
    deliveryDays,
  };
}
