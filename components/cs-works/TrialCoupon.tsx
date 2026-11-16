import { TRIAL_COUPON_COPY } from '../../lib/cs-works/trial-coupon.mjs';

// Enable on live screens only after DB grant, redemption and invoicing are connected.
// Render the grant notice only for a grant confirmed by the server.
export function TrialCouponBadge() {
  return <p className="trialCouponBadge">{TRIAL_COUPON_COPY.badge}</p>;
}
export function TrialCouponSignupNote() {
  return <p className="trialCouponSignupNote">{TRIAL_COUPON_COPY.signup}</p>;
}
export function TrialCouponGrantNotice({ granted }: { granted: boolean }) {
  return granted ? <p role="status" className="trialCouponGrantNotice">{TRIAL_COUPON_COPY.granted}</p> : null;
}
export function TrialCouponExplanation() {
  return <section aria-labelledby="trial-coupon-heading" className="trialCouponExplanation">
    <h2 id="trial-coupon-heading">{TRIAL_COUPON_COPY.heading}</h2>
    <p>{TRIAL_COUPON_COPY.description}</p>
  </section>;
}
export function TrialCouponFaq() {
  return <details className="trialCouponFaq">
    <summary>{TRIAL_COUPON_COPY.question}</summary>
    <p>{TRIAL_COUPON_COPY.answer}</p>
  </details>;
}
