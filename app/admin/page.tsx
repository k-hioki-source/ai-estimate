'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type Project = Database['public']['Tables']['projects']['Row'];
type Estimate = Database['public']['Tables']['estimates']['Row'];

type ProjectFile = {
  id: string;
  project_id: string;
  uploaded_by: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  file_type: 'reference' | 'review' | 'revision' | 'delivery';
  created_at: string;
  signed_url?: string | null;
};

type ProjectMessage = {
  id: string;
  project_id: string;
  user_id: string;
  message: string;
  message_type: 'message' | 'revision_request' | 'approval' | 'system';
  created_at: string;
};

type Profile = {
  id: string;
  company_name: string | null;
  department_name: string | null;
  contact_name: string | null;
  email: string | null;
};

type ProjectWithData = Project & {
  estimate?: Estimate | null;
  customer?: Profile | null;
};

function formatDate(value: string | null) {
  if (!value) return '―';

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function statusLabel(status: Project['status']) {
  switch (status) {
    case 'quote_requested':
      return '正式見積り依頼';
    case 'quote_reviewing':
      return '見積り確認中';
    case 'quote_presented':
      return '正式見積り提示済み';
    case 'ordered':
      return '発注済み';
    case 'in_production':
      return '制作中';
    case 'customer_review':
      return 'お客様確認中';
    case 'revision':
      return '修正対応中';
    case 'delivered':
      return '納品済み';
    case 'completed':
      return '完了';
    case 'cancelled':
      return 'キャンセル';
    default:
      return status;
  }
}


async function sendCsWorksNotification(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  type: 'quote_presented' | 'ordered' | 'revision_requested' | 'delivered',
  projectId: string,
  message?: string
) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return false;

  const response = await fetch('/api/cs-works/notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ type, projectId, message }),
  });

  if (!response.ok) {
    console.error('CS Works notification failed:', await response.text());
    return false;
  }
  return true;
}

