import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/google-calendar-auth';
import { validateQualityReview } from '../../../../lib/estimateQuality';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store, private'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(req:NextRequest){
 try{
  const auth=await requireAdmin(req.headers.get('authorization'));
  if(!auth)return json({error:'管理者ログインが必要です'},403);
  const id=req.nextUrl.searchParams.get('id');
  const now=new Date().toISOString();
  if(id){
   if(!uuid.test(id))return json({error:'不正なIDです'},400);
   const {data,error}=await auth.db.from('estimate_quality_reviews').select('*').eq('id',id).gt('expires_at',now).maybeSingle();
   if(error)throw error;if(!data)return json({error:'記録がないか保存期限を過ぎています'},404);
   return json({record:data});
  }
  const status=req.nextUrl.searchParams.get('status')||'pending';
  if(!['pending','ok','corrected','all'].includes(status))return json({error:'不正な絞り込みです'},400);
  const offset=Number(req.nextUrl.searchParams.get('offset')||0);
  if(!Number.isInteger(offset)||offset<0||offset>100000)return json({error:'不正なページです'},400);
  let query=auth.db.from('estimate_quality_reviews').select('id,estimate_id,created_at,expires_at,engine_version,source_type,usage,style,quantity,ai_hours,ai_price,status,review_hours,review_reason,revision',{count:'exact'}).gt('expires_at',now).order('created_at',{ascending:false}).range(offset,offset+49);
  if(status!=='all')query=query.eq('status',status);
  const {data,error,count}=await query;if(error)throw error;
  return json({records:data||[],count:count||0});
 }catch{return json({error:'検証記録を取得できませんでした'},500);}
}
export async function PATCH(req:NextRequest){
 try{
  const auth=await requireAdmin(req.headers.get('authorization'));
  if(!auth)return json({error:'管理者ログインが必要です'},403);
  const body=await req.json();if(!body||typeof body!=='object'||!uuid.test(body.id||''))return json({error:'不正な入力です'},400);
  const {data:current,error:readError}=await auth.db.from('estimate_quality_reviews').select('id,ai_hours,revision').eq('id',body.id).gt('expires_at',new Date().toISOString()).maybeSingle();
  if(readError)throw readError;if(!current)return json({error:'記録がないか保存期限を過ぎています'},404);
  let values;try{values=validateQualityReview(body,Number(current.ai_hours));}catch(e){return json({error:e instanceof Error?e.message:'入力を確認してください'},400);}
  const {data,error}=await auth.db.from('estimate_quality_reviews').update({...values,reviewed_by:auth.user.id,reviewed_at:values.status==='pending'?null:new Date().toISOString(),revision:body.revision+1})
   .eq('id',body.id).eq('revision',body.revision).gt('expires_at',new Date().toISOString()).select('id,revision').maybeSingle();
  if(error)throw error;if(!data)return json({error:'他の画面で更新されたか期限を過ぎています。再読込してください'},409);
  return json({ok:true,revision:data.revision});
 }catch{return json({error:'保存できませんでした'},500);}
}
