import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/google-calendar-auth';
import { getConsultationHours, validConsultationHours } from '../../../../lib/consultation-hours';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, {status,headers:{'Cache-Control':'no-store'}});
export async function GET(request: NextRequest) {
 try {
  const admin = await requireAdmin(request.headers.get('authorization'));
  if (!admin) return json({error:'管理者権限が必要です'},403);
  return json(await getConsultationHours());
 } catch(e) { console.error('Settings read failed',e); return json({error:'設定を取得できません'},500); }
}
export async function PUT(request: NextRequest) {
 try {
  const admin = await requireAdmin(request.headers.get('authorization'));
  if (!admin) return json({error:'管理者権限が必要です'},403);
  const body = await request.json() as {start?:unknown;end?:unknown};
  if (typeof body.start !== 'string' || typeof body.end !== 'string' || !validConsultationHours({start:body.start,end:body.end})) return json({error:'受付時間は30分単位で、終了は開始より後にしてください'},400);
  const {error} = await admin.db.from('consultation_settings').update({start_time:body.start,end_time:body.end,updated_at:new Date().toISOString()}).eq('id',1);
  if (error) throw error;
  return json({start:body.start,end:body.end});
 } catch(e) { console.error('Settings update failed',e); return json({error:'設定を保存できません'},500); }
}
