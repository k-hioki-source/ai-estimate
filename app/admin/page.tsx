'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import type { Database } from '../../lib/supabase/database.types';

type Project = Database['public']['Tables']['projects']['Row'];
type Estimate = Database['public']['Tables']['estimates']['Row'];

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

export default function AdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<ProjectWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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

    setMessage(
      `案件 ${project.project_code} の正式見積りを提示しました。`
    );
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

                  <button
                    type="button"
                    className="primaryButton"
                    style={{
                      marginTop: '18px',
                    }}
                    disabled={savingId === project.id}
                    onClick={() =>
                      presentQuote(project)
                    }
                  >
                    {savingId === project.id
                      ? '保存中…'
                      : project.status ===
                          'quote_presented'
                        ? '正式見積りを更新'
                        : '正式見積りを提示'}
                  </button>

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