export default function AdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<ProjectWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<Record<string, ProjectFile[]>>({});
  const [projectMessages, setProjectMessages] = useState<Record<string, ProjectMessage[]>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [uploadingProjectId, setUploadingProjectId] = useState<string | null>(null);

  const [forms, setForms] = useState<
    Record<
      string,
      {
        amount: string;
        hours: string;
        deadline: string;
      }
    >
  >({});

  useEffect(() => {
    async function loadAdmin() {
      const supabase = getSupabaseBrowserClient();

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace('/login');
        return;
      }

      setUser(userData.user);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();

      if (
        profileError ||
        !profile ||
        profile.role !== 'admin'
      ) {
        router.replace('/mypage');
        return;
      }

      const { data: projectData, error: projectError } =
        await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });

      if (projectError) {
        console.error(projectError);
        setError('プロジェクトを取得できませんでした。');
        setLoading(false);
        return;
      }

      const loadedProjects = projectData ?? [];

      const estimateIds = loadedProjects
        .map((project) => project.estimate_id)
        .filter((id): id is string => Boolean(id));

      const userIds = Array.from(
        new Set(
          loadedProjects.map((project) => project.user_id)
        )
      );

      let estimates: Estimate[] = [];
      let profiles: Profile[] = [];

      if (estimateIds.length > 0) {
        const { data, error } = await supabase
          .from('estimates')
          .select('*')
          .in('id', estimateIds);

        if (error) {
          console.error('Estimate load error:', error);
        } else {
          estimates = data ?? [];
        }
      }

      if (userIds.length > 0) {
        const { data, error } = await supabase
          .from('profiles')
          .select(
            'id, company_name, department_name, contact_name, email'
          )
          .in('id', userIds);

        if (error) {
          console.error('Profile load error:', error);
        } else {
          profiles = data ?? [];
        }
      }

      const combined: ProjectWithData[] =
        loadedProjects.map((project) => ({
          ...project,

          estimate:
            estimates.find(
              (estimate) =>
                estimate.id === project.estimate_id
            ) ?? null,

          customer:
            profiles.find(
              (profile) =>
                profile.id === project.user_id
            ) ?? null,
        }));

      setProjects(combined);

      if (loadedProjects.length > 0) {
        const projectIds = loadedProjects.map((project) => project.id);
        const { data: fileData, error: fileError } = await supabase
          .from('project_files' as any)
          .select('*')
          .in('project_id', projectIds)
          .order('created_at', { ascending: false });

        if (fileError) {
          console.error('Project files load error:', fileError);
        } else {
          const grouped: Record<string, ProjectFile[]> = {};
          for (const file of ((fileData ?? []) as unknown as ProjectFile[])) {
            const { data: signedData } = await supabase.storage
              .from('project-files')
              .createSignedUrl(file.storage_path, 60 * 60);
            const item = { ...file, signed_url: signedData?.signedUrl ?? null };
            grouped[file.project_id] = [...(grouped[file.project_id] ?? []), item];
          }
          setProjectFiles(grouped);
        }
      }

      if (loadedProjects.length > 0) {
        const projectIds = loadedProjects.map((project) => project.id);
        const { data: messageData, error: messageError } = await (
          supabase.from('project_messages' as any) as any
        )
          .select('*')
          .in('project_id', projectIds)
          .order('created_at', { ascending: true });

        if (messageError) {
          console.error('Project messages load error:', messageError);
        } else {
          const groupedMessages: Record<string, ProjectMessage[]> = {};

          for (const item of ((messageData ?? []) as ProjectMessage[])) {
            groupedMessages[item.project_id] = [
              ...(groupedMessages[item.project_id] ?? []),
              item,
            ];
          }

          setProjectMessages(groupedMessages);
        }
      }

      const initialForms: typeof forms = {};

      combined.forEach((project) => {
        initialForms[project.id] = {
          amount:
            project.quoted_amount != null
              ? String(project.quoted_amount)
              : '',
          hours:
            project.quoted_hours != null
              ? String(project.quoted_hours)
              : '',
          deadline:
            project.confirmed_deadline
              ? project.confirmed_deadline.slice(0, 10)
              : '',
        };
      });

      setForms(initialForms);
      setLoading(false);
    }

    loadAdmin();
  }, [router]);

  function updateForm(
    projectId: string,
    field: 'amount' | 'hours' | 'deadline',
    value: string
  ) {
    setForms((current) => ({
      ...current,
      [projectId]: {
        ...current[projectId],
        [field]: value,
      },
    }));
  }

  async function presentQuote(project: ProjectWithData) {
    const form = forms[project.id];

    if (!form) return;

    const amount = Number(form.amount);
    const hours = Number(form.hours);

    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      !Number.isFinite(hours) ||
      hours < 0 ||
      !form.deadline
    ) {
      setError(
        '正式見積金額・工数・納期を入力してください。'
      );
      return;
    }

    const confirmed = window.confirm(
      `案件「${project.project_code}」の正式見積りを顧客へ提示しますか？`
    );

    if (!confirmed) return;

    setSavingId(project.id);
    setMessage('');
    setError('');

    const supabase = getSupabaseBrowserClient();

    const { data, error: updateError } = await supabase
      .from('projects')
      .update({
        quoted_amount: amount,
        quoted_hours: hours,
        confirmed_deadline: form.deadline,
        status: 'quote_presented',
      })
      .eq('id', project.id)
      .select('*')
      .single();

    setSavingId(null);

    if (updateError) {
      console.error('Quote update error:', updateError);
      setError('正式見積りを保存できませんでした。');
      return;
    }

    setProjects((current) =>
      current.map((item) =>
        item.id === project.id
          ? {
              ...item,
              ...data,
            }
          : item
      )
    );

    const mailSent = await sendCsWorksNotification(
      supabase,
      'quote_presented',
      project.id
    );

    setMessage(
      mailSent
        ? `案件 ${project.project_code} の正式見積りを提示し、お客様へメール通知しました。`
        : `案件 ${project.project_code} の正式見積りを提示しました。メール通知のみ失敗しました。`
    );
  }
  async function changeProjectStatus(
  project: ProjectWithData,
  nextStatus: Project['status']
) {
  if (changingStatusId) return;

  const confirmed = window.confirm(
    `案件「${project.project_code}」を「${statusLabel(nextStatus)}」に変更しますか？`
  );

  if (!confirmed) return;

  setChangingStatusId(project.id);
  setMessage('');
  setError('');

  const supabase = getSupabaseBrowserClient();

  const updateData: Database['public']['Tables']['projects']['Update'] = {
    status: nextStatus,
  };

  if (nextStatus === 'completed') {
    updateData.completed_at = new Date().toISOString();
  }

  const { data, error: updateError } = await supabase
    .from('projects')
    .update(updateData)
    .eq('id', project.id)
    .select('*')
    .single();

  setChangingStatusId(null);

  if (updateError) {
    console.error('Project status update error:', updateError);
    setError('案件ステータスを変更できませんでした。');
    return;
  }

  setProjects((current) =>
    current.map((item) =>
      item.id === project.id
        ? {
            ...item,
            ...data,
          }
        : item
    )
  );

  let mailSent = true;
  if (nextStatus === 'delivered') {
    mailSent = await sendCsWorksNotification(
      supabase,
      'delivered',
      project.id
    );
  }

  setMessage(
    nextStatus === 'delivered'
      ? mailSent
        ? `案件 ${project.project_code} を納品済みに変更し、お客様へメール通知しました。`
        : `案件 ${project.project_code} を納品済みに変更しました。メール通知のみ失敗しました。`
      : `案件 ${project.project_code} を「${statusLabel(nextStatus)}」に変更しました。`
  );
}


  async function uploadProjectFile(project: ProjectWithData, fileType: 'review' | 'revision' | 'delivery') {
    if (!user || uploadingProjectId) return;
    const file = selectedFiles[project.id];
    if (!file) {
      setError('アップロードするファイルを選択してください。');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('ファイルサイズは50MB以下にしてください。');
      return;
    }

    setUploadingProjectId(project.id);
    setMessage('');
    setError('');

    const supabase = getSupabaseBrowserClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const storagePath = `${project.id}/${Date.now()}-${safeName}`;

    const { error: storageError } = await supabase.storage
      .from('project-files')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });

    if (storageError) {
      console.error('Project file storage upload error:', storageError);
      setUploadingProjectId(null);
      setError('ファイルをアップロードできませんでした。');
      return;
    }

    const { data: fileRow, error: insertError } = await (supabase
      .from('project_files' as any) as any)
      .insert({
        project_id: project.id,
        uploaded_by: user.id,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        file_size: file.size,
        file_type: fileType,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Project file DB insert error:', insertError);
      await supabase.storage.from('project-files').remove([storagePath]);
      setUploadingProjectId(null);
      setError('ファイル情報を保存できませんでした。');
      return;
    }

    const { data: signedData } = await supabase.storage
      .from('project-files')
      .createSignedUrl(storagePath, 60 * 60);

    const newFile: ProjectFile = {
      ...(fileRow as ProjectFile),
      signed_url: signedData?.signedUrl ?? null,
    };

    setProjectFiles((current) => ({
      ...current,
      [project.id]: [newFile, ...(current[project.id] ?? [])],
    }));
    setSelectedFiles((current) => ({ ...current, [project.id]: null }));
    setUploadingProjectId(null);
    setMessage(fileType === 'delivery'
      ? `案件 ${project.project_code} に納品ファイルをアップロードしました。`
      : `案件 ${project.project_code} に確認ファイルをアップロードしました。`);
  }

  if (loading) {
    return (
      <main className="authPage">
        <section className="authCard">
          <p>管理画面を読み込んでいます…</p>
        </section>
      </main>
    );
  }


  return (
    <main className="myPageShell">
      <header className="myPageHeader">
        <div>
          <div className="authBrand">
            CS Works ADMIN
          </div>
          <h1>管理画面</h1>
        </div>

        <button
          className="logoutButton"
          onClick={() => router.push('/mypage')}
        >
          My Page
        </button>
      </header>

      <section className="welcomeCard">
        <span className="statusDot" /> 管理者

        <h2>正式見積り依頼</h2>

        <p>
          お客様から届いた正式見積り依頼を確認し、
          金額・工数・納期を設定できます。
        </p>
      </section>

      {error ? (
        <div
          className="errorBox"
          style={{ marginTop: '20px' }}
        >
          {error}
        </div>
      ) : null}

      {message ? (
        <div
          style={{
            marginTop: '20px',
            padding: '14px 16px',
            borderRadius: '12px',
            background: '#eefbf3',
            color: '#16733b',
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      ) : null}

      <section
        className="authCard"
        style={{
          margin: '28px auto 0',
          maxWidth: '100%',
        }}
      >
        <div className="authBrand">
          PROJECTS
        </div>

        <h2>案件一覧</h2>

        <p className="muted">
          {projects.length}件のプロジェクトがあります。
        </p>

        {projects.length === 0 ? (
          <div
            style={{
              marginTop: '20px',
              padding: '24px',
              borderRadius: '14px',
              background: '#f6f8fb',
            }}
          >
            正式見積り依頼はまだありません。
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: '18px',
              marginTop: '22px',
            }}
          >
            {projects.map((project) => {
              const form = forms[project.id];

              return (
                <article
                  key={project.id}
                  style={{
                    padding: '20px',
                    border: '1px solid #dbe3ec',
                    borderRadius: '14px',
                    background: '#ffffff',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '16px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: '#64748b',
                          fontSize: '12px',
                        }}
                      >
                        案件番号
                      </div>

                      <strong
                        style={{
                          fontSize: '18px',
                        }}
                      >
                        {project.project_code}
                      </strong>
                    </div>

                    <div
                      style={{
                        padding: '6px 10px',
                        borderRadius: '999px',
                        background: '#eefbf3',
                        color: '#16733b',
                        fontSize: '12px',
                        fontWeight: 800,
                        alignSelf: 'flex-start',
                      }}
                    >
                      {statusLabel(project.status)}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: '14px',
                      padding: '15px',
                      borderRadius: '12px',
                      background: '#f6f9fc',
                    }}
                  >
                    <strong>
                      {project.customer?.company_name ||
                        '会社名未登録'}
                    </strong>

                    <div
                      style={{
                        marginTop: '5px',
                        color: '#475569',
                      }}
                    >
                      {project.customer?.department_name
                        ? `${project.customer.department_name} `
                        : ''}
                      {project.customer?.contact_name ||
                        '担当者名未登録'}
                    </div>

                    <div
                      style={{
                        marginTop: '4px',
                        color: '#64748b',
                        fontSize: '13px',
                      }}
                    >
                      {project.customer?.email}
                    </div>
                  </div>

                  <h3
                    style={{
                      marginTop: '18px',
                      marginBottom: '8px',
                    }}
                  >
                    {project.title}
                  </h3>

                  {project.estimate ? (
                    <div
                      style={{
                        color: '#475569',
                        lineHeight: 1.7,
                        fontSize: '14px',
                      }}
                    >
                      AI概算：
                      {project.estimate.estimated_amount != null
                        ? `${project.estimate.estimated_amount.toLocaleString()}円`
                        : '個別見積り'}
                      {' ／ '}
                      {project.estimate.estimated_hours != null
                        ? `${project.estimate.estimated_hours}時間`
                        : '―'}

                      <br />

                      見積ID：
                      {project.estimate.estimate_code}
                    </div>
                  ) : null}

                  {project.description ? (
                    <div
                      style={{
                        marginTop: '14px',
                        paddingTop: '14px',
                        borderTop: '1px solid #e5eaf0',
                      }}
                    >
                      <div
                        style={{
                          color: '#64748b',
                          fontSize: '12px',
                          marginBottom: '5px',
                        }}
                      >
                        お客様ご入力内容
                      </div>

                      <div
                        style={{
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.7,
                        }}
                      >
                        {project.description}
                      </div>
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '14px',
                      marginTop: '20px',
                      paddingTop: '18px',
                      borderTop: '1px solid #e5eaf0',
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 700,
                          marginBottom: '6px',
                        }}
                      >
                        正式見積金額
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form?.amount ?? ''}
                        onChange={(e) =>
                          updateForm(
                            project.id,
                            'amount',
                            e.target.value
                          )
                        }
                        placeholder="例：30000"
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 700,
                          marginBottom: '6px',
                        }}
                      >
                        正式見積工数
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={form?.hours ?? ''}
                        onChange={(e) =>
                          updateForm(
                            project.id,
                            'hours',
                            e.target.value
                          )
                        }
                        placeholder="例：10"
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '13px',
                          fontWeight: 700,
                          marginBottom: '6px',
                        }}
                      >
                        納期
                      </label>

                      <input
                        type="date"
                        value={form?.deadline ?? ''}
                        onChange={(e) =>
                          updateForm(
                            project.id,
                            'deadline',
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>

                  {(
  project.status === 'quote_requested' ||
  project.status === 'quote_reviewing' ||
  project.status === 'quote_presented'
) ? (
  <button
    type="button"
    className="primaryButton"
    style={{
      marginTop: '18px',
    }}
    disabled={savingId === project.id}
    onClick={() => presentQuote(project)}
  >
    {savingId === project.id
      ? '保存中…'
      : project.status === 'quote_presented'
        ? '正式見積りを更新'
        : '正式見積りを提示'}
  </button>
) : null}


                  {(projectMessages[project.id] ?? []).length > 0 ? (
                    <div
                      style={{
                        marginTop: '20px',
                        padding: '16px',
                        borderRadius: '12px',
                        border: '1px solid #dbe3ec',
                        background: '#ffffff',
                      }}
                    >
                      <div style={{ fontWeight: 800, marginBottom: '10px' }}>
                        お客様からの確認結果・コメント
                      </div>

                      <div style={{ display: 'grid', gap: '10px' }}>
                        {(projectMessages[project.id] ?? []).map((item) => (
                          <div
                            key={item.id}
                            style={{
                              padding: '12px 14px',
                              borderRadius: '10px',
                              background:
                                item.message_type === 'revision_request'
                                  ? '#fff7ed'
                                  : item.message_type === 'approval'
                                    ? '#eefbf3'
                                    : '#f8fafc',
                              border: '1px solid #e5eaf0',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '12px',
                                flexWrap: 'wrap',
                                marginBottom: '6px',
                              }}
                            >
                              <strong>
                                {item.message_type === 'revision_request'
                                  ? '修正依頼'
                                  : item.message_type === 'approval'
                                    ? '承認'
                                    : item.message_type === 'system'
                                      ? 'システム'
                                      : 'メッセージ'}
                              </strong>

                              <span
                                style={{
                                  color: '#64748b',
                                  fontSize: '12px',
                                }}
                              >
                                {formatDate(item.created_at)}
                              </span>
                            </div>

                            <div
                              style={{
                                whiteSpace: 'pre-wrap',
                                lineHeight: 1.7,
                                color: '#334155',
                              }}
                            >
                              {item.message}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(project.status === 'in_production' ||
                    project.status === 'customer_review' ||
                    project.status === 'revision') ? (
                    <div style={{
                      marginTop: '20px',
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid #dbe3ec',
                      background: '#f8fafc',
                    }}>
                      <div style={{ fontWeight: 800, marginBottom: '8px' }}>
                        {project.status === 'revision'
                          ? '修正版ファイル'
                          : 'お客様確認用ファイル'}
                      </div>
                      <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '13px' }}>
                        {project.status === 'revision'
                          ? '修正した画像・PDFなどをアップロードできます（最大50MB）。'
                          : '確認してもらう画像・PDFなどをアップロードできます（最大50MB）。'}
                      </p>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          type="file"
                          onChange={(e) =>
                            setSelectedFiles((current) => ({
                              ...current,
                              [project.id]: e.target.files?.[0] ?? null,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="primaryButton"
                          disabled={uploadingProjectId === project.id || !selectedFiles[project.id]}
                          onClick={() => uploadProjectFile(project, project.status === 'revision' ? 'revision' : 'review')}
                        >
                          {uploadingProjectId === project.id ? 'アップロード中…' : '確認ファイルをアップロード'}
                        </button>
                      </div>

                      {(projectFiles[project.id] ?? []).length > 0 ? (
                        <div style={{ marginTop: '16px', display: 'grid', gap: '8px' }}>
                          {(projectFiles[project.id] ?? []).map((file) => (
                            <div key={file.id} style={{
                              padding: '10px 12px',
                              borderRadius: '10px',
                              background: '#fff',
                              border: '1px solid #e5eaf0',
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: '12px',
                            }}>
                              <div>
                                <strong>{file.file_name}</strong>
                                <div style={{ color: '#64748b', fontSize: '12px', marginTop: '3px' }}>
                                  {file.file_size != null ? `${(file.file_size / 1024 / 1024).toFixed(2)} MB` : ''}
                                  {' ・ '}{formatDate(file.created_at)}
                                </div>
                              </div>
                              {file.signed_url ? (
                                <a href={file.signed_url} target="_blank" rel="noreferrer">開く</a>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {project.status === 'ordered' ? (
  <button
    type="button"
    className="primaryButton"
    style={{ marginTop: '12px' }}
    disabled={changingStatusId === project.id}
    onClick={() =>
      changeProjectStatus(project, 'in_production')
    }
  >
    {changingStatusId === project.id
      ? '変更中…'
      : '制作を開始する'}
  </button>
) : null}

{project.status === 'in_production' ? (
  <button
    type="button"
    className="primaryButton"
    style={{ marginTop: '12px' }}
    disabled={changingStatusId === project.id}
    onClick={() =>
      changeProjectStatus(project, 'customer_review')
    }
  >
    {changingStatusId === project.id
      ? '変更中…'
      : 'お客様確認へ進める'}
  </button>
) : null}

{project.status === 'customer_review' ? (
  <div
    style={{
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
      marginTop: '12px',
    }}
  >
    <button
      type="button"
      className="primaryButton"
      disabled={changingStatusId === project.id}
      onClick={() =>
        changeProjectStatus(project, 'revision')
      }
    >
      修正対応へ
    </button>

    
  </div>
) : null}

{project.status === 'revision' ? (
  <button
    type="button"
    className="primaryButton"
    style={{ marginTop: '12px' }}
    disabled={changingStatusId === project.id}
    onClick={() =>
      changeProjectStatus(project, 'customer_review')
    }
  >
    {changingStatusId === project.id
      ? '変更中…'
      : '再度お客様確認へ'}
  </button>
) : null}

{project.status === 'customer_review' &&
(projectMessages[project.id] ?? []).some((item) => item.message_type === 'approval') ? (
  <div style={{ marginTop: '20px', padding: '16px', borderRadius: '12px', border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
    <div style={{ fontWeight: 800, marginBottom: '8px' }}>最終納品ファイル</div>
    <p style={{ margin: '0 0 12px', color: '#475569', fontSize: '13px' }}>
      お客様承認後の最終データをアップロードしてください（最大50MB）。
    </p>
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
      <input type="file" onChange={(e) => setSelectedFiles((c) => ({ ...c, [project.id]: e.target.files?.[0] ?? null }))} />
      <button type="button" className="primaryButton"
        disabled={uploadingProjectId === project.id || !selectedFiles[project.id]}
        onClick={() => uploadProjectFile(project, 'delivery')}>
        {uploadingProjectId === project.id ? 'アップロード中…' : '納品ファイルをアップロード'}
      </button>
    </div>
    {(projectFiles[project.id] ?? []).filter((f) => f.file_type === 'delivery').map((f) => (
      <div key={f.id} style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', background: '#fff', border: '1px solid #dcfce7', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <strong>{f.file_name}</strong>
        {f.signed_url ? <a href={f.signed_url} target="_blank" rel="noreferrer">開く</a> : null}
      </div>
    ))}
    {(projectFiles[project.id] ?? []).some((f) => f.file_type === 'delivery') ? (
      <button type="button" className="primaryButton" style={{ marginTop: '14px' }}
        disabled={changingStatusId === project.id}
        onClick={() => changeProjectStatus(project, 'delivered')}>
        お客様へ納品する
      </button>
    ) : null}
  </div>
) : null}

{project.status === 'delivered' ? (
  <button
    type="button"
    className="primaryButton"
    style={{ marginTop: '12px' }}
    disabled={changingStatusId === project.id}
    onClick={() =>
      changeProjectStatus(project, 'completed')
    }
  >
    {changingStatusId === project.id
      ? '変更中…'
      : '案件を完了する'}
  </button>
) : null}

{project.status === 'completed' ? (
  <div
    style={{
      marginTop: '14px',
      padding: '13px 15px',
      borderRadius: '10px',
      background: '#eefbf3',
      color: '#16733b',
      fontWeight: 800,
    }}
  >
    ✓ この案件は完了しています
    {project.completed_at ? (
      <div
        style={{
          marginTop: '4px',
          fontSize: '12px',
          fontWeight: 500,
        }}
      >
        完了日：{formatDate(project.completed_at)}
      </div>
    ) : null}
  </div>
) : null}

                  <div
                    style={{
                      marginTop: '12px',
                      color: '#64748b',
                      fontSize: '12px',
                    }}
                  >
                    依頼日：
                    {formatDate(project.created_at)}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
