import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DeleteInput = {
  projectId?: string;
  fileId?: string;
};

function getBearerToken(request: NextRequest) {
  const value = request.headers.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publishableKey || !serviceRoleKey) {
    throw new Error('Supabase環境変数が設定されていません。');
  }

  return { url, publishableKey, serviceRoleKey };
}

export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: 'ログイン情報がありません。' }, { status: 401 });
    }

    const { url, publishableKey, serviceRoleKey } = getSupabaseConfig();

    const userClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    const user = userData.user;
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: 'ログイン情報を確認できませんでした。' }, { status: 401 });
    }

    const body = (await request.json()) as DeleteInput;
    const projectId = body.projectId?.trim();
    const fileId = body.fileId?.trim();

    if (!projectId || !fileId) {
      return NextResponse.json({ ok: false, error: '削除対象が指定されていません。' }, { status: 400 });
    }

    // 本人権限＋既存RLSで案件を確認する。
    const { data: project, error: projectError } = await userClient
      .from('projects')
      .select('id, user_id, status')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      console.error('Project lookup error:', projectError);
      return NextResponse.json({ ok: false, error: `案件確認エラー: ${projectError.message}` }, { status: 500 });
    }

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: '案件を確認できませんでした。' }, { status: 404 });
    }

    if (!['ordered', 'in_production', 'customer_review', 'revision'].includes(project.status)) {
      return NextResponse.json({ ok: false, error: '現在の案件状態では制作資料を削除できません。' }, { status: 409 });
    }

    // 本人権限＋既存RLSで対象ファイルを取得する。
    const { data: file, error: fileError } = await userClient
      .from('project_files')
      .select('id, project_id, uploaded_by, storage_path, file_type')
      .eq('id', fileId)
      .eq('project_id', projectId)
      .maybeSingle();

    if (fileError) {
      console.error('Project file lookup error:', fileError);
      return NextResponse.json({ ok: false, error: `制作資料確認エラー: ${fileError.message}` }, { status: 500 });
    }

    if (!file) {
      return NextResponse.json({ ok: false, error: '制作資料が見つかりません。' }, { status: 404 });
    }

    if (file.uploaded_by !== user.id || file.file_type !== 'reference') {
      return NextResponse.json({ ok: false, error: 'この制作資料は削除できません。' }, { status: 403 });
    }

    // 所有権確認後だけservice roleを使用する。
    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: storageError } = await admin.storage
      .from('project-files')
      .remove([file.storage_path]);

    if (storageError) {
      console.error('Project reference storage delete error:', storageError);
      return NextResponse.json({ ok: false, error: `保存ファイルを削除できませんでした: ${storageError.message}` }, { status: 500 });
    }

    const { data: deletedRows, error: dbError } = await admin
      .from('project_files')
      .delete()
      .eq('id', file.id)
      .eq('project_id', projectId)
      .select('id');

    if (dbError || !deletedRows || deletedRows.length !== 1) {
      console.error('Project reference DB delete error:', dbError, deletedRows);
      return NextResponse.json(
        {
          ok: false,
          error: dbError
            ? `保存ファイルは削除されましたが、ファイル情報の削除に失敗しました: ${dbError.message}`
            : '保存ファイルは削除されましたが、ファイル情報の削除件数を確認できませんでした。',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, deletedFileId: file.id });
  } catch (error) {
    console.error('Project reference delete API error:', error);
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ ok: false, error: `制作資料の削除処理に失敗しました: ${message}` }, { status: 500 });
  }
}
