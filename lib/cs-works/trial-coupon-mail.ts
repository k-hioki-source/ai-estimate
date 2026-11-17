import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { TRIAL_COUPON_COPY } from './trial-coupon.mjs';
export async function sendTrialCouponMail(userId?: string) {
 if (process.env.NEXT_PUBLIC_CSWORKS_TRIAL_COUPON !== 'true') return { sent: 0, failed: 0 };
 const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
 const mailKey = process.env.RESEND_API_KEY;
 if (!url || !key || !mailKey) throw Error('Coupon mail configuration missing');
 const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.rpc('csworks_claim_trial_coupon_mail',{p_user_id:userId ?? null});
 if(error) throw Error('Coupon mail queue unavailable');
 let sent=0,failed=0;
 for(const row of (data ?? []) as {grant_id:string;email:string}[]) {
  try {
   const result=await new Resend(mailKey).emails.send({
    from:process.env.FROM_EMAIL || 'onboarding@resend.dev',to:row.email,
    subject:'【CS Works】会員登録完了・初回お試しクーポンのご案内',
    text:'CS Worksへの会員登録が完了しました。\n\n'+TRIAL_COUPON_COPY.granted+'\n\n'+TRIAL_COUPON_COPY.description+'\n\nマイページ\nhttps://estimate.create-support.co.jp/mypage\n\n株式会社クリエイトサポート'
   },{idempotencyKey:'trial-coupon-'+row.grant_id});
   if(result.error) throw Error('Mail delivery failed');
   const marked=await db.from('trial_coupon_mail').update({sent_at:new Date().toISOString(),last_error:null}).eq('grant_id',row.grant_id);
   if(marked.error) throw Error('Mail status update failed');
   sent++;
  } catch {
   failed++;
   await db.from('trial_coupon_mail').update({claimed_at:null,last_error:'送信または送信記録に失敗。再試行待ち'}).eq('grant_id',row.grant_id);
  }
 }
 return {sent,failed};
}
