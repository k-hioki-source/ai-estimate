import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const respond = (data: object, status = 200) => NextResponse.json(data, {
    status, headers: { 'Cache-Control': 'no-store, private' },
  });
  try {
    const authorization = request.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return respond({ error: 'ログインが必要です。' }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publicKey || !serviceKey) return respond({ error: 'サーバー設定が不足しています。' }, 500);

    const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: identityError } = await auth.auth.getUser(authorization.slice(7).trim());
    if (identityError || !identity.user) return respond({ error: 'ログインし直してください。' }, 401);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await db.from('profiles')
      .select('role').eq('id', identity.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') {
      return respond({ error: '管理者のみ利用できます。' }, 403);
    }

    const pageSize = 500;
    const maxRows = 10000;
    const counts = new Map<string, number>();
    let scanned = 0;
    let missingPaths = 0;
    while (scanned < maxRows) {
      const { data, error } = await db.from('project_files')
        .select('id,storage_path')
        .order('id', { ascending: true })
        .range(scanned, scanned + pageSize - 1);
      if (error) return respond({ error: 'ファイル参照情報を取得できませんでした。' }, 500);
      for (const file of data ?? []) {
        const path = typeof file.storage_path === 'string' ? file.storage_path.trim() : '';
        if (!path) { missingPaths++; continue; }
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
      const length = data?.length ?? 0;
      scanned += length;
      if (length < pageSize) break;
    }
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
    return respond({
      ok: true, dryRun: true, scannedRows: scanned, missingPaths,
      duplicatePathCount: duplicates.length,
      duplicateReferences: duplicates.reduce((total, [, count]) => total + count, 0),
      capped: scanned >= maxRows,
      // Avoid exposing raw private Storage paths in the UI.
      deletionEnabled: false, modifiedRows: 0, deletedFiles: 0,
    });
  } catch (error) {
    console.error('Retention reference check failed', error);
    return respond({ error: '参照重複の確認に失敗しました。' }, 500);
  }
}
