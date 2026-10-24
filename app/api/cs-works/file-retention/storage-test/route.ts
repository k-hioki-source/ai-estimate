import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function reply(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store, private' } });
}

/**
 * Isolated Storage lifecycle test. Does not access or modify projects,
 * project_files, project_file_shares, or customer-owned objects.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return reply({ error: 'ログインが必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
  const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await auth.auth.getUser(authHeader.slice(7).trim());
  if (userError || !userData.user) return reply({ error: 'ログインし直してください。' }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
  if (profileError || (profile as { role?: string } | null)?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);

  // Reserved, randomly generated test-only prefix. Never accept paths from requests.
  const path = '_csworks_retention_test/' + randomUUID() + '.txt';
  const bucket = admin.storage.from('project-files');
  const marker = 'CSWORKS_RETENTION_TEST_' + randomUUID();
  let uploaded = false;
  let verified = false;
  let deleted = false;
  let confirmedAbsent = false;
  let errorMessage = '';
  try {
    const { error: uploadError } = await bucket.upload(path, new TextEncoder().encode(marker), {
      contentType: 'text/plain', upsert: false,
    });
    if (uploadError) throw new Error('テストファイルのアップロードに失敗しました。');
    uploaded = true;
    const { data: downloadData, error: downloadError } = await bucket.download(path);
    if (downloadError || !downloadData || await downloadData.text() !== marker) {
      throw new Error('テストファイルの読み取り検証に失敗しました。');
    }
    verified = true;
    const { data: removed, error: removeError } = await bucket.remove([path]);
    if (removeError || !removed?.some(item => item.name === path)) {
      throw new Error('テストファイルの削除結果を確認できませんでした。');
    }
    deleted = true;
    const { error: afterError } = await bucket.download(path);
    confirmedAbsent = !!afterError;
    if (!confirmedAbsent) throw new Error('削除後もファイルを取得できました。');
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Storageテストに失敗しました。';
    console.error('Retention isolated storage test:', error);
  } finally {
    // Only clean up the unique object created in this request.
    if (uploaded && !deleted) {
      const { error: cleanupError } = await bucket.remove([path]);
      if (cleanupError) console.error('Retention test cleanup failed:', cleanupError);
    }
  }
  const ok = uploaded && verified && deleted && confirmedAbsent;
  return reply({ ok, testOnly: true, uploaded, verified, deleted, confirmedAbsent,
    realProjectsChanged: 0, databaseRowsChanged: 0,
    ...(ok ? {} : { error: errorMessage || 'Storageテストに失敗しました。' }) }, ok ? 200 : 500);
}
