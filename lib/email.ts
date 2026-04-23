import { Resend } from 'resend';
import type { EstimateRequest, EstimateResult, VisionScore } from './pricing';

const resend = new Resend(process.env.RESEND_API_KEY);

function usageLabel(value: EstimateRequest['usage']) {
  switch (value) {
    case 'manual':
      return '取扱説明書';
    case 'parts':
      return 'パーツカタログ';
    case 'sales':
      return '販促用（リアルイラスト）';
  }
}

function styleLabel(value: EstimateRequest['style']) {
  switch (value) {
    case 'line':
      return '白黒線画';
    case 'color':
      return 'カラー';
    case 'real':
      return 'リアルタッチ';
  }
}

export async function sendEstimateNotification(params: {
  input: EstimateRequest;
  vision: VisionScore;
  estimate: EstimateResult;
}) {
  const to = process.env.NOTIFY_TO_EMAIL;
  const from = process.env.FROM_EMAIL;

  if (!to || !from) {
    console.warn('Mail env is not set. Skip email send.');
    return;
  }

  const { input, vision, estimate } = params;

  await resend.emails.send({
    from,
    to,
    subject: `【AI概算見積り】${input.companyName || input.customerName || 'お客様'} / ${estimate.total.toLocaleString()}円`,
    text: `AI概算見積りの受付がありました。

[お客様情報]
会社名: ${input.companyName}
担当者名: ${input.customerName}
メール: ${input.email}
正式見積り希望: ${input.requestFormalQuote ? '希望する' : '概算確認のみ'}

[入力条件]
用途: ${usageLabel(input.usage)}
サイズ: ${input.size}
表現: ${styleLabel(input.style)}
点数: ${input.quantity}
納期: ${input.rush}
備考: ${input.notes}

[AI判定]
subjectType: ${vision.subjectType}
complexityScore: ${vision.complexityScore}
partDensity: ${vision.partDensity}
occlusion: ${vision.occlusion}
lineDifficulty: ${vision.lineDifficulty}
realismRequirement: ${vision.realismRequirement}
structureComplexity: ${vision.structureComplexity}
confidence: ${vision.confidence}
reason: ${vision.reason}

[概算結果]
概算金額: ${estimate.total.toLocaleString()}円
納期目安: ${estimate.deliveryDays}
`
  });
}
