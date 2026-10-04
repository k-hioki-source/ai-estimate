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

    // 1. Bearer token から利用者本人を確認する。
    const authClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser(token);
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

    // 2. service role はRLSを迂回できるため、削除前の所有権確認を必ずサーバー側で行う。
    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('id, user_id, status')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ ok: false, error: '案件を確認できませんでした。' }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'この案件のファイルは削除できません。' }, { status: 403 });
    }

    if (!['ordered', 'in_production', 'customer_review', 'revision'].includes(project.status)) {
      return NextResponse.json({ ok: false, error: '現在の案件状態では制作資料を削除できません。' }, { status: 409 });
    }

    const { data: file, error: fileError } = await admin
      .from('project_files')
      .select('id, project_id, uploaded_by, storage_path, file_type')
      .eq('id', fileId)
      .eq('project_id', projectId)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ ok: false, error: '制作資料が見つかりません。' }, { status: 404 });
    }

    if (file.uploaded_by !== user.id || file.file_type !== 'reference') {
      return NextResponse.json({ ok: false, error: 'この制作資料は削除できません。' }, { status: 403 });
    }

    // 3. Storageを先に削除。失敗時はDB行を残して再試行可能にする。
    const { error: storageError } = await admin.storage
      .from('project-files')
      .remove([file.storage_path]);

    if (storageError) {
      console.error('Project reference storage delete error:', storageError);
      return NextResponse.json({ ok: false, error: '保存ファイルを削除できませんでした。' }, { status: 500 });
    }

    // 4. Storage削除後にDB行を削除し、実際に1件消えたことを確認する。
    const { data: deletedRows, error: dbError } = await admin
      .from('project_files')
      .delete()
      .eq('id', file.id)
      .eq('project_id', projectId)
      .select('id');

    if (dbError || !deletedRows || deletedRows.length !== 1) {
      console.error('Project reference DB delete error:', dbError, deletedRows);
      return NextResponse.json(
        { ok: false, error: '保存ファイルは削除されましたが、ファイル情報の削除に失敗しました。管理者へご連絡ください。' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, deletedFileId: file.id });
  } catch (error) {
    console.error('Project reference delete API error:', error);
    return NextResponse.json({ ok: false, error: '制作資料の削除処理に失敗しました。' }, { status: 500 });
  }
}
