// app/api/consult/route.ts

import { NextResponse } from 'next/server';
import { Resend } from 'resend';

export const runtime = 'nodejs';

const resend = new Resend(process.env.RESEND_API_KEY);

type ConsultRequest = {
  estimateId?: string;

  company?: string;
  name?: string;
  email?: string;
  phone?: string;

  consultationMessage?: string;

  productionMethod?: string;
  usage?: string;
  style?: string;
  quantity?: number | string;
  sourceType?: string;
  notes?: string;

  workType?: string;
  difficultyScore?: number;
  estimatedHours?: number;
  estimatedHoursMin?: number;
  estimatedHoursMax?: number;
  totalPrice?: number;

  confidenceScore?: number;
  confidenceLevel?: string;
  confidenceComment?: string;

  aiReason?: string;
  aiComment?: string;

  imageUrl?: string;
  imageFilename?: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value: unknown): string {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '';
  }

  return number.toLocaleString('ja-JP');
}

function displayValue(value: unknown, fallback = '未入力'): string {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return escapeHtml(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConsultRequest;

    const estimateId = body.estimateId?.trim() || '見積IDなし';
    const company = body.company?.trim() || '';
    const name = body.name?.trim() || '';
    const email = body.email?.trim() || '';
    const phone = body.phone?.trim() || '';
    const consultationMessage = body.consultationMessage?.trim() || '';

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: 'メールアドレスを入力してください。',
        },
        { status: 400 }
      );
    }

    if (!consultationMessage) {
      return NextResponse.json(
        {
          success: false,
          error: '相談内容を入力してください。',
        },
        { status: 400 }
      );
    }

    const adminEmail =
      process.env.ADMIN_EMAIL ||
      process.env.CONTACT_EMAIL ||
      'info@create-support.co.jp';

    const fromEmail =
      process.env.RESEND_FROM_EMAIL ||
      'AI自動見積り <noreply@create-support.co.jp>';

    const totalPriceText =
      body.totalPrice !== undefined && body.totalPrice !== null
        ? `${formatNumber(body.totalPrice)}円`
        : '未算出';

    const estimatedHoursText =
      body.estimatedHours !== undefined && body.estimatedHours !== null
        ? `${formatNumber(body.estimatedHours)}時間`
        : '未算出';

    const estimatedRangeText =
      body.estimatedHoursMin !== undefined ||
      body.estimatedHoursMax !== undefined
        ? `${formatNumber(body.estimatedHoursMin)}～${formatNumber(
            body.estimatedHoursMax
          )}時間`
        : '未算出';

    const adminHtml = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.7; color: #222;">
        <h2 style="margin-bottom: 20px;">AI概算見積りから相談がありました</h2>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px;">
          相談内容
        </h3>

        <p style="white-space: pre-wrap; background: #f7f7f7; padding: 16px; border-radius: 6px;">
          ${escapeHtml(consultationMessage)}
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px;">
          お客様情報
        </h3>

        <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
          <tbody>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd; width: 180px;">会社名</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(company)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">お名前</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(name)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">メール</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(email)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">電話番号</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(phone)}</td>
            </tr>
          </tbody>
        </table>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
          AI見積り情報
        </h3>

        <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
          <tbody>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd; width: 180px;">見積ID</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(estimateId)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">制作方法</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.productionMethod)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">用途</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.usage)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">表現</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.style)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">点数</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.quantity)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">資料種別</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.sourceType)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">作業タイプ</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.workType)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">難易度スコア</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.difficultyScore)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">想定制作時間</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(estimatedHoursText)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">想定時間範囲</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(estimatedRangeText)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">概算金額</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(totalPriceText)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">AI見積り精度</th>
              <td style="padding: 8px; border: 1px solid #ddd;">
                ${displayValue(body.confidenceScore)}
                ${
                  body.confidenceScore !== undefined &&
                  body.confidenceScore !== null
                    ? '%'
                    : ''
                }
                ${body.confidenceLevel ? `（${escapeHtml(body.confidenceLevel)}）` : ''}
              </td>
            </tr>
          </tbody>
        </table>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
          AI判定コメント
        </h3>

        <p style="white-space: pre-wrap;">
          ${displayValue(body.aiReason)}
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
          AIコメント
        </h3>

        <p style="white-space: pre-wrap;">
          ${displayValue(body.aiComment)}
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
          精度コメント
        </h3>

        <p style="white-space: pre-wrap;">
          ${displayValue(body.confidenceComment)}
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
          お客様入力内容
        </h3>

        <p style="white-space: pre-wrap;">
          ${displayValue(body.notes)}
        </p>

        ${
          body.imageUrl
            ? `
              <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
                参考画像
              </h3>
              <p>
                <a href="${escapeHtml(body.imageUrl)}" target="_blank" rel="noopener noreferrer">
                  ${escapeHtml(body.imageFilename || '参考画像を開く')}
                </a>
              </p>
            `
            : ''
        }
      </div>
    `;

    const customerHtml = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.8; color: #222;">
        <p>${escapeHtml(name || 'お客様')}</p>

        <p>
          このたびは、株式会社クリエイトサポートのAI概算見積りをご利用いただき、
          ありがとうございます。
        </p>

        <p>
          以下の内容で制作相談を受け付けました。
          内容を確認後、担当者よりご連絡いたします。
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px;">
          相談内容
        </h3>

        <p style="white-space: pre-wrap; background: #f7f7f7; padding: 16px; border-radius: 6px;">
          ${escapeHtml(consultationMessage)}
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px;">
          AI概算見積り
        </h3>

        <p>見積ID：${escapeHtml(estimateId)}</p>
        <p>概算金額：${escapeHtml(totalPriceText)}</p>
        <p>想定制作時間：${escapeHtml(estimatedHoursText)}</p>

        <p style="margin-top: 28px;">
          AIによる概算見積りは、参考画像や入力内容をもとに算出した目安です。
          正式な金額や納期は、制作内容を確認したうえでご案内いたします。
        </p>

        <p>
          株式会社クリエイトサポート<br />
          AI自動イラスト見積り
        </p>
      </div>
    `;

    const adminResult = await resend.emails.send({
      from: fromEmail,
      to: adminEmail,
      replyTo: email,
      subject: `【AI見積り相談】${estimateId} ${company || name || ''}`.trim(),
      html: adminHtml,
    });

    if (adminResult.error) {
      console.error('相談管理者メール送信エラー:', adminResult.error);

      return NextResponse.json(
        {
          success: false,
          error: '相談メールの送信に失敗しました。',
        },
        { status: 500 }
      );
    }

    const customerResult = await resend.emails.send({
      from: fromEmail,
      to: email,
      replyTo: adminEmail,
      subject: '【株式会社クリエイトサポート】制作相談を受け付けました',
      html: customerHtml,
    });

    if (customerResult.error) {
      console.error('相談自動返信メール送信エラー:', customerResult.error);
    }

    return NextResponse.json({
      success: true,
      message: '制作相談を受け付けました。',
      adminEmailId: adminResult.data?.id,
      customerEmailId: customerResult.data?.id,
    });
  } catch (error) {
    console.error('相談APIエラー:', error);

    return NextResponse.json(
      {
        success: false,
        error: '相談内容の送信中にエラーが発生しました。',
      },
      { status: 500 }
    );
  }
}
