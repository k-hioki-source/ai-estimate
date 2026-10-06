import { Resend } from 'resend';

export type ConsultationMailPayload = {
  action: 'confirmed' | 'cancelled';
  bookingId: string;
  customerEmail?: string | null;
  customerName?: string | null;
  companyName?: string | null;
  title: string;
  startsAt: string;
  endsAt: string;
  meetUrl?: string | null;
  projectCode?: string | null;
};

const historyUrl = 'https://estimate.create-support.co.jp/mypage/consultations/history';
const adminUrl = 'https://estimate.create-support.co.jp/admin';
const tokyo = (value: string) => new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value));

/** Notification is best-effort: never throw into the booking/cancellation API. */
export async function sendConsultationEmails(payload: ConsultationMailPayload): Promise<void> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { console.error('Consultation email: RESEND_API_KEY missing'); return; }
    const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const admin = process.env.NOTIFY_TO_EMAIL || 'k-hioki@create-support.co.jp';
    const resend = new Resend(apiKey);
    const confirmed = payload.action === 'confirmed';
    const details = [
      `予約ID：${payload.bookingId}`,
      `相談件名：${payload.title}`,
      `日時：${tokyo(payload.startsAt)} ～ ${tokyo(payload.endsAt)}`,
      ...(payload.projectCode ? [`関連案件：${payload.projectCode}`] : []),
    ].join('\n');
    const customerSubject = confirmed ? '【CS Works】オンライン相談のご予約が確定しました' : '【CS Works】オンライン相談のキャンセルを承りました';
    const adminSubject = confirmed ? '【CS Works】オンライン相談の新規予約' : '【CS Works】オンライン相談のキャンセル通知';
    const name = payload.customerName?.trim() || '';
    const company = payload.companyName?.trim() || '';
    const customerDisplayName = name ? `${company ? `${company}\n` : ''}${name} 様` : 'ご利用者様';
    const customerText = `${customerDisplayName}\n\n株式会社クリエイトサポートです。\n\n${confirmed ? 'オンライン相談のご予約が確定しました。' : 'オンライン相談のキャンセルを承りました。'}\n\n${details}\n${confirmed && payload.meetUrl ? `\nGoogle Meet参加URL：\n${payload.meetUrl}\n` : ''}\n予約履歴：\n${historyUrl}\n\n株式会社クリエイトサポート\n`;
    const adminText = `CS Worksのオンライン相談が${confirmed ? '予約されました。' : 'キャンセルされました。'}\n\n${details}\n会社名：${payload.companyName?.trim() || '未設定'}\n顧客名：${payload.customerName?.trim() || '未設定'}\n顧客メール：${payload.customerEmail || '未設定'}\n${confirmed && payload.meetUrl ? `Google Meet：${payload.meetUrl}\n` : ''}\n管理画面：${adminUrl}\n`;
    const tasks: { target: 'customer' | 'admin'; to: string; subject: string; text: string }[] = [
      { target: 'admin', to: admin, subject: adminSubject, text: adminText },
    ];
    if (payload.customerEmail?.trim()) tasks.push({ target: 'customer', to: payload.customerEmail.trim(), subject: customerSubject, text: customerText });
    else console.warn('Consultation email: customer email unavailable', { bookingId: payload.bookingId });
    const results = await Promise.allSettled(tasks.map(async task => {
      const result = await resend.emails.send({ from, to: task.to, subject: task.subject, text: task.text });
      if (result.error) throw new Error(result.error.message);
      return result.data?.id;
    }));
    results.forEach((result, index) => {
      if (result.status === 'rejected') console.error('Consultation email send failed', {
        bookingId: payload.bookingId, target: tasks[index].target,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });
  } catch (error) {
    console.error('Consultation email unexpected error', { bookingId: payload.bookingId,
      error: error instanceof Error ? error.message : String(error) });
  }
}
