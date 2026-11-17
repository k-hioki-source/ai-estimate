import { NextRequest,NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTrialCouponMail } from '../../../../lib/cs-works/trial-coupon-mail';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(data:object,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
async function actor(req:NextRequest) {
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(!token)return null;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw Error('Configuration');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
 const {data,error}=await db.auth.getUser(token);
 return !error&&data.user?.email_confirmed_at?{db,user:data.user}:null;
}
export async function GET(req:NextRequest) {
 if(process.env.NEXT_PUBLIC_CSWORKS_TRIAL_COUPON!=='true')return reply({error:'Not found'},404);
 try {
  const a=await actor(req);if(!a)return reply({error:'ログインが必要です。'},401);
  const from=req.nextUrl.searchParams.get('from'),to=req.nextUrl.searchParams.get('to');
  const uid=req.nextUrl.searchParams.get('userId');
  if(uid&&!/^[a-f0-9-]{36}$/i.test(uid))return reply({error:'会員を確認してください。'},400);
  if((from||to)&&(!from||!to||!/^\d{4}-\d{2}$/.test(from)||!/^\d{4}-\d{2}$/.test(to)))return reply({error:'集計月を指定してください。'},400);
  const r=from&&to?await a.db.rpc('csworks_trial_coupon_monthly',{p_from:from+'-01',p_to:to+'-01'}):await a.db.rpc('csworks_trial_coupon_status',{p_user_id:uid??null});
  if(r.error)return reply({error:r.error.code==='42501'?'権限がありません。':'クーポン設定を確認できません。'},r.error.code==='42501'?403:503);
  if(from&&to){
   const members=await a.db.rpc('csworks_trial_coupon_repeat_members',{p_from:from+'-01',p_to:to+'-01'});
   if(members.error)return reply({error:'再発注状況を確認できません。'},503);
   return reply({months:r.data,repeatMembers:members.data});
  }
  return reply(r.data);
 }catch{return reply({error:'クーポンを確認できません。'},503);}
}
export async function POST(req:NextRequest) {
 if(process.env.NEXT_PUBLIC_CSWORKS_TRIAL_COUPON!=='true')return reply({error:'Not found'},404);
 try {const a=await actor(req);if(!a)return reply({error:'ログインが必要です。'},401);return reply(await sendTrialCouponMail(a.user.id));}
 catch{return reply({error:'登録完了メールの送信を確認できません。'},503);}
}
