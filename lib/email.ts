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
  const toAdmin = process.env.NOTIFY_TO_EMAIL || 'k-hioki@create-support.co.jp';
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';

  if (!apiKey) {
    console.log('RESEND_API_KEY is missing:', payload);
    return { ok: false };
  }

  const resend = new Resend(apiKey);

  // =========================
  // ■① 管理者宛メール
  // =========================
  await resend.emails.send({
    from,
    to: toAdmin,
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

  // =========================
  // ■② ユーザー自動返信
  // =========================
  if (payload.email) {
    await resend.emails.send({
      from,
      to: payload.email,
      subject: '【自動返信】AI概算見積り結果のご案内',
      text: `
${payload.name || ''} 様

この度はお問い合わせいただきありがとうございます。
クリエイトサポートです。

以下の内容で概算見積りを受け付けました。

━━━━━━━━━━━━━━━
■ご依頼内容
用途：${payload.usage || ''}
表現：${payload.style || ''}
点数：${payload.quantity || 1}

■AI概算金額
約 ${payload.totalPrice?.toLocaleString() ?? '-'} 円
━━━━━━━━━━━━━━━

本内容をもとに、正式なお見積りをご希望の場合は、
そのまま本メールにご返信ください。

内容を確認のうえ、必要に応じてご連絡させていただきます。

────────────────
クリエイトサポート
https://www.create-support.co.jp/
────────────────
`,
    });
  }

  return { ok: true };
}
