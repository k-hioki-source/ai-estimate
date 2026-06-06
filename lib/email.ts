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

  imageAttachment?: {
    filename: string;
    content: string; // base64
  };
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

  const isFormal = payload.requestFormalQuote === true;

  // =========================
  // ■① 管理者宛メール
  // =========================
  await resend.emails.send({
    from,
    to: toAdmin,
    subject: isFormal
      ? `【正式見積り依頼】${payload.totalPrice?.toLocaleString() ?? ''}円 / 新規送信`
      : `【AI概算見積り】${payload.totalPrice?.toLocaleString() ?? ''}円 / 新規送信`,
    text: `
${isFormal ? '正式見積り依頼' : 'AI概算見積りフォーム'}から送信がありました。

■お客様情報
会社名：${payload.company || ''}
お名前：${payload.name || ''}
メール：${payload.email || ''}

■見積り条件
用途：${payload.usage || ''}
表現：${payload.style || ''}
点数：${payload.quantity || 1}
正式見積り希望：${isFormal ? 'あり' : 'なし'}

■AI判定
難易度スコア：${payload.complexityScore ?? '-'}
概算金額：${payload.totalPrice?.toLocaleString() ?? '-'}円

■備考
${payload.notes || ''}

※このメールはAI自動イラスト見積りフォームから自動送信されています。
`,
    attachments:
      isFormal && payload.imageAttachment
        ? [
            {
              filename: payload.imageAttachment.filename,
              content: payload.imageAttachment.content,
            },
          ]
        : undefined,
  });

  // =========================
  // ■② ユーザー自動返信
  // =========================
  if (payload.email) {
    await resend.emails.send({
      from,
      to: payload.email,
      subject: isFormal
        ? '【自動返信】正式見積りのご依頼を受け付けました'
        : '【自動返信】AI概算見積り結果のご案内',
      text: isFormal
        ? `
${payload.name || ''} 様

この度は正式見積りをご依頼いただき、誠にありがとうございます。
クリエイトサポートです。

以下の内容で正式見積りのご依頼を受け付けました。

━━━━━━━━━━━━━━━
■ご依頼内容
用途：${payload.usage || ''}
表現：${payload.style || ''}
点数：${payload.quantity || 1}

■AI概算金額
約 ${payload.totalPrice?.toLocaleString() ?? '-'} 円
━━━━━━━━━━━━━━━

担当者が内容を確認のうえ、正式なお見積りをご案内いたします。
通常1営業日以内を目安にご連絡いたします。

ご不明な点がございましたら、お気軽にお問い合わせください。

────────────────
株式会社クリエイトサポート
https://www.create-support.co.jp/
────────────────
`
        : `
${payload.name || ''} 様

この度はAI自動イラスト見積りをご利用いただき、ありがとうございます。
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

本メールはAIによる概算見積り結果のご案内です。
正式なお見積りをご希望の場合は、見積り結果画面の
「この内容で正式見積りを依頼する」ボタンをご利用ください。

内容を確認のうえ、正式なお見積りをご案内いたします。

────────────────
株式会社クリエイトサポート
https://www.create-support.co.jp/
────────────────
`,
    });
  }

  return { ok: true };
}
