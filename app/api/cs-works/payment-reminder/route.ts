import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatJaDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

function formatYmdJst(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const toAdmin = process.env.NOTIFY_TO_EMAIL || 'k-hioki@create-support.co.jp';

  if (!url || !serviceRoleKey || !resendKey) {
    return NextResponse.json(
      { ok: false, error: 'Required environment variables are missing.' },
      { status: 500 }
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const resend = new Resend(resendKey);

  // 日本時間の「7日後」を対象にする
  const now = new Date();
  const target = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const targetDate = formatYmdJst(target);

  const { data: invoices, error: invoiceError } = await supabase
    .from('project_invoices')
    .select('id, project_id, invoice_code, payment_due_date, total_amount, payment_reminder_sent_at')
    .eq('payment_due_date', targetDate)
    .is('payment_reminder_sent_at', null);

  if (invoiceError) {
    console.error('Payment reminder invoice load error:', invoiceError);
    return NextResponse.json({ ok: false, error: invoiceError.message }, { status: 500 });
  }

  if (!invoices?.length) {
    return NextResponse.json({ ok: true, targetDate, sent: 0 });
  }

  const adminRows: string[] = [];
  const adminAmounts: number[] = [];
  let customerSent = 0;
  let failed = 0;

  for (const invoice of invoices) {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, project_code, title, user_id, status')
      .eq('id', invoice.project_id)
      .single();

    if (projectError || !project || project.status !== 'invoiced') {
      continue;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_name, contact_name')
      .eq('id', project.user_id)
      .maybeSingle();

    const { data: authUser } = await supabase.auth.admin.getUserById(project.user_id);
    const customerEmail = authUser?.user?.email;

    if (!customerEmail) {
      failed++;
      continue;
    }

    const customerName = profile?.contact_name || 'お客様';
    const companyName = profile?.company_name || '';
    const dueDateJa = formatJaDate(invoice.payment_due_date);
    const amount = Number(invoice.total_amount || 0);
    const projectUrl = `https://estimate.create-support.co.jp/mypage/projects/${project.id}`;

    const customerResult = await resend.emails.send({
      from,
      to: customerEmail,
      subject: `【CS Works】${dueDateJa}がお支払期限です（${project.project_code}）`,
      text: `${customerName} 様

いつもお世話になっております。
株式会社クリエイトサポートです。

下記のご請求について、お支払期限が近づいておりますのでご案内いたします。

■案件
${project.project_code} / ${project.title || ''}

■請求書番号
${invoice.invoice_code}

■ご請求額
${amount.toLocaleString()}円

■お支払期限
${dueDateJa}

すでにお支払い手続き済みの場合は、本メールはご放念ください。

請求書・案件の確認：
${projectUrl}

━━━━━━━━━━━━━━━━
株式会社クリエイトサポート
CS Works｜イラスト・CG制作管理サービス

CS Works
https://estimate.create-support.co.jp/

株式会社クリエイトサポート
https://www.create-support.co.jp/
━━━━━━━━━━━━━━━━
`,
    });

    if (customerResult.error) {
      console.error('Customer payment reminder failed:', customerResult.error);
      failed++;
      continue;
    }

    adminRows.push(
      `${companyName || customerName} / ${project.project_code} / ${amount.toLocaleString()}円`
    );
    adminAmounts.push(amount);

    const { error: markError } = await supabase
      .from('project_invoices')
      .update({ payment_reminder_sent_at: new Date().toISOString() })
      .eq('id', invoice.id)
      .is('payment_reminder_sent_at', null);

    if (markError) {
      console.error('Payment reminder mark error:', markError);
    }
    customerSent++;
  }

  if (adminRows.length) {
    const totalAmount = adminAmounts.reduce((sum, amount) => sum + amount, 0);

    const dueDateJa = formatJaDate(targetDate);
    const adminResult = await resend.emails.send({
      from,
      to: toAdmin,
      subject: `【CS Works】${dueDateJa}の入金予定（${adminRows.length}件）`,
      text: `CS Worksから入金予定のお知らせです。

${dueDateJa}に、以下の入金予定があります。

${adminRows.map((row) => `・${row}`).join('\n')}

■今回の入金予定合計
${totalAmount.toLocaleString()}円

入金日に銀行口座をご確認いただき、入金を確認できた案件は
CS Works管理画面から「入金確認・案件完了」を押してください。

https://estimate.create-support.co.jp/admin

━━━━━━━━━━━━━━━━
株式会社クリエイトサポート
CS Works
https://estimate.create-support.co.jp/
━━━━━━━━━━━━━━━━
`,
    });

    if (adminResult.error) {
      console.error('Admin payment reminder failed:', adminResult.error);
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    targetDate,
    customerSent,
    failed,
  });
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const toAdmin = process.env.NOTIFY_TO_EMAIL || 'k-hioki@create-support.co.jp';

  if (!url || !publishableKey || !serviceRoleKey || !resendKey) {
    return NextResponse.json(
      { ok: false, error: 'Required environment variables are missing.' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const authClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const service = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: adminProfile } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  let body: { projectId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.projectId) {
    return NextResponse.json({ ok: false, error: 'projectId is required' }, { status: 400 });
  }

  const { data: project, error: projectError } = await service
    .from('projects')
    .select('id, project_code, title, user_id, status')
    .eq('id', body.projectId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  if (project.status !== 'invoiced') {
    return NextResponse.json(
      { ok: false, error: 'Only invoiced projects can be used for this test.' },
      { status: 400 }
    );
  }

  const { data: invoice, error: invoiceError } = await service
    .from('project_invoices')
    .select('id, invoice_code, payment_due_date, total_amount')
    .eq('project_id', project.id)
    .maybeSingle();

  if (invoiceError || !invoice) {
    return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 });
  }

  const { data: profile } = await service
    .from('profiles')
    .select('company_name, contact_name')
    .eq('id', project.user_id)
    .maybeSingle();

  const { data: authUser } = await service.auth.admin.getUserById(project.user_id);
  const customerEmail = authUser?.user?.email;
  if (!customerEmail) {
    return NextResponse.json({ ok: false, error: 'Customer email not found' }, { status: 400 });
  }

  const resend = new Resend(resendKey);
  const customerName = profile?.contact_name || 'お客様';
  const companyName = profile?.company_name || customerName;
  const dueDateJa = invoice.payment_due_date
    ? formatJaDate(invoice.payment_due_date)
    : '未設定';
  const amount = Number(invoice.total_amount || 0);
  const projectUrl = `https://estimate.create-support.co.jp/mypage/projects/${project.id}`;
  const adminUrl = `https://estimate.create-support.co.jp/admin/projects/${project.id}`;

  const customerResult = await resend.emails.send({
    from,
    to: customerEmail,
    subject: `【CS Works／テスト】${dueDateJa}がお支払期限です（${project.project_code}）`,
    text: `${customerName} 様

※これはCS Worksの支払期限リマインダーのテスト送信です。

いつもお世話になっております。
株式会社クリエイトサポートです。

下記のご請求について、お支払期限が近づいておりますのでご案内いたします。

■案件
${project.project_code} / ${project.title || ''}

■請求書番号
${invoice.invoice_code}

■ご請求額
${amount.toLocaleString()}円

■お支払期限
${dueDateJa}

すでにお支払い手続き済みの場合は、本メールはご放念ください。

請求書・案件の確認：
${projectUrl}

━━━━━━━━━━━━━━━━
株式会社クリエイトサポート
CS Works｜イラスト・CG制作管理サービス
https://estimate.create-support.co.jp/
━━━━━━━━━━━━━━━━
`,
  });

  if (customerResult.error) {
    console.error('Test customer payment reminder failed:', customerResult.error);
    return NextResponse.json(
      { ok: false, error: 'Customer test email failed.' },
      { status: 500 }
    );
  }

  const adminResult = await resend.emails.send({
    from,
    to: toAdmin,
    subject: `【CS Works／テスト】入金予定のお知らせ（${project.project_code}）`,
    text: `※これはCS Worksの支払期限リマインダーのテスト送信です。

CS Worksから入金予定のお知らせです。

■お客様
${companyName}

■案件
${project.project_code} / ${project.title || ''}

■請求書番号
${invoice.invoice_code}

■入金予定額
${amount.toLocaleString()}円

■支払期限
${dueDateJa}

入金日に銀行口座をご確認いただき、入金を確認できたら
「入金確認・案件完了」を押してください。

管理画面：
${adminUrl}
`,
  });

  if (adminResult.error) {
    console.error('Test admin payment reminder failed:', adminResult.error);
    return NextResponse.json(
      { ok: false, error: 'Admin test email failed. Customer test email was sent.' },
      { status: 500 }
    );
  }

  // テスト送信では payment_reminder_sent_at を更新しない。
  return NextResponse.json({
    ok: true,
    test: true,
    projectCode: project.project_code,
    customerEmail,
    customerSent: true,
    adminSent: true,
  });
}

