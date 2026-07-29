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

function displayValue(value: unknown, fallback = '$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD'): string {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return escapeHtml(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ConsultRequest;

    const estimateId = body.estimateId?.trim() || '$FFFD$FFFD$FFFD$FFFDID$FFFD$0202$FFFD';
    const company = body.company?.trim() || '';
    const name = body.name?.trim() || '';
    const email = body.email?.trim() || '';
    const phone = body.phone?.trim() || '';
    const consultationMessage = body.consultationMessage?.trim() || '';

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          error: '$FFFD$FFFD$FFFD[$FFFD$FFFD$FFFDA$FFFDh$FFFD$FFFD$FFFDX$FFFD$FFFD$FFFD$FFFD$0342$FFFD$FFFD$0102$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFDB',
        },
        { status: 400 }
      );
    }

    if (!consultationMessage) {
      return NextResponse.json(
        {
          success: false,
          error: '$FFFD$FFFD$FFFDk$FFFD$FFFDe$FFFD$FFFD$FFFD$FFFD$0342$FFFD$FFFD$0102$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFDB',
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
      'AI$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$03C2$FFFD <noreply@estimate.create-support.co.jp>';

    const totalPriceText =
      body.totalPrice !== undefined && body.totalPrice !== null
        ? `${formatNumber(body.totalPrice)}$FFFD~`
        : '$FFFD$FFFD$FFFDZ$FFFDo';

    const estimatedHoursText =
      body.estimatedHours !== undefined && body.estimatedHours !== null
        ? `${formatNumber(body.estimatedHours)}$FFFD$FFFD$FFFD$FFFD`
        : '$FFFD$FFFD$FFFDZ$FFFDo';

    const estimatedRangeText =
      body.estimatedHoursMin !== undefined ||
      body.estimatedHoursMax !== undefined
        ? `${formatNumber(body.estimatedHoursMin)}$FFFD`${formatNumber(
            body.estimatedHoursMax
          )}$FFFD$FFFD$FFFD$FFFD`
        : '$FFFD$FFFD$FFFDZ$FFFDo';

    const adminHtml = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.7; color: #222;">
        <h2 style="margin-bottom: 20px;">AI$FFFDT$FFFDZ$FFFD$FFFD$FFFD$03C2肩$FFFD$744A$FFFDk$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$0702$FFFD$FFFD$FFFD</h2>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px;">
          $FFFD$FFFD$FFFDk$FFFD$FFFDe
        </h3>

        <p style="white-space: pre-wrap; background: #f7f7f7; padding: 16px; border-radius: 6px;">
          ${escapeHtml(consultationMessage)}
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px;">
          $FFFD$FFFD$FFFDq$FFFDl$FFFD$FFFD$FFFD
        </h3>

        <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
          <tbody>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd; width: 180px;">$FFFD$FFFDЖ$FFFD</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(company)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFD$FFFD$FFFD$FFFD$FFFDO</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(name)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFD$FFFD$FFFD[$FFFD$FFFD</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(email)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFDd$FFFDb$FFFD$050D$FFFD</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(phone)}</td>
            </tr>
          </tbody>
        </table>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
          AI$FFFD$FFFD$FFFD$03C2$FFFD$FFFD$FFFD
        </h3>

        <table style="border-collapse: collapse; width: 100%; max-width: 720px;">
          <tbody>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd; width: 180px;">$FFFD$FFFD$FFFD$FFFDID</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(estimateId)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD@</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.productionMethod)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFDp$FFFDr</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.usage)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFD\$FFFD$FFFD</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.style)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFD_$FFFD$FFFD</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.quantity)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.sourceType)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFD$FFFD$0183^$FFFDC$FFFDv</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.workType)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFD$FFFD$0553x$FFFDX$FFFDR$FFFDA</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${displayValue(body.difficultyScore)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFDz$FFFD$8427$FFFD$C39E$FFFD$FFFD</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(estimatedHoursText)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFDz$FFFD莞$FFFD$0514$0348$FFFD</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(estimatedRangeText)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">$FFFDT$FFFDZ$FFFD$FFFDz</th>
              <td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(totalPriceText)}</td>
            </tr>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #ddd;">AI$FFFD$FFFD$FFFD$03C2萸$FFFDx</th>
              <td style="padding: 8px; border: 1px solid #ddd;">
                ${displayValue(body.confidenceScore)}
                ${
                  body.confidenceScore !== undefined &&
                  body.confidenceScore !== null
                    ? '%'
                    : ''
                }
                ${body.confidenceLevel ? `$FFFDi${escapeHtml(body.confidenceLevel)}$FFFDj` : ''}
              </td>
            </tr>
          </tbody>
        </table>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
          AI$FFFD$FFFD$FFFD$FFFDR$FFFD$FFFD$FFFD$FFFD$FFFDg
        </h3>

        <p style="white-space: pre-wrap;">
          ${displayValue(body.aiReason)}
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
          AI$FFFDR$FFFD$FFFD$FFFD$FFFD$FFFDg
        </h3>

        <p style="white-space: pre-wrap;">
          ${displayValue(body.aiComment)}
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
          $FFFD$FFFD$FFFDx$FFFDR$FFFD$FFFD$FFFD$FFFD$FFFDg
        </h3>

        <p style="white-space: pre-wrap;">
          ${displayValue(body.confidenceComment)}
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
          $FFFD$FFFD$FFFDq$FFFDl$FFFD$FFFD$FFFD$0353$FFFDe
        </h3>

        <p style="white-space: pre-wrap;">
          ${displayValue(body.notes)}
        </p>

        ${
          body.imageUrl
            ? `
              <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-top: 28px;">
                $FFFDQ$FFFDl$FFFD$645C
              </h3>
              <p>
                <a href="${escapeHtml(body.imageUrl)}" target="_blank" rel="noopener noreferrer">
                  ${escapeHtml(body.imageFilename || '$FFFDQ$FFFDl$FFFD$645C$FFFD$FFFDJ$FFFD$FFFD')}
                </a>
              </p>
            `
            : ''
        }
      </div>
    `;

    const customerHtml = `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.8; color: #222;">
        <p>${escapeHtml(name || '$FFFD$FFFD$FFFDq$FFFDl')}</p>

        <p>
          $FFFD$FFFD$FFFD$0302$FFFD$FFFDт$0341A$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$0403N$FFFD$FFFD$FFFDG$FFFDC$FFFDg$FFFDT$FFFD|$FFFD[$FFFDg$FFFD$FFFDAI$FFFDT$FFFDZ$FFFD$FFFD$FFFD$03C2$FFFD$FFFD$FFFD$FFFD$FFFD$FFFDp$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFDA
          $FFFD$FFFD$FFFD肪$FFFD$0182$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$0702$FFFD$FFFDB
        </p>

        <p>
          $FFFD$0209$FFFD$FFFD$0313$FFFDe$FFFD$0150$FFFD$FFFD$C44A$FFFDk$FFFD$FFFD$DACA$DFD5t$FFFD$FFFD$FFFD$0702$FFFD$FFFD$FFFD$FFFDB
          $FFFD$FFFDe$FFFD$FFFDm$FFFDF$FFFD$FFFDA$FFFDS$FFFD$FFFD$FFFD$0482$FFFD育$FFFDA$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$0702$FFFD$FFFDB
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px;">
          $FFFD$FFFD$FFFDk$FFFD$FFFDe
        </h3>

        <p style="white-space: pre-wrap; background: #f7f7f7; padding: 16px; border-radius: 6px;">
          ${escapeHtml(consultationMessage)}
        </p>

        <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 8px;">
          AI$FFFDT$FFFDZ$FFFD$FFFD$FFFD$03C2$FFFD
        </h3>

        <p>$FFFD$FFFD$FFFD$FFFDID$FFFDF${escapeHtml(estimateId)}</p>
        <p>$FFFDT$FFFDZ$FFFD$FFFDz$FFFDF${escapeHtml(totalPriceText)}</p>
        <p>$FFFDz$FFFD$8427$FFFD$C39E$FFFD$0501F${escapeHtml(estimatedHoursText)}</p>

        <p style="margin-top: 28px;">
          AI$FFFD$0242$FFFD$FFFDT$FFFDZ$FFFD$FFFD$FFFD$03C2$FFFD$0341A$FFFDQ$FFFDl$FFFD$645C$FFFD$FFFD$FFFD$FFFD$0353$FFFDe$FFFD$FFFD$FFFD$0182$024EZ$FFFDo$FFFD$FFFD$FFFD$FFFD$FFFD$0688$FFFD$FFFD$0142$FFFD$FFFDB
          $FFFD$FFFD$FFFD$FFFD$FFFD$020B$FFFDz$FFFD$FFFD[$FFFD$FFFD$FFFD$0341A$FFFD$FFFD$FFFD$FFFD$FFFDe$FFFD$FFFDm$FFFDF$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$0142$FFFD$FFFD$0113$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$0702$FFFD$FFFDB
        </p>

        <p>
          $FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$0403N$FFFD$FFFD$FFFDG$FFFDC$FFFDg$FFFDT$FFFD|$FFFD[$FFFDg<br />
          AI$FFFD$FFFD$FFFD$FFFD$FFFDC$FFFD$FFFD$FFFDX$FFFDg$FFFD$FFFD$FFFD$03C2$FFFD
        </p>
      </div>
    `;

    const adminResult = await resend.emails.send({
      from: fromEmail,
      to: adminEmail,
      replyTo: email,
      subject: `$FFFDyAI$FFFD$FFFD$FFFD$03C2$844A$FFFDk$FFFDz${estimateId} ${company || name || ''}`.trim(),
      html: adminHtml,
    });

    if (adminResult.error) {
      console.error('$FFFD$FFFD$FFFDk$FFFD$01D7$FFFD$FFFD$0483$FFFD$FFFD[$FFFD$FFFD$FFFD$FFFD$FFFDM$FFFDG$FFFD$FFFD$FFFD[:', adminResult.error);

      return NextResponse.json(
        {
          success: false,
          error: '$FFFD$FFFD$FFFDk$FFFD$FFFD$FFFD[$FFFD$FFFD$FFFD$0311$FFFD$FFFDM$FFFD$024E$FFFD$FFFDs$FFFD$FFFD$FFFD$0702$FFFD$FFFD$FFFD$FFFDB',
        },
        { status: 500 }
      );
    }

    const customerResult = await resend.emails.send({
      from: fromEmail,
      to: email,
      replyTo: adminEmail,
      subject: `$FFFDy$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$0403N$FFFD$FFFD$FFFDG$FFFDC$FFFDg$FFFDT$FFFD|$FFFD[$FFFDg$FFFDz$FFFD$FFFD$FFFD$C44A$FFFDk$FFFD$FFFD$DACA$DFD5t$FFFD$FFFD$FFFD$0702$FFFD$FFFD$FFFD`,
      html: customerHtml,
    });

    if (customerResult.error) {
      console.error('$FFFD$FFFD$FFFDk$FFFD$FFFD$FFFD$FFFD$FFFD$0510M$FFFD$FFFD$FFFD[$FFFD$FFFD$FFFD$FFFD$FFFDM$FFFDG$FFFD$FFFD$FFFD[:', customerResult.error);
    }

    return NextResponse.json({
      success: true,
      message: '$FFFD$FFFD$FFFD$C44A$FFFDk$FFFD$FFFD$DACA$DFD5t$FFFD$FFFD$FFFD$0702$FFFD$FFFD$FFFD$FFFDB',
      adminEmailId: adminResult.data?.id,
      customerEmailId: customerResult.data?.id,
    });
  } catch (error) {
    console.error('$FFFD$FFFD$FFFDkAPI$FFFDG$FFFD$FFFD$FFFD[:', error);

    return NextResponse.json(
      {
        success: false,
        error: '$FFFD$FFFD$FFFDk$FFFD$FFFDe$FFFD$0311$FFFD$FFFDM$FFFD$FFFD$FFFD$0243G$FFFD$FFFD$FFFD[$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$FFFD$0702$FFFD$FFFD$FFFD$FFFDB',
      },
      { status: 500 }
    );
  }
}