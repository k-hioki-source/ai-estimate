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
  systemHours?: number;
  aiEstimatedHours?: number;
  masterEstimatedHours?: number;
  masterCategory?: string;
  masterBaseHours?: number;
  masterAdjustmentHours?: number;
  masterAdjustments?: string[];
  masterMatchScore?: number;
  integratedHours?: number;
  integratedAgreementScore?: number;
  integratedAgreementLevel?: string;
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
    systemHours: payload.systemHours ?? payload.estimatedHours ?? null,
    aiEstimatedHours: payload.aiEstimatedHours ?? null,
    masterEstimatedHours: payload.masterEstimatedHours ?? null,
    masterCategory: payload.masterCategory || '',
    masterBaseHours: payload.masterBaseHours ?? null,
    masterAdjustmentHours: payload.masterAdjustmentHours ?? null,
    masterAdjustments: payload.masterAdjustments || [],
    masterMatchScore: payload.masterMatchScore ?? null,
    integratedHours: payload.integratedHours ?? null,
    integratedAgreementScore: payload.integratedAgreementScore ?? null,
    integratedAgreementLevel: payload.integratedAgreementLevel || '',
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

■3エンジン比較（検証用）
現行システム：${payload.systemHours ?? payload.estimatedHours ?? '-'}時間
AI独自推定：${payload.aiEstimatedHours ?? '-'}時間
工数マスター：${payload.masterEstimatedHours ?? '-'}時間
マスター分類：${payload.masterCategory || '-'}
基準工数：${payload.masterBaseHours ?? '-'}時間
補正工数：${payload.masterAdjustmentHours ?? 0}時間
補正内容：${payload.masterAdjustments?.length ? payload.masterAdjustments.join(' / ') : 'なし'}
マスター適合度：${payload.masterMatchScore ?? '-'}%
統合参考工数：${payload.integratedHours ?? '-'}時間
3方式一致度：${payload.integratedAgreementScore ?? '-'}%（${payload.integratedAgreementLevel || '-'}）
※顧客表示価格は3エンジンの統合参考工数をもとに算出しています。

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

■3エンジン比較（検証用）
現行システム：${payload.systemHours ?? payload.estimatedHours ?? '-'}時間
AI独自推定：${payload.aiEstimatedHours ?? '-'}時間
工数マスター：${payload.masterEstimatedHours ?? '-'}時間
マスター分類：${payload.masterCategory || '-'}
基準工数：${payload.masterBaseHours ?? '-'}時間
補正工数：${payload.masterAdjustmentHours ?? 0}時間
補正内容：${payload.masterAdjustments?.length ? payload.masterAdjustments.join(' / ') : 'なし'}
マスター適合度：${payload.masterMatchScore ?? '-'}%
統合参考工数：${payload.integratedHours ?? '-'}時間
3方式一致度：${payload.integratedAgreementScore ?? '-'}%（${payload.integratedAgreementLevel || '-'}）
※顧客表示価格は3エンジンの統合参考工数をもとに算出しています。

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

// =========================================================
// CS Works メール通知
// =========================================================

export type CsWorksMailPayload = {
  type:
    | 'quote_requested'
    | 'quote_presented'
    | 'review_requested'
    | 'ordered'
    | 'revision_requested'
    | 'approved'
    | 'delivered'
    | 'material_uploaded'
    | 'customer_message'
    | 'admin_message'
    | 'invoice_requested'
    | 'invoice_issued'
    | 'payment_completed';
  projectCode: string;
  projectId?: string;
  projectTitle?: string;
  customerName?: string;
  customerEmail?: string;
  quotedAmount?: number | null;
  confirmedDeadline?: string | null;
  message?: string;
};

