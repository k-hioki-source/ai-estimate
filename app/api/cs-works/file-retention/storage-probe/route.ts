import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TEST_PROJECT = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

// Preparation only: creates a uniquely named disposable Storage object.
// Does not delete files or modify project_files / retention jobs.
export async function POST(request: NextRequest) {
  const bearer = request.headers.get('authorization') ?? '';
  if (!bearer.startsWith('Bearer ')) return reply({ error: 'ログインが必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
  const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: authError } = await auth.auth.getUser(bearer.slice(7).trim());
  if (authError || !identity.user) return reply({ error: '再ログインしてください。' }, 401);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles').select('role')
    .eq('id', identity.user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);
  const { data: project, error: projectError } = await db.from('projects').select('id')
    .eq('id', TEST_PROJECT).maybeSingle();
  if (projectError || !project) return reply({ error: 'テスト案件が見つかりません。' }, 404);

  const name = '_retention_storage_probe_' + randomUUID() + '.txt';
  const path = TEST_PROJECT + '/' + name;
  const { error: uploadError } = await db.storage.from('project-files').upload(
    path, new TextEncoder().encode('CS_WORKS_RETENTION_TEST_ONLY:' + name),
    { contentType: 'text/plain', upsert: false },
  );
  if (uploadError) return reply({ error: 'テスト用Storageファイルを作成できませんでした。' }, 500);
  const { data, error: readError } = await db.storage.from('project-files').download(path);
  return reply({
    ok: !readError && !!data, testOnly: true, storagePath: path,
    uploaded: true, readable: !readError && !!data,
    storageDeleted: false, dbRecordsChanged: 0, automaticDeletionEnabled: false,
    ...(readError ? { error: 'ファイルを作成しましたが、読み取り確認に失敗しました。' } : {}),
  }, readError ? 500 : 200);
}
