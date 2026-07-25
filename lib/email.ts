import { Resend } from 'resend';

export type NotificationPayload = {
  company?: string;
  name?: string;
  email?: string;
  usage?: string;
  style?: string;
  quantity?: number;
  sourceType?: string;
  notes?: string;
  complexityScore?: number;
  totalPrice?: number;
  requestFormalQuote?: boolean;
  aiReason?: string;
  workType?: string;
  difficultyScore?: number;
  confidenceScore?: number;
  confidenceLevel?: string;
  confidenceComment?: string;
  aiComment?: string;
  estimatedHours?: number;
  estimateId?: string;

  imageAttachment?: {
    filename: string;
    content: string; // base64
  };
};

function createEstimateId() {
  const now = new Date();

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');

  const time = String(now.getTime()).slice(-6);

  return `EST-${y}${m}${d}-${time}`;
}

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

  const estimateId = payload.estimateId || createEstimateId();
  const submittedAt = new Date().toISOString();

  const difficultyScore =
    payload.difficultyScore ?? payload.complexityScore ?? null;

  const aiComment =
    payload.aiComment || payload.aiReason || '';

  const aiEstimateData = {
    estimateId,
    submittedAt,
    companyName: payload.company || '',
    contactName: payload.name || '',
    email: payload.email || '',
    sourceType: payload.sourceType || '',
    usage: payload.usage || '',
    style: payload.style || '',
    quantity: payload.quantity || 1,
    requestFormalQuote: isFormal,
    workType: payload.workType || '',
    difficultyScore,
    estimatedHours: payload.estimatedHours ?? null,
    estimatedPrice: payload.totalPrice ?? null,
    confidenceScore: payload.confidenceScore ?? null,
    confidenceLevel: payload.confidenceLevel || '',
    confidenceComment: payload.confidenceComment || '',
    aiComment,
    notes: payload.notes || '',
  };

  // =========================
  // ■① 管理者宛メール
  // =========================
  const adminResult = await resend.emails.send({
    from,
    to: toAdmin,
    subject: isFormal
      ? `【正式見積り依頼】${payload.totalPrice?.toLocaleString() ?? ''}円 / 新規送信`
      : `【AI概算見積り】${payload.totalPrice?.toLocaleString() ?? ''}円 / 新規送信`,
    text: `
${isFormal ? '正式見積り依頼' : 'AI概算見積りフォーム'}から送信がありました。

見積ID：${estimateId}

■お客様情報
会社名：${payload.company || ''}
お名前：${payload.name || ''}
メール：${payload.email || ''}

■見積り条件
制作方法：${payload.sourceType || ''}
用途：${payload.usage || ''}
表現：${payload.style || ''}
点数：${payload.quantity || 1}
正式見積り希望：${payload.requestFormalQuote ? 'あり' : 'なし'}

■AI判定
作業タイプ：${payload.workType || '-'}
難易度スコア：${difficultyScore ?? '-'}
想定制作時間：${payload.estimatedHours ?? '-'}時間
概算金額：${payload.totalPrice?.toLocaleString() ?? '-'}円

AI判定コメント：
${aiComment || '-'}

■AI見積り精度
精度：${payload.confidenceScore ?? '-'}%
判定：${payload.confidenceLevel || '-'}
コメント：${payload.confidenceComment || '-'}

■備考
${payload.notes || ''}

※このメールはAI自動イラスト見積りフォームから自動送信されています。

----- AI_ESTIMATE_DATA_START -----
${JSON.stringify(aiEstimateData, null, 2)}
----- AI_ESTIMATE_DATA_END -----
`,
    attachments: payload.imageAttachment
      ? [
          {
            filename: payload.imageAttachment.filename,
            content: payload.imageAttachment.content,
          },
        ]
      : undefined,
  });

  let finalAdminResult = adminResult;

  // 添付ファイルが原因で失敗した場合に備えて、本文のみで1回再送します。
  if (adminResult.error && payload.imageAttachment) {
    console.error('管理者宛てメール送信に失敗したため、添付なしで再送します。', {
      estimateId,
      toAdmin,
      error: adminResult.error,
    });

    finalAdminResult = await resend.emails.send({
      from,
      to: toAdmin,
      subject: isFormal
        ? `【正式見積り依頼】${payload.totalPrice?.toLocaleString() ?? ''}円 / 新規送信`
        : `【AI概算見積り】${payload.totalPrice?.toLocaleString() ?? ''}円 / 新規送信`,
      text: `
${isFormal ? '正式見積り依頼' : 'AI概算見積りフォーム'}から送信がありました。

見積ID：${estimateId}

■お客様情報
会社名：${payload.company || ''}
お名前：${payload.name || ''}
メール：${payload.email || ''}

■見積り条件
制作方法：${payload.sourceType || ''}
用途：${payload.usage || ''}
表現：${payload.style || ''}
点数：${payload.quantity || 1}
正式見積り希望：${payload.requestFormalQuote ? 'あり' : 'なし'}

■AI判定
作業タイプ：${payload.workType || '-'}
難易度スコア：${difficultyScore ?? '-'}
想定制作時間：${payload.estimatedHours ?? '-'}時間
概算金額：${payload.totalPrice?.toLocaleString() ?? '-'}円

AI判定コメント：
${aiComment || '-'}

■AI見積り精度
精度：${payload.confidenceScore ?? '-'}%
判定：${payload.confidenceLevel || '-'}
コメント：${payload.confidenceComment || '-'}

■備考
${payload.notes || ''}

※添付ファイルの送信に失敗したため、本文のみ送信しています。

----- AI_ESTIMATE_DATA_START -----
${JSON.stringify(aiEstimateData, null, 2)}
----- AI_ESTIMATE_DATA_END -----
`,
    });
  }

  if (finalAdminResult.error) {
    console.error('管理者宛てメール送信に失敗しました。', {
      estimateId,
      toAdmin,
      error: finalAdminResult.error,
    });

    return {
      ok: false,
      estimateId,
      error: finalAdminResult.error,
      failedAt: 'admin',
    };
  }

  console.log('管理者宛てメール送信成功', {
    estimateId,
    emailId: finalAdminResult.data?.id,
    toAdmin,
  });

  // =========================
  // ■② ユーザー自動返信
  // =========================
  if (payload.email) {
    const customerResult = await resend.emails.send({
      from,
      to: payload.email,
      subject: isFormal
        ? '【自動返信】正式見積りのご依頼を受け付けました'
        : '【自動返信】AI概算見積り結果のご案内',
      text: `
${payload.name || ''} 様

この度は${isFormal ? '正式見積りをご依頼' : 'AI自動イラスト見積りをご利用'}いただき、誠にありがとうございます。
クリエイトサポートです。

以下の内容で${isFormal ? '正式見積りのご依頼' : '概算見積り'}を受け付けました。

━━━━━━━━━━━━━━━
■ご依頼内容
制作方法：${payload.sourceType || '未指定'}
用途：${payload.usage || '未指定'}
表現：${payload.style || '未指定'}
点数：${payload.quantity || 1}
正式見積り希望：${isFormal ? 'あり' : 'なし'}

■AI判定
作業タイプ：${payload.workType || '未判定'}
難易度スコア：${difficultyScore ?? '-'}
想定制作時間：${payload.estimatedHours ?? '-'}時間
AI概算金額：約 ${payload.totalPrice?.toLocaleString() ?? '-'} 円

■AI判定コメント
${aiComment || '画像とご入力内容をもとに概算金額を算出しました。'}

■お客様ご入力内容
${payload.notes || '未入力'}
━━━━━━━━━━━━━━━

※本メールはAIによる概算見積り結果のご案内です。
※実際の制作費は、支給資料の内容・描き込み量・修正範囲・納期などにより変動する場合がございます。

${isFormal
  ? `担当者が内容を確認のうえ、正式なお見積りをご案内いたします。
通常1営業日以内を目安にご連絡いたします。`
  : `ご予算調整や仕様相談だけでも歓迎しております。

「この内容だと実際いくらになる？」
「こうすると安くなる？」
「写真だけでも依頼できる？」

といったご相談もお気軽にご返信ください。

イラスト相談・正式見積りはこちら
https://www.create-support.co.jp/contact/`
}

────────────────
株式会社クリエイトサポート
担当：日置 勝己
Mail：k-hioki@create-support.co.jp
Mobile：090-2943-2763
https://www.create-support.co.jp/
────────────────
`,
    });

    if (customerResult.error) {
      console.error('お客様宛てメール送信に失敗しました。', {
        estimateId,
        customerEmail: payload.email,
        error: customerResult.error,
      });

      return {
        ok: false,
        estimateId,
        error: customerResult.error,
        failedAt: 'customer',
      };
    }

    console.log('お客様宛てメール送信成功', {
      estimateId,
      emailId: customerResult.data?.id,
    });
  }

  return { ok: true, estimateId };
}