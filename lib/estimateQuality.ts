import { createClient } from '@supabase/supabase-js';

export const QUALITY_CONSENT_VERSION = 'quality-review-7d-v1';
export function qualityConsent(form: FormData) {
  return form.get('qualityReviewConsent') === QUALITY_CONSENT_VERSION &&
    !['true','yes','on'].includes(String(form.get('requestFormalQuote') || '')) &&
    !String(form.get('email') || '').trim();
}
export function validateQualityReview(body: Record<string, unknown>, aiHours: number) {
  if (!Number.isInteger(body.revision) || (body.revision as number) < 0) throw new Error('更新番号を確認してください');
  if (!['pending','ok','corrected'].includes(String(body.status))) throw new Error('判定を選択してください');
  const status = String(body.status);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length > 2000) throw new Error('理由は2000文字以内で入力してください');
  const hours = status === 'ok' ? aiHours : status === 'pending' ? null : Number(body.hours);
  if (status === 'corrected' && (!Number.isFinite(hours) || hours! <= 0 || hours! > 1000 || !reason)) {
    throw new Error('適正工数（0より大きく1000時間以内）と理由を入力してください');
  }
  const hasLine = body.lineHours != null && body.lineHours !== '';
  const hasColor = body.colorHours != null && body.colorHours !== '';
  let line: number | null = null, color: number | null = null;
  if (status === 'corrected' && (hasLine || hasColor)) {
    line = Number(body.lineHours); color = Number(body.colorHours);
    if (!hasLine || !hasColor || !Number.isFinite(line) || !Number.isFinite(color) || line < 0 || color < 0 || Math.abs(line + color - hours!) > 0.01) {
      throw new Error('線画・彩色の両方を入力し、合計を適正工数と一致させてください');
    }
  }
  return {status,review_hours:hours,review_line_hours:line,review_color_hours:color,review_reason:status === 'pending' ? '' : reason};
}
export async function saveQualityReview(input: {
  estimateId: string; sourceType: string; usage: string; style: string; quantity: number;
  notes: string; imageBase64: string; imageMime: string; snapshot: object; hours: number; price: number;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('QUALITY_STORAGE_UNAVAILABLE');
  if (!['image/jpeg','image/png','image/webp'].includes(input.imageMime) || input.imageBase64.length > 4_194_304 || input.notes.length > 10000) {
    throw new Error('QUALITY_RECORD_TOO_LARGE');
  }
  const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error} = await db.from('estimate_quality_reviews').insert({
    estimate_id:input.estimateId,consent_version:QUALITY_CONSENT_VERSION,
    engine_version:process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    source_type:input.sourceType,usage:input.usage,style:input.style,quantity:input.quantity,
    notes:input.notes,image_mime:input.imageMime,image_base64:input.imageBase64,
    snapshot:input.snapshot,ai_hours:input.hours,ai_price:input.price,
  });
  if (error) throw new Error('QUALITY_SAVE_FAILED');
}
