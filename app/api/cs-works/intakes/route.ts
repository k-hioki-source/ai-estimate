import { createHash, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextRequest } from 'next/server';
import { actor, body, failure, invitationsEnabled, reply, uuid } from '@/lib/cs-works/invitations-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
 if (!invitationsEnabled()) return reply({ error: 'Not found' }, 404);
 try { const a = await actor(req, true); if (!a) return reply({ error: '管理者ログインが必要です。' }, 403);
 const { data, error } = await a.db.rpc('csworks_list_intakes'); return error ? failure(error.code) : reply({ intakes: data }); } catch { return failure(); }
}
export async function POST(req: NextRequest) {
 if (!invitationsEnabled()) return reply({ error: 'Not found' }, 404);
 try {
  const a = await actor(req, true); if (!a) return reply({ error: '管理者ログインが必要です。' }, 403);
  let b; try { b = await body(req); } catch (e) { return reply({ error: (e as Error).message }, 400); }
  if (b.action === 'save') {
   if ((b.id !== null && !uuid(b.id)) || !Number.isSafeInteger(b.version) || b.version < 0) return reply({ error: '案件と版を確認してください。' }, 400);
   const { data, error } = await a.db.rpc('csworks_save_intake', { p_id: b.id, p_version: b.version, p_data: b.data });
   return error ? failure(error.code) : reply({ intake: data });
  }
  if (!uuid(b.id)) return reply({ error: '案件を指定してください。' }, 400);
  if (b.action === 'revoke') { const { error } = await a.db.rpc('csworks_revoke_invitation', { p_intake_id: b.id }); return error ? failure(error.code) : reply({ ok: true }); }
  if (b.action !== 'send' || !Number.isSafeInteger(b.version)) return reply({ error: '操作を確認してください。' }, 400);
  // Fail closed: real sending needs an explicit server setting. Default is disabled.
  const mode = process.env.CSWORKS_INVITATIONS_MAIL_MODE;
  if (mode !== 'capture' && mode !== 'send') return reply({ error: '招待メール送信は無効です。検証ではcapture設定を使用してください。' }, 503);
  const base = new URL(process.env.CSWORKS_APP_ORIGIN || '');
  if (base.pathname !== '/' || base.search || base.hash || base.username || base.password || (base.protocol !== 'https:' && !(mode === 'capture' && base.protocol === 'http:' && ['localhost','127.0.0.1'].includes(base.hostname)))) return failure();
  if (mode === 'send' && (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL)) return failure();
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = randomBytes(32).toString('base64url');
  const { data: invite, error } = await service.rpc('csworks_issue_invitation', { p_intake_id: b.id, p_version: b.version, p_actor: a.user.id, p_hash: createHash('sha256').update(token).digest('hex') });
  if (error) return failure(error.code);
  const url = base.origin + '/invite#' + token;
  const text = `${invite.contact_name} 様\n\nクリエイトサポートからCS Worksへの招待です。\n以下から登録またはログインし、「案件を受け取る」を押してください。\n${url}\n\n有効期限：${new Date(invite.expires_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}（日本時間）\n登録済みの方は同じメールアドレスでログインしてください。\n招待の承諾だけでは発注されません。資料・見積りは承諾後に確認できます。\n心当たりがない場合は操作せず、このメールを破棄してください。\n\n株式会社クリエイトサポート\nCS Works イラスト制作管理サービス`;
  if (mode === 'capture') {
   const { error } = await service.rpc('csworks_finish_invitation', { p_id: invite.id, p_state: 'captured', p_provider_id: null });
   return error ? failure() : reply({ captured: true, preview: { to: invite.email, text, url } });
  }
  let state = 'unknown', providerId: string | null = null;
  try { const r = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: process.env.FROM_EMAIL!, to: invite.email, subject: '【CS Works】案件のご招待', text }, { idempotencyKey: 'csworks-invitation/' + invite.id }); state = r.error ? 'failed' : 'sent'; providerId = r.data?.id ?? null; } catch { state = 'unknown'; }
  const { error: finishError } = await service.rpc('csworks_finish_invitation', { p_id: invite.id, p_state: state, p_provider_id: providerId });
  if (finishError || state !== 'sent') return reply({ error: '送信結果を確定できません。履歴を確認し、連続で再送しないでください。' }, 502);
  return reply({ ok: true });
 } catch { return failure(); }
}