export async function sendCsWorksEmail(payload: CsWorksMailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const toAdmin = process.env.NOTIFY_TO_EMAIL || 'k-hioki@create-support.co.jp';
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const myPageUrl = 'https://estimate.create-support.co.jp/mypage';

  if (!apiKey) {
    console.log('RESEND_API_KEY is missing:', payload);
    return { ok: false };
  }

  const resend = new Resend(apiKey);
  const projectName = payload.projectTitle
    ? `${payload.projectCode} / ${payload.projectTitle}`
    : payload.projectCode;

  if (
    payload.type === 'quote_presented' ||
    payload.type === 'review_requested' ||
    payload.type === 'delivered' ||
    payload.type === 'admin_message' ||
    payload.type === 'invoice_issued' ||
    payload.type === 'payment_completed'
  ) {
    if (!payload.customerEmail) {
      return { ok: false, error: 'customerEmail is required' };
    }

    const isQuote = payload.type === 'quote_presented';
    const isReviewRequested = payload.type === 'review_requested';
    const projectPageUrl = payload.projectId
      ? `https://estimate.create-support.co.jp/mypage/projects/${payload.projectId}`
      : myPageUrl;

    let subject = `【CS Works】案件のお知らせ（${payload.projectCode}）`;
    let text = '';

    if (isQuote) {
      subject = `【CS Works】正式見積りをご確認ください（${payload.projectCode}）`;
      text = `${payload.customerName || 'お客様'} 様

いつもお世話になっております。
株式会社クリエイトサポートです。

ご依頼いただいた案件の正式見積りをご用意しました。

■案件
${projectName}

■正式見積金額
${payload.quotedAmount != null ? `${payload.quotedAmount.toLocaleString()}円` : '-'}

■納期
${payload.confirmedDeadline || '-'}

下記のCS Works案件ページから内容をご確認いただき、
問題なければ発注手続きをお願いいたします。

${projectPageUrl}`;
    } else if (isReviewRequested) {
      subject = `【CS Works】制作内容をご確認ください（${payload.projectCode}）`;
      text = `${payload.customerName || 'お客様'} 様

いつもお世話になっております。
株式会社クリエイトサポートです。

ご依頼いただいた案件について、お客様確認用ファイルを登録しました。

■案件
${projectName}

下記のCS Works案件ページから内容をご確認ください。
問題がなければ「この内容で承認する」、
修正が必要な場合は「修正を依頼する」からご連絡ください。

${projectPageUrl}`;
    } else if (payload.type === 'delivered') {
      subject = `【CS Works】納品ファイルをご確認ください（${payload.projectCode}）`;
      text = `${payload.customerName || 'お客様'} 様

いつもお世話になっております。
株式会社クリエイトサポートです。

ご依頼いただいた案件の制作が完了し、納品ファイルを登録しました。

■案件
${projectName}

下記のCS Works案件ページから納品ファイルをご確認いただけます。

${projectPageUrl}`;
    } else if (payload.type === 'admin_message') {
      subject = `【CS Works】メッセージが届きました（${payload.projectCode}）`;
      text = `${payload.customerName || 'お客様'} 様

CS Worksでクリエイトサポートからメッセージが届きました。

■案件
${projectName}

■メッセージ
${payload.message || '-'}

返信・詳細確認はこちら：
${projectPageUrl}`;
    } else if (payload.type === 'invoice_issued') {
      subject = `【CS Works】請求書を発行しました（${payload.projectCode}）`;
      text = `${payload.customerName || 'お客様'} 様

ご依頼いただいた案件の請求書を発行しました。

■案件
${projectName}

CS Worksの案件ページから請求書をご確認ください。

${projectPageUrl}`;
    } else if (payload.type === 'payment_completed') {
      subject = `【CS Works】ご入金を確認しました（${payload.projectCode}）`;
      text = `${payload.customerName || 'お客様'} 様

ご入金を確認しました。ありがとうございます。
こちらの案件は完了となりました。

■案件
${projectName}

案件履歴はこちらからご確認いただけます。

${projectPageUrl}`;
    }

    text += `

━━━━━━━━━━━━━━━━
株式会社クリエイトサポート
CS Works｜イラスト・CG制作管理サービス

CS Works
https://estimate.create-support.co.jp/

株式会社クリエイトサポート
https://www.create-support.co.jp/
━━━━━━━━━━━━━━━━
`;

    const result = await resend.emails.send({
      from,
      to: payload.customerEmail,
      subject,
      text,
    });

    if (result.error) {
      console.error('CS Works お客様宛てメール送信失敗', result.error);
      return { ok: false, error: result.error };
    }

    return { ok: true, emailId: result.data?.id };
  }

  const isQuoteRequested = payload.type === 'quote_requested';
  const isOrder = payload.type === 'ordered';
  const isMaterialUploaded = payload.type === 'material_uploaded';
  const isCustomerMessage = payload.type === 'customer_message';
  const isInvoiceRequested = payload.type === 'invoice_requested';

  const result = await resend.emails.send({
    from,
    to: toAdmin,
    subject: isQuoteRequested
      ? `【CS Works】正式見積り依頼が届きました（${payload.projectCode}）`
      : isOrder
        ? `【CS Works】正式発注がありました（${payload.projectCode}）`
        : isMaterialUploaded
        ? `【CS Works】制作資料が追加されました（${payload.projectCode}）`
        : isCustomerMessage
          ? `【CS Works】お客様からメッセージが届きました（${payload.projectCode}）`
          : isInvoiceRequested
            ? `【CS Works】請求書発行依頼が届きました（${payload.projectCode}）`
            : payload.type === 'approved'
              ? `【CS Works】お客様から承認されました（${payload.projectCode}）`
              : `【CS Works】修正依頼がありました（${payload.projectCode}）`,
    text: isQuoteRequested
      ? `CS Worksで正式見積り依頼が届きました。

■案件
${projectName}

■お客様
${payload.customerName || '-'}

■メール
${payload.customerEmail || '-'}

正式見積りの作成・提示をお願いします。

${payload.projectId
  ? `https://estimate.create-support.co.jp/admin/projects/${payload.projectId}`
  : 'https://estimate.create-support.co.jp/admin'}
`
      : isOrder
        ? `CS Worksから正式発注がありました。

■案件
${projectName}

■お客様
${payload.customerName || '-'}

■メール
${payload.customerEmail || '-'}

■受注金額
${payload.quotedAmount != null ? `${payload.quotedAmount.toLocaleString()}円` : '-'}

■納期
${payload.confirmedDeadline || '-'}

管理画面で案件をご確認ください。

https://estimate.create-support.co.jp/admin
`
      : isMaterialUploaded
        ? `CS Worksでお客様から制作資料が追加されました。

■案件
${projectName}

■お客様
${payload.customerName || '-'}

■メール
${payload.customerEmail || '-'}

■追加された制作資料
${payload.message || '-'}

管理画面で制作資料をご確認ください。

${payload.projectId
  ? `https://estimate.create-support.co.jp/admin/projects/${payload.projectId}`
  : 'https://estimate.create-support.co.jp/admin'}
`
      : isCustomerMessage
        ? `CS Worksでお客様からメッセージが届きました。

■案件
${projectName}

■お客様
${payload.customerName || '-'}

■メッセージ
${payload.message || '-'}

返信・詳細確認：
${payload.projectId
  ? `https://estimate.create-support.co.jp/admin/projects/${payload.projectId}`
  : 'https://estimate.create-support.co.jp/admin'}
`
      : isInvoiceRequested
        ? `CS Worksで請求書発行依頼が届きました。

■案件
${projectName}

■お客様
${payload.customerName || '-'}

請求書の発行をお願いします。

${payload.projectId
  ? `https://estimate.create-support.co.jp/admin/projects/${payload.projectId}`
  : 'https://estimate.create-support.co.jp/admin'}
`
      : payload.type === 'approved'
        ? `CS Worksでお客様から制作内容の承認がありました。

■案件
${projectName}

■お客様
${payload.customerName || '未設定'}

■メール
${payload.customerEmail || '未設定'}

■承認コメント
${payload.message || '確認内容を承認しました。'}

制作内容が承認されました。
最終納品の準備を進めてください。

${payload.projectId
  ? `https://estimate.create-support.co.jp/admin/projects/${payload.projectId}`
  : 'https://estimate.create-support.co.jp/admin'}
`
        : `CS Worksから修正依頼がありました。

■案件
${projectName}

■お客様
${payload.customerName || '-'}

■メール
${payload.customerEmail || '-'}

■修正内容
${payload.message || '-'}

管理画面で内容をご確認ください。

https://estimate.create-support.co.jp/admin
`,
  });

  if (result.error) {
    console.error('CS Works 管理者宛てメール送信失敗', result.error);
    return { ok: false, error: result.error };
  }

  return { ok: true, emailId: result.data?.id };
}
