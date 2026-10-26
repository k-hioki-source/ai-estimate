import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const TEST_PROJECT = 'c5723ed4-bdbe-439d-88a1-f1d7213f654f';
const EXPECTED_PATH = TEST_PROJECT + '/_retention_storage_probe_061a5e64-1018-4c88-a5f6-c2cf688a3288.txt';
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

/** Deletes exactly one explicitly identified synthetic probe after validating its content and references. */
export async function POST(request: NextRequest) {
  // Deletion testing has ended. Keep historical code for audit, never execute it.
  const testMutationEnabled = false;
  if (!testMutationEnabled) {
    return NextResponse.json({ error: '削除テスト・テストデータ変更は終了し、無効化されています。' }, {
      status: 403, headers: { 'Cache-Control': 'no-store, private' },
    });
  }

  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return reply({ error: '認証が必要です。' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !service) return reply({ error: 'サーバー設定が不足しています。' }, 500);
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await auth.auth.getUser(header.slice(7).trim());
  if (identityError || !identity.user) return reply({ error: '再ログインしてください。' }, 401);
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', identity.user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);
  const { data: references, error: referenceError } = await db.from('project_files')
    .select('id').eq('storage_path', EXPECTED_PATH).limit(1);
  if (referenceError) return reply({ error: 'DB参照の確認に失敗しました。' }, 500);
  if ((references ?? []).length > 0) return reply({ error: 'DBに参照があるため削除しません。' }, 409);
  const storage = db.storage.from('project-files');
  const { data: blob, error: readError } = await storage.download(EXPECTED_PATH);
  if (readError || !blob) return reply({ error: '対象テストファイルが存在しないか、読み取れません。' }, 404);
  const expectedName = EXPECTED_PATH.split('/').pop()!;
  if (await blob.text() !== 'CS_WORKS_RETENTION_TEST_ONLY:' + expectedName) {
    return reply({ error: 'テスト用の内容と一致しないため削除しません。' }, 409);
  }
  const { error: deleteError } = await storage.remove([EXPECTED_PATH]);
  if (deleteError) return reply({ error: 'Storage削除に失敗しました。' }, 500);
  const { data: remaining, error: listError } = await storage.list(TEST_PROJECT, { search: expectedName, limit: 1000 });
  if (listError) return reply({ error: '削除しましたが、削除後の確認に失敗しました。' }, 500);
  const absent = !(remaining ?? []).some(item => item.name === expectedName);
  return reply({ ok: absent, testOnly: true, storageDeleted: true, absent,
    path: EXPECTED_PATH, dbRowsChanged: 0, existingFilesTouched: 0, automaticDeletionEnabled: false }, absent ? 200 : 409);
}
