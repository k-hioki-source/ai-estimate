/**
 * Tax-exclusive coupon calculation only. Eligibility and single-use enforcement
 * must come from a transaction in the database, never from customer input.
 */
export const TRIAL_COUPON_AMOUNT = 3000;
export const TRIAL_COUPON_DEFAULT_LIMITS = Object.freeze({
  grantLimit: null,
  redemptionLimit: null,
  expiresAt: null,
});
export const TRIAL_COUPON_COPY = Object.freeze({
  granted: '初回お試しクーポン（3,000円分）を付与しました。初回発注の正式見積りの際に自動で適用されます。',
  badge: '新規会員登録で、初回お試しクーポン（3,000円分）プレゼント',
  signup: '会員登録（無料）すると、初回発注に使える『初回お試しクーポン（3,000円分）』が付与されます。正式見積り3,000円以下なら、クーポンで全額まかなえます。',
  heading: '初回お試しクーポンについて',
  description: '新規会員登録をされたお客様に、初回発注用のクーポン（3,000円分・税抜）を1枚プレゼントしています。正式見積り金額が3,000円以下の場合は全額をクーポンでまかない、3,000円を超える場合は3,000円を割引いたします。適用は正式見積りの際に担当者が行いますので、お手続きは不要です。1社1回まで。他の割引との併用はできません。本クーポンの内容は変更となる場合があります。',
  question: '初回お試しクーポンとは何ですか？',
  answer: 'CS Worksに新規会員登録されたお客様にプレゼントする、初回発注用の3,000円分（税抜）クーポンです。正式見積り金額が3,000円以下の場合はクーポンで全額まかなえ、3,000円を超える場合は3,000円を割引いたします。1社につき1回まで、他の割引との併用はできません。正式見積りの際に担当者が自動で適用するため、お客様側のお手続きは不要です。',
});

/**
 * @param {number} subtotal Nonnegative integer yen, before discount and tax.
 * @param {{ applyCoupon: boolean, otherDiscountAmount?: number }} options
 * The existing formal-quote implementation floors 10% tax to integer yen.
 * This helper does not decide eligibility, reserve or consume a coupon.
 * Defensive support for sub-3,000 inputs keeps the arithmetic nonnegative.
 * The formal-quote database path enforces the approved 3,000-yen minimum.
 */
export function calculateTrialCoupon(subtotal, options) {
  const validYen = value => Number.isSafeInteger(value) && value >= 0 && value <= 1800000000;
  if (!validYen(subtotal)) throw new RangeError('税抜金額が不正です。');
  if (!options || typeof options.applyCoupon !== 'boolean') throw new TypeError('適用区分を指定してください。');
  const otherDiscountAmount = options.otherDiscountAmount ?? 0;
  if (!validYen(otherDiscountAmount) || otherDiscountAmount > subtotal) throw new RangeError('他の値引額が不正です。');
  if (options.applyCoupon && otherDiscountAmount > 0) throw new Error('他の割引との併用はできません。');
  const couponDiscountAmount = options.applyCoupon ? Math.min(subtotal, TRIAL_COUPON_AMOUNT) : 0;
  const taxableAmount = subtotal - couponDiscountAmount - otherDiscountAmount;
  const taxAmount = Math.floor(taxableAmount / 10);
  return {
    subtotal,
    couponDiscountAmount,
    otherDiscountAmount,
    taxableAmount,
    taxAmount,
    totalAmount: taxableAmount + taxAmount,
    application: options.applyCoupon ? (subtotal <= TRIAL_COUPON_AMOUNT ? 'full' : 'partial') : 'ineligible',
    unusedAmountCarriedForward: 0,
    couponZeroDelivery: options.applyCoupon && taxableAmount === 0,
  };
}
