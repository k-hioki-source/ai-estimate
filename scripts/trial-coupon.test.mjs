import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTrialCoupon, TRIAL_COUPON_DEFAULT_LIMITS, TRIAL_COUPON_COPY } from '../lib/cs-works/trial-coupon.mjs';

for (const subtotal of [0, 1, 2999, 3000]) {
  test(`coupon covers subtotal ${subtotal} without carry-forward`, () => {
    const result = calculateTrialCoupon(subtotal, { applyCoupon: true });
    assert.equal(result.totalAmount, 0);
    assert.equal(result.taxAmount, 0);
    assert.equal(result.couponDiscountAmount, subtotal);
    assert.equal(result.application, 'full');
    assert.equal(result.couponZeroDelivery, true);
    assert.equal(result.unusedAmountCarriedForward, 0);
  });
}
test('10,000 yen becomes 7,000 taxable plus 700 tax', () => {
  const result = calculateTrialCoupon(10000, { applyCoupon: true });
  assert.equal(result.taxableAmount, 7000);
  assert.equal(result.taxAmount, 700);
  assert.equal(result.totalAmount, 7700);
  assert.equal(result.application, 'partial');
  assert.equal(result.couponZeroDelivery, false);
});
test('3,001 yen boundary follows existing integer tax rounding', () => {
  assert.equal(calculateTrialCoupon(3001, { applyCoupon: true }).totalAmount, 1);
});
test('ineligible quote keeps the original calculation', () => {
  const result = calculateTrialCoupon(10000, { applyCoupon: false });
  assert.equal(result.totalAmount, 11000);
  assert.equal(result.application, 'ineligible');
  assert.equal(result.couponDiscountAmount, 0);
  assert.equal(result.couponZeroDelivery, false);
});
test('coupon cannot combine with another discount', () => {
  assert.throws(() => calculateTrialCoupon(10000, { applyCoupon: true, otherDiscountAmount: 100 }));
});
test('invalid monetary values and missing application are rejected', () => {
  for (const amount of [-1, 1.5, NaN, Infinity, '3000', 1800000001]) {
    assert.throws(() => calculateTrialCoupon(amount, { applyCoupon: true }));
  }
  assert.throws(() => calculateTrialCoupon(10000, {}));
  assert.throws(() => calculateTrialCoupon(10000, { applyCoupon: false, otherDiscountAmount: 10001 }));
});
test('large supported subtotal remains within existing document int4', () => {
  assert.equal(calculateTrialCoupon(1800000000, { applyCoupon: true }).totalAmount, 1979996700);
});
test('limits and expiry start unset', () => {
  assert.deepEqual(TRIAL_COUPON_DEFAULT_LIMITS, { grantLimit: null, redemptionLimit: null, expiresAt: null });
});
test('copy retains signup, first-order and quote amount conditions', () => {
  assert.match(TRIAL_COUPON_COPY.signup, /会員登録/);
  assert.match(TRIAL_COUPON_COPY.signup, /初回発注/);
  assert.match(TRIAL_COUPON_COPY.signup, /正式見積り3,000円以下/);
});
