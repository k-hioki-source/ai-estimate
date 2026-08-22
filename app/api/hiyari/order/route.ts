import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

export const runtime = 'nodejs';

const resend = new Resend(process.env.RESEND_API_KEY);

function esc(v: unknown) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function yen(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString('ja-JP')}円` : '';
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const companyName = String(form.get('companyName') || '').trim();
    const customerName = String(form.get('customerName') || '').trim();
    const email = String(form.get('email') || '').trim();
    const phone = String(form.get('phone') || '').trim();
    const estimateId = String(form.get('estimateId') || '').trim();
    const incidentDescription = String(form.get('incidentDescription') || '').trim();
    const illustrationRequest = String(form.get('illustrationRequest') || '').trim();
    const quantity = String(form.get('quantity') || '1');
    const outputFormats = String(form.get('outputFormats') || 'AI,JPG,PNG');
    const totalPrice = String(form.get('totalPrice') || '');
    const unitPrice = String(form.get('unitPrice') || '');
    const deliveryDays = String(form.get('deliveryDays') || '');
    const hazardType = String(form.get('hazardType') || '');
    const hazardSummary = String(form.get('hazardSummary') || '');
    const illustrationPlan = String(form.get('illustrationPlan') || '');

    const image = form.get('image') as File | null;

    if (!companyName || !customerName || !email) {
      return NextResponse.json(
        { error: '会社名・ご担当者名・メールアドレスを入力してください。' },
        { status: 400 }
      );
    }

    if (!estimateId) {
      return NextResponse.json(
        { error: '見積IDがありません。もう一度AI概算見積りを実行してください。' },
        { status: 400 }
      );
    }

    const notifyTo =
      process.env.NOTIFY_TO_EMAIL || 'k-hioki@create-support.co.jp';
    const from =
      process.env.FROM_EMAIL ||
      'AIヒヤリハット見積り <onboarding@resend.dev>';

    const attachments: Array<{ filename: string; content: Buffer }> = [];

    if (image && image.size > 0) {
      const buffer = Buffer.from(await image.arrayBuffer());
      attachments.push({
        filename: image.name || 'hiyari-reference.jpg',
        content: buffer,
      });
    }

    const adminHtml = `
      <h2>【ヒヤリハット安全教育イラスト】発注申込み</h2>
      <p><strong>見積ID:</strong> ${esc(estimateId)}</p>

      <h3>お客様情報</h3>
      <p>
        会社名: ${esc(companyName)}<br>
        ご担当者名: ${esc(customerName)}<br>
        メール: ${esc(email)}<br>
        電話: ${esc(phone)}
      </p>

      <h3>ご依頼内容</h3>
      <p>
        点数: ${esc(quantity)}点<br>
        納品形式: ${esc(outputFormats)}<br>
        1点あたり概算: ${esc(yen(unitPrice))}<br>
        合計概算: ${esc(yen(totalPrice))}（税別）<br>
        納期目安: ${esc(deliveryDays)}
      </p>

      <h3>ヒヤリハット内容</h3>
      <p>${esc(incidentDescription).replaceAll('\n', '<br>')}</p>

      <h3>イラスト化の希望</h3>
      <p>${esc(illustrationRequest || '特になし').replaceAll('\n', '<br>')}</p>

      <h3>AI分析</h3>
      <p>
        分類: ${esc(hazardType)}<br>
        表現する状況: ${esc(hazardSummary)}<br>
        制作案: ${esc(illustrationPlan)}
      </p>

      <hr>
      <p>
        支払い方法: 法人向け請求書払い<br>
        制作タッチ: 安全教育カラーイラスト固定タッチ<br>
        納品予定形式: ${esc(outputFormats)}
      </p>
    `;

    await resend.emails.send({
      from,
      to: [notifyTo],
      replyTo: email,
      subject: `【発注申込み】【${estimateId}】ヒヤリハット安全教育イラスト`,
      html: adminHtml,
      attachments,
    });

    const customerHtml = `
      <p>${esc(companyName)}<br>${esc(customerName)} 様</p>

      <p>このたびは、ヒヤリハット安全教育イラストの発注申込みをいただき、ありがとうございます。</p>

      <p>
        <strong>見積ID:</strong> ${esc(estimateId)}<br>
        <strong>概算金額:</strong> ${esc(yen(totalPrice))}（税別）<br>
        <strong>点数:</strong> ${esc(quantity)}点<br>
        <strong>納期目安:</strong> ${esc(deliveryDays)}
      </p>

      <p>
        内容と現場写真を確認後、制作を進めます。<br>
        不明点や、概算条件から大きく変更になる点がある場合は担当者よりご連絡いたします。
      </p>

      <p>
        お支払いは法人向け請求書払いです。<br>
        制作完了後、AI / JPG / PNG等のご指定形式で納品し、請求書をご案内いたします。
      </p>

      <p>
        株式会社クリエイトサポート
      </p>
    `;

    await resend.emails.send({
      from,
      to: [email],
      subject: `【受付完了】【${estimateId}】ヒヤリハット安全教育イラスト`,
      html: customerHtml,
    });

    return NextResponse.json({
      ok: true,
      estimateId,
      message: '発注申込みを受け付けました。',
    });
  } catch (e) {
    console.error('HIYARI_ORDER_ERROR:', e);

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : '発注申込みの送信に失敗しました。',
      },
      { status: 500 }
    );
  }
}
