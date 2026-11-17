import { TRIAL_COUPON_COPY } from '../../lib/cs-works/trial-coupon.mjs';

// Enable on live screens only after DB grant, redemption and invoicing are connected.
// Render the grant notice only for a grant confirmed by the server.
export function TrialCouponBadge() {
  return <p className="trialCouponBadge" style={{padding:"12px 20px",border:"1px solid #bfdbfe",borderRadius:12,background:"#eff6ff",color:"#164c83",fontWeight:700}}>{TRIAL_COUPON_COPY.badge}</p>;
}
export function TrialCouponSignupNote() {
  return <p className="trialCouponSignupNote" style={{lineHeight:1.8,color:"#164c83"}}>{TRIAL_COUPON_COPY.signup}</p>;
}
export function TrialCouponGrantNotice({ granted }: { granted: boolean }) {
  return granted ? <p role="status" className="trialCouponGrantNotice">{TRIAL_COUPON_COPY.granted}</p> : null;
}
export function TrialCouponExplanation() {
  return <section aria-labelledby="trial-coupon-heading" className="trialCouponExplanation" style={{padding:24,margin:"32px 0",border:"1px solid #dbeafe",borderRadius:12,background:"#f8fbff",lineHeight:1.8}}>
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
