import { Resend } from 'resend';

export type NotificationPayload = {
  company?: string;
  name?: string;
  email?: string;
  usage?: string;
  style?: string;
  quantity?: number;
  notes?: string;
  complexityScore?: number;
  totalPrice?: number;
  requestFormalQuote?: boolean;
};

export async function sendNotificationEmail(payload: NotificationPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_TO_EMAIL || 'k-hioki@create-support.co.jp';
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';

  if (!apiKey) {
    console.log('RESEND_API_KEY is missing:', payload);
    return { ok: false };
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from,
    to,
    subject: `【AI概算見積り】${payload.totalPrice?.toLocaleString() ?? ''}円 / 新規送信`,
    text: `
AI概算見積りフォームから送信がありました。

■お客様情報
会社名：${payload.company || ''}
お名前：${payload.name || ''}
メール：${payload.email || ''}

■見積り条件
用途：${payload.usage || ''}
表現：${payload.style || ''}
点数：${payload.quantity || 1}
正式見積り希望：${payload.requestFormalQuote ? 'あり' : 'なし'}

■AI判定
複雑さスコア：${payload.complexityScore ?? '-'}
概算金額：${payload.totalPrice?.toLocaleString() ?? '-'}円

■備考
${payload.notes || ''}

※このメールはAI概算見積りフォームから自動送信されています。
`,
  });

  return { ok: true };
}
