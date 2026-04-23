export type EstimateRequest = {
  customerName: string;
  companyName: string;
  email: string;
  usage: 'manual' | 'parts' | 'sales';
  size: 'small' | 'medium' | 'large';
  style: 'line' | 'color' | 'real';
  quantity: number;
  rush: 'normal' | 'rush';
  requestFormalQuote: boolean;
  notes: string;
};

export type VisionScore = {
  subjectType: string;
  complexityScore: number;
  partDensity: number;
  occlusion: number;
  lineDifficulty: number;
  realismRequirement: number;
  structureComplexity: number;
  confidence: number;
  reason: string;
};

export type EstimateResult = {
  complexityBand: 'low' | 'mid' | 'high';
  basePrice: number;
  usageMultiplier: number;
  styleMultiplier: number;
  sizeMultiplier: number;
  rushMultiplier: number;
  quantity: number;
  subtotal: number;
  total: number;
  deliveryDays: string;
};

function complexityBasePrice(score: number): { price: number; band: 'low' | 'mid' | 'high' } {
  if (score <= 35) return { price: 9000, band: 'low' };
  if (score <= 65) return { price: 22000, band: 'mid' };
  return { price: 45000, band: 'high' };
}

function getUsageMultiplier(usage: EstimateRequest['usage']): number {
  switch (usage) {
    case 'manual':
      return 1;
    case 'parts':
      return 1.15;
    case 'sales':
      return 1.25;
  }
}

function getStyleMultiplier(style: EstimateRequest['style']): number {
  switch (style) {
    case 'line':
      return 1;
    case 'color':
      return 1.35;
    case 'real':
      return 1.9;
  }
}

function getSizeMultiplier(size: EstimateRequest['size']): number {
  switch (size) {
    case 'small':
      return 1;
    case 'medium':
      return 1.2;
    case 'large':
      return 1.45;
  }
}

function getRushMultiplier(rush: EstimateRequest['rush']): number {
  return rush === 'rush' ? 1.25 : 1;
}

function getDeliveryDays(total: number, quantity: number): string {
  if (total <= 15000) return '2〜3営業日';
  if (total <= 40000) return quantity > 1 ? '4〜6営業日' : '3〜5営業日';
  return quantity > 1 ? '7〜10営業日' : '5〜7営業日';
}

export function calculateEstimate(input: EstimateRequest, score: VisionScore): EstimateResult {
  const { price: basePrice, band } = complexityBasePrice(score.complexityScore);
  const usageMultiplier = getUsageMultiplier(input.usage);
  const styleMultiplier = getStyleMultiplier(input.style);
  const sizeMultiplier = getSizeMultiplier(input.size);
  const rushMultiplier = getRushMultiplier(input.rush);

  const subtotal = basePrice * usageMultiplier * styleMultiplier * sizeMultiplier * rushMultiplier;
  const quantityDiscount = input.quantity >= 3 ? 0.92 : 1;
  const total = Math.round((subtotal * input.quantity * quantityDiscount) / 100) * 100;

  return {
    complexityBand: band,
    basePrice,
    usageMultiplier,
    styleMultiplier,
    sizeMultiplier,
    rushMultiplier,
    quantity: input.quantity,
    subtotal: Math.round(subtotal / 100) * 100,
    total,
    deliveryDays: getDeliveryDays(total, input.quantity)
  };
}
