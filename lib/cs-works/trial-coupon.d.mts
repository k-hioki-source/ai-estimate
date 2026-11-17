export const TRIAL_COUPON_AMOUNT: 3000;
export const TRIAL_COUPON_DEFAULT_LIMITS: Readonly<{
  grantLimit: number | null;
  redemptionLimit: number | null;
  expiresAt: string | null;
}>;
export const TRIAL_COUPON_COPY: Readonly<{
  granted: string; badge: string; signup: string; heading: string;
  description: string; question: string; answer: string;
}>;
export type TrialCouponApplication = 'full' | 'partial' | 'ineligible';
export type TrialCouponCalculation = {
  subtotal: number; couponDiscountAmount: number; otherDiscountAmount: number;
  taxableAmount: number; taxAmount: number; totalAmount: number;
  application: TrialCouponApplication; unusedAmountCarriedForward: number;
  couponZeroDelivery: boolean;
};
export function calculateTrialCoupon(subtotal: number, options: {
  applyCoupon: boolean; otherDiscountAmount?: number;
}): TrialCouponCalculation;
