import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSupportEmail } from '../../../../lib/email';

export const runtime = 'nodejs';

type NotifyBody = { messageId?: unknown };

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      console.error('Support notify: Supabase configuration missing');
      return NextResponse.json({ error: 'サーバー設定を確認してください。' }, { status: 500 });
    }

    const supabase = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return NextResponse.json({ error: '認証できませんでした。' }, { status: 401 });

    let body: NotifyBody;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'リクエストが不正です。' }, { status: 400 }); }
    const messageId = body?.messageId;
    if (typeof messageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(messageId)) {
      return NextResponse.json({ error: 'メッセージIDが不正です。' }, { status: 400 });
    }

    // RLS適用下で、呼び出したユーザー自身の送信済みメッセージだけを参照する。
    const { data: msg, error: msgError } = await supabase
      .from('support_messages')
      .select('id, thread_id, user_id, sender_type, message, created_at')
      .eq('id', messageId)
      .eq('user_id', user.id)
      .single();
    if (msgError || !msg || !['customer', 'admin'].includes(msg.sender_type)) {
      return NextResponse.json({ error: '対象メッセージが見つかりません。' }, { status: 404 });
    }

    const { data: thread, error: threadError } = await supabase
      .from('support_threads')
      .select('id, user_id, subject')
      .eq('id', msg.thread_id)
      .single();
    if (threadError || !thread) return NextResponse.json({ error: '問い合わせが見つかりません。' }, { status: 404 });

    const { data: ownProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = ownProfile?.role === 'admin';
    if (msg.sender_type === 'admin' && !isAdmin) return NextResponse.json({ error: '権限がありません。' }, { status: 403 });
    if (msg.sender_type === 'customer' && thread.user_id !== user.id) return NextResponse.json({ error: '権限がありません。' }, { status: 403 });

    const { data: customerProfile, error: customerError } = await supabase
      .from('profiles')
      .select('contact_name, email')
      .eq('id', thread.user_id)
      .single();
    if (customerError && msg.sender_type === 'admin') {
      return NextResponse.json({ error: 'お客様情報を取得できませんでした。' }, { status: 500 });
    }

    const { count, error: countError } = await supabase
      .from('support_attachments')
      .select('id', { count: 'exact', head: true })
      .eq('message_id', msg.id);
    if (countError) console.error('Support notify: attachment count failed', countError);

    // 新規問い合わせか追加返信かは、保存済みメッセージの時系列から判定する。
    let type: 'new_inquiry' | 'customer_reply' | 'admin_reply' = 'admin_reply';
    if (msg.sender_type === 'customer') {
      const { data: firstMessage, error: firstError } = await supabase
        .from('support_messages')
        .select('id')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1);
      if (firstError) return NextResponse.json({ error: '問い合わせ履歴を確認できませんでした。' }, { status: 500 });
      type = firstMessage?.[0]?.id === msg.id ? 'new_inquiry' : 'customer_reply';
    }

    const result = await sendSupportEmail({
      type,
      threadId: thread.id,
      subject: thread.subject,
      message: msg.message,
      customerName: customerProfile?.contact_name ?? undefined,
      customerEmail: customerProfile?.email ?? (thread.user_id === user.id ? user.email : undefined) ?? undefined,
      attachmentCount: count ?? 0,
    });
    if (!result.ok) {
      console.error('Support notify: mail delivery failed', result.error);
      return NextResponse.json({ ok: false, error: '通知メールを送信できませんでした。メッセージは保存されています。' }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Support notify: unexpected error', error);
    return NextResponse.json({ error: '通知処理に失敗しました。' }, { status: 500 });
  }
}
