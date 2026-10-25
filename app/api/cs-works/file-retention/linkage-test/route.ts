import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: object, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store, private' },
});

/** Read-only checks of project_files ↔ project_file_shares references. */
export async function POST(request: NextRequest) {
  try {
    const header = request.headers.get('authorization') ?? '';
    if (!header.startsWith('Bearer ')) return reply({ error: 'ログインが必要です。' }, 401);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || !serviceKey) return reply({ error: 'サーバー設定が不足しています。' }, 500);
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await client.auth.getUser(header.slice(7).trim());
    if (authError || !auth.user) return reply({ error: 'ログインし直してください。' }, 401);
    const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (profileError || (profile as { role?: string } | null)?.role !== 'admin') return reply({ error: '管理者のみ実行できます。' }, 403);

    const { data: shares, error: sharesError } = await db.from('project_file_shares')
      .select('id,file_id,project_id,revoked_at,expires_at').order('created_at', { ascending: false }).limit(200);
    if (sharesError) return reply({ error: '共有リンク情報の取得に失敗しました。' }, 500);
    const ids = [...new Set((shares ?? []).map(s => s.file_id))];
    const { data: files, error: filesError } = ids.length
      ? await db.from('project_files').select('id,project_id,file_type,storage_path').in('id', ids)
      : { data: [], error: null };
    if (filesError) return reply({ error: 'ファイル情報の取得に失敗しました。' }, 500);
    const fileMap = new Map((files ?? []).map(f => [f.id, f]));
    let valid = 0, invalid = 0, active = 0;
    const issues: string[] = [];
    for (const share of shares ?? []) {
      const file = fileMap.get(share.file_id);
      const linked = !!file && file.project_id === share.project_id &&
        ['review', 'revision', 'delivery'].includes(file.file_type) && !!file.storage_path;
      if (linked) valid++;
      else { invalid++; issues.push('共有レコード ' + share.id + '：ファイルとの関連付け要確認'); }
      if (!share.revoked_at && Date.parse(share.expires_at) > Date.now()) active++;
    }
    return reply({ ok: true, dryRun: true, checkedShares: shares?.length ?? 0,
      linkedShares: valid, invalidShares: invalid, activeShares: active,
      truncated: (shares?.length ?? 0) === 200, issues: issues.slice(0, 20),
      deletedFiles: 0, changedRows: 0,
      note: '既存の関連付けを読み取り専用で確認します。共有リンクの無効化・DB削除は実行しません。' });
  } catch (error) {
    console.error('Retention linkage check failed', error);
    return reply({ error: '関連付けの照合に失敗しました。' }, 500);
  }
}
