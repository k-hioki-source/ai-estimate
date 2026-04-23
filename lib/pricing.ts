export type PricingInput = {
  complexityScore: number;
  style?: string;
  quantity?: number;
};

export function calculateEstimate(input: PricingInput) {
  const quantity = input.quantity ?? 1;
  const score = input.complexityScore ?? 50;

  let base = 10000;

  if (score >= 80) {
    base = 60000;
  } else if (score >= 70) {
    base = 45000;
  } else if (score >= 60) {
    base = 30000;
  } else if (score >= 40) {
    base = 18000;
  } else {
    base = 10000;
  }

  if (input.style === 'color') {
    base = Math.round(base * 1.3);
  } else if (input.style === 'realistic') {
    base = Math.round(base * 2.0);
  }

  const totalPrice = base * quantity;

  return {
    unitPrice: base,
    totalPrice,
    priceText:
      quantity > 1
        ? `${totalPrice.toLocaleString()}円（${quantity}点）`
        : `${totalPrice.toLocaleString()}円`,
  };
}
