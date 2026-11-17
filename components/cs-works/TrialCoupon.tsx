import { TRIAL_COUPON_COPY } from '../../lib/cs-works/trial-coupon.mjs';

// Enable on live screens only after DB grant, redemption and invoicing are connected.
// Render the grant notice only for a grant confirmed by the server.
export function TrialCouponBanner() {
  return <aside className="trialCouponBanner" aria-label="初回お試しクーポンのご案内">
    <div className="trialCouponBannerCopy">
      <p className="trialCouponBannerTitle"><span className="trialCouponBannerIntro">新規会員登録で、</span><span>初回お試しクーポン</span><span className="trialCouponBannerValue">（<strong>3,000</strong>円分）</span><span className="trialCouponBannerGift">プレゼント</span></p>
      <p className="trialCouponBannerTerms">初回発注の正式見積りに自動適用。正式見積り3,000円以下なら全額をまかなえます（税抜）。</p>
    </div>
    <a className="trialCouponBannerCta" href="/signup">無料会員登録で受け取る<span aria-hidden="true">→</span></a>
    <style>{`
      .trialCouponBanner{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 24px;margin:10px 0 12px;border-radius:10px;background:linear-gradient(110deg,#102e60 0%,#124488 68%,#1757a0 100%);color:#fff;box-shadow:0 5px 16px rgba(16,46,96,.1)}
      .trialCouponBannerCopy{min-width:0}
      .trialCouponBanner .trialCouponBannerTitle{display:flex;align-items:baseline;flex-wrap:wrap;margin:0;color:#fff;font-size:21px;font-weight:750;line-height:1.5;letter-spacing:.01em}
      .trialCouponBannerIntro{font-size:14px;font-weight:600;margin-right:8px}
      .trialCouponBannerValue{color:#ffe47c;white-space:nowrap}
      .trialCouponBannerValue strong{font-size:32px;letter-spacing:.015em;font-weight:800}
      .trialCouponBannerGift{font-size:17px;margin-left:3px}
      .trialCouponBanner .trialCouponBannerTerms{margin:5px 0 0;color:#e1ebfa;font-size:11px;font-weight:400;line-height:1.8}
      .trialCouponBanner .trialCouponBannerCta{display:inline-flex;align-items:center;justify-content:center;gap:14px;flex-shrink:0;padding:15px 18px;border-radius:7px;background:#ffdc55;color:#17304e;font-size:14px;font-weight:750;line-height:1.4;text-decoration:none;white-space:nowrap;box-shadow:0 2px 0 rgba(0,0,0,.08)}
      .trialCouponBannerCta:hover{background:#ffe784}
      .trialCouponBannerCta:focus-visible{outline:3px solid #fff;outline-offset:4px}
      @media(max-width:1000px){.trialCouponBanner{gap:16px;padding:16px 20px}.trialCouponBannerIntro{flex-basis:100%;margin:0}.trialCouponBanner .trialCouponBannerTitle{font-size:19px}.trialCouponBannerValue strong{font-size:29px}.trialCouponBannerGift{font-size:15px}}
      @media(max-width:640px){.trialCouponBanner{flex-direction:column;align-items:stretch;gap:12px;padding:16px;border-radius:8px;margin-top:8px}.trialCouponBanner .trialCouponBannerTitle{font-size:18px}.trialCouponBannerIntro{font-size:12px;margin-bottom:2px}.trialCouponBannerValue strong{font-size:28px}.trialCouponBannerGift{font-size:14px}.trialCouponBanner .trialCouponBannerTerms{font-size:11px;margin-top:6px}.trialCouponBanner .trialCouponBannerCta{padding:12px 16px;font-size:13px}}
    `}</style>
  </aside>;
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
