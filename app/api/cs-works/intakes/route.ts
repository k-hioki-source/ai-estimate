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
  // Read saved mail labels using the already authenticated administrator client.
  const { data: intake, error: intakeError } = await a.db.from('project_intakes').select('company_name,title,version').eq('id', b.id).single();
  if (intakeError || !intake || intake.version !== b.version) return failure();
  const token = randomBytes(32).toString('base64url');
  const { data: invite, error } = await service.rpc('csworks_issue_invitation', { p_intake_id: b.id, p_version: b.version, p_actor: a.user.id, p_hash: createHash('sha256').update(token).digest('hex') });
  if (error) return failure(error.code);
  const url = base.origin + '/invite#' + token;
  const subject = `【クリエイトサポート】ご依頼案件の確認のご案内｜${intake.title}`;
  const expires = `${new Date(invite.expires_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}（日本時間）`;
  const paragraphs = [
   'このたびは、イラスト制作についてお問い合わせいただき、誠にありがとうございます。',
   'お問い合わせいただいた内容を案件として受け付けいたしました。',
   '弊社の専用システム「CS Works」では、ご依頼内容や進行状況、今後ご案内するお見積りをご確認いただけます。',
   '初めてご利用の方は、無料のアカウント登録をお願いいたします。登録済みの方は、ログインしてご確認ください。',
   '下記のボタンから、招待メールが届いたメールアドレスで登録またはログインし、「案件を受け取る」を押してください。',
  ];
  const notes = '招待の承諾だけでは発注されません。心当たりがない場合は操作せず、このメールを破棄してください。';
  const text = `${intake.company_name}\n${invite.contact_name} 様\n\n${paragraphs.slice(0, 2).join('\n\n')}\n\n案件名：${intake.title}\n\n${paragraphs.slice(2).join('\n\n')}\n\n【ご依頼案件を確認する】\n${url}\n\n※招待リンクの有効期限：${expires}\n\n${notes}\n\nご不明な点がございましたら、お気軽にお問い合わせください。\n\n株式会社クリエイトサポート\nCS Works イラスト制作管理サービス`;
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const p = (value: string) => `<p style="margin:0 0 20px;">${escape(value)}</p>`;
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ご依頼案件の確認のご案内</title></head><body style="margin:0;padding:0;background:#f3f6fa;color:#243247;font-family:Arial,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;font-size:16px;line-height:1.8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dce4ee;"><tr><td style="padding:24px;background:#164c83;color:#ffffff;"><strong style="font-size:20px;">株式会社クリエイトサポート</strong><br><span style="font-size:13px;">CS Works イラスト制作管理サービス</span></td></tr><tr><td style="padding:28px 24px;overflow-wrap:anywhere;">
${p(intake.company_name)}${p(invite.contact_name + ' 様')}${paragraphs.slice(0, 2).map(p).join('')}
<div style="margin:24px 0;padding:18px;background:#eef5fb;border-left:4px solid #164c83;"><span style="font-size:13px;color:#52657b;">案件名</span><br><strong style="font-size:20px;">${escape(intake.title)}</strong></div>
${paragraphs.slice(2).map(p).join('')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td bgcolor="#1664b7" style="border-radius:6px;"><a href="${escape(url)}" style="display:inline-block;padding:14px 22px;color:#ffffff;text-decoration:none;font-weight:bold;">ご依頼案件を確認する</a></td></tr></table>
${p('※招待リンクの有効期限：' + expires)}<p style="font-size:13px;color:#52657b;">ボタンが表示されない場合は、以下のURLを開いてください。<br><a href="${escape(url)}" style="color:#1664b7;word-break:break-all;">${escape(url)}</a></p>
<p style="font-size:13px;color:#52657b;">${escape(notes)}</p>${p('ご不明な点がございましたら、お気軽にお問い合わせください。')}
<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #dce4ee;">株式会社クリエイトサポート<br>CS Works イラスト制作管理サービス</p></td></tr></table></td></tr></table></body></html>`;
  if (mode === 'capture') {
   const { error } = await service.rpc('csworks_finish_invitation', { p_id: invite.id, p_state: 'captured', p_provider_id: null });
   return error ? failure() : reply({ captured: true, preview: { to: invite.email, subject, text, html, url } });
  }
  let state = 'unknown', providerId: string | null = null;
  try { const r = await new Resend(process.env.RESEND_API_KEY).emails.send({ from: process.env.FROM_EMAIL!, to: invite.email, subject, text, html }, { idempotencyKey: 'csworks-invitation/' + invite.id }); state = r.error ? 'failed' : 'sent'; providerId = r.data?.id ?? null; } catch { state = 'unknown'; }
  const { error: finishError } = await service.rpc('csworks_finish_invitation', { p_id: invite.id, p_state: state, p_provider_id: providerId });
  if (finishError || state !== 'sent') return reply({ error: '送信結果を確定できません。履歴を確認し、連続で再送しないでください。' }, 502);
  return reply({ ok: true });
 } catch { return failure(); }
}
