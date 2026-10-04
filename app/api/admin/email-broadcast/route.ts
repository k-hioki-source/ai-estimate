import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MailInput = {
  mode?: 'test' | 'broadcast';
  subject?: string;
  body?: string;
};

function getBearerToken(request: NextRequest) {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function makeUserClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error('Supabase環境変数が設定されていません。');
  }

  return createClient(url, publishableKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function requireAdmin(request: NextRequest) {
  const token = getBearerToken(request);
  if (!token) {
    return { error: 'ログイン情報がありません。', status: 401 as const };
  }

  const supabase = makeUserClient(token);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return { error: 'ログイン情報を確認できませんでした。', status: 401 as const };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    return { error: '管理者権限がありません。', status: 403 as const };
  }

  return { supabase, user: userData.user };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ('error' in auth) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { supabase } = auth;

    const { count, error: countError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('newsletter_enabled', true)
      .not('email', 'is', null);

    if (countError) {
      return NextResponse.json(
        { ok: false, error: `配信対象人数を取得できませんでした: ${countError.message}` },
        { status: 500 }
      );
    }

    const { data: histories, error: historyError } = await (supabase
      .from('email_broadcasts' as any) as any)
      .select('id, subject, recipient_count, status, sent_at, created_at')
      .order('created_at', { ascending: false })
      .limit(30);

    if (historyError) {
      return NextResponse.json(
        { ok: false, error: `配信履歴を取得できませんでした: ${historyError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      recipientCount: count ?? 0,
      histories: histories ?? [],
    });
  } catch (e) {
    console.error('Email broadcast GET error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'メール配信情報の取得に失敗しました。' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if ('error' in auth) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { supabase, user } = auth;
    const input = (await request.json()) as MailInput;
    const mode = input.mode;
    const subject = input.subject?.trim() || '';
    const body = input.body?.trim() || '';

    if (mode !== 'test' && mode !== 'broadcast') {
      return NextResponse.json({ ok: false, error: '送信モードが不正です。' }, { status: 400 });
    }
    if (!subject) {
      return NextResponse.json({ ok: false, error: '件名を入力してください。' }, { status: 400 });
    }
    if (!body) {
      return NextResponse.json({ ok: false, error: '本文を入力してください。' }, { status: 400 });
    }
    if (subject.length > 200) {
      return NextResponse.json({ ok: false, error: '件名が長すぎます。' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'RESEND_API_KEYが設定されていません。' }, { status: 500 });
    }

    const resend = new Resend(apiKey);
    const signature = `

━━━━━━━━━━━━━━━━
株式会社クリエイトサポート
CS Works
https://www.create-support.co.jp/
━━━━━━━━━━━━━━━━`;

    if (mode === 'test') {
      if (!user.email) {
        return NextResponse.json(
          { ok: false, error: '管理者アカウントのメールアドレスを確認できませんでした。' },
          { status: 400 }
        );
      }

      const result = await resend.emails.send({
        from,
        to: user.email,
        subject: `【テスト】${subject}`,
        text: `${body}${signature}`,
      });

      if (result.error) {
        console.error('Broadcast test email error:', result.error);
        return NextResponse.json(
          { ok: false, error: `テスト送信に失敗しました: ${result.error.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({ ok: true, sentTo: user.email });
    }

    const { data: recipients, error: recipientError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('newsletter_enabled', true)
      .not('email', 'is', null);

    if (recipientError) {
      return NextResponse.json(
        { ok: false, error: `配信対象を取得できませんでした: ${recipientError.message}` },
        { status: 500 }
      );
    }

    const emails = Array.from(
      new Set(
        (recipients ?? [])
          .map((row: any) => String(row.email || '').trim().toLowerCase())
          .filter((email: string) => email.includes('@'))
      )
    );

    if (!emails.length) {
      return NextResponse.json({ ok: false, error: '配信対象の会員がいません。' }, { status: 400 });
    }

    // ResendのBatch APIを使い、宛先は1通につき1人だけにします。
    // 100件を超える場合も安全に分割します。
    const messages = emails.map((email) => ({
      from,
      to: email,
      subject,
      text: `${body}${signature}`,
    }));

    const resendAny = resend as any;
    if (!resendAny.batch?.send) {
      return NextResponse.json(
        { ok: false, error: '現在のResend SDKが一斉配信に対応していません。resendパッケージを更新してください。' },
        { status: 500 }
      );
    }

    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      const batchResult = await resendAny.batch.send(chunk);

      if (batchResult.error) {
        console.error('Broadcast batch error:', batchResult.error);
        return NextResponse.json(
          { ok: false, error: `メール配信に失敗しました: ${batchResult.error.message}` },
          { status: 500 }
        );
      }
    }

    const { error: historyInsertError } = await (supabase
      .from('email_broadcasts' as any) as any)
      .insert({
        subject,
        body,
        recipient_type: 'newsletter',
        recipient_count: emails.length,
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_by: user.id,
      });

    if (historyInsertError) {
      // メール自体は送信済みなので、ここで再送はしない。
      console.error('Broadcast history insert error:', historyInsertError);
      return NextResponse.json({
        ok: true,
        sentCount: emails.length,
        warning: `メールは送信済みですが、配信履歴の保存に失敗しました: ${historyInsertError.message}`,
      });
    }

    return NextResponse.json({ ok: true, sentCount: emails.length });
  } catch (e) {
    console.error('Email broadcast POST error:', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'メール配信に失敗しました。' },
      { status: 500 }
    );
  }
}
