import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

/** Admin-only test email. Does not touch project, retention or notification records. */
export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return reply({ error: 'ログインが必要です。' }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    if (!url || !publicKey || !serviceKey || !resendKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);

    const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: authError } = await auth.auth.getUser(authorization.slice(7).trim());
    if (authError || !userData.user) return reply({ error: 'ログインし直してください。' }, 401);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);

    const resend = new Resend(resendKey);
    const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const to = process.env.NOTIFY_TO_EMAIL || 'k-hioki@create-support.co.jp';
    const result = await resend.emails.send({
      from, to,
      subject: '【CS Works／テスト】ファイル保管期限のお知らせ',
      text: '※これはCS Worksのファイル保管期限通知の送信テストです。実際の削除対象案件はありません。\n\n' +
        '案件完了から23日後に管理者へ通知し、30日後を削除予定日とする機能のメール疎通を確認しています。\n' +
        '管理者が「削除保留」に設定した案件は対象外です。\n\n' +
        '※本テストでは案件データの変更・ファイル削除は一切行いません。\n\n' +
        'ファイル保管管理：\nhttps://estimate.create-support.co.jp/admin/file-retention\n\n' +
        '株式会社クリエイトサポート\nCS Works',
    });
    if (result.error) {
      console.error('Retention test email failed', result.error);
      return reply({ error: 'テストメールを送信できませんでした。' }, 500);
    }
    return reply({ ok: true, test: true, sent: true, recipient: to, deletionEnabled: false });
  } catch (error) {
    console.error('Retention test email error', error);
    return reply({ error: 'テストメール送信に失敗しました。' }, 500);
  }
}
