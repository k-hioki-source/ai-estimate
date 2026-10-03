'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import type { Database } from '../../../../lib/supabase/database.types';

type Estimate = Database['public']['Tables']['estimates']['Row'];
type Project = Database['public']['Tables']['projects']['Row'];

type ProjectFile = {
  id: string; project_id: string; uploaded_by: string; file_name: string;
  storage_path: string; mime_type: string | null; file_size: number | null;
  file_type: 'reference' | 'review' | 'revision' | 'delivery';
  created_at: string; signed_url?: string | null;
};
type ProjectMessage = {
  id: string; project_id: string; user_id: string; message: string;
  message_type: 'message' | 'revision_request' | 'approval' | 'system';
  created_at: string;
};

type Profile = {
  company_name: string;
  department_name: string;
  contact_name: string;
  phone: string;
  postal_code: string;
  address: string;
};

const emptyProfile: Profile = {
  company_name: '',
  department_name: '',
  contact_name: '',
  phone: '',
  postal_code: '',
  address: '',
};

function productionMethodLabel(value: string | null) {
  if (value === 'photo_trace') return '写真・画像トレース';
  if (value === 'reference_drawing') return '写真・図面・資料から作図';
  if (value === 'cad_conversion') return 'XVL・3DCADから作成';
  return value || '未設定';
}

function usageLabel(value: string | null) {
  if (value === 'manual') return '取扱説明書・マニュアル';
  if (value === 'parts') return 'パーツカタログ・分解図';
  if (value === 'sales') return '製品説明・販促資料';
  return value || '未設定';
}

function expressionLabel(value: string | null) {
  if (value === 'line') return '白黒線画';
  if (value === 'color') return 'カラーイラスト';
  if (value === 'real') return 'リアルイラスト';
  return value || '未設定';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function projectStatusLabel(
  status: Database['public']['Tables']['projects']['Row']['status']
) {
  switch (status) {
    case 'quote_requested':
      return '正式見積り依頼済み';

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

export default function MyPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estimateImages, setEstimateImages] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Project[]>([]);
const [requestingEstimateId, setRequestingEstimateId] = useState<string | null>(null);
const [quoteMessage, setQuoteMessage] = useState('');
const [quoteError, setQuoteError] = useState('');
  const [orderingProjectId, setOrderingProjectId] = useState<string | null>(null);
const [orderMessage, setOrderMessage] = useState('');
const [orderError, setOrderError] = useState('');
  const [projectFiles, setProjectFiles] = useState<Record<string, ProjectFile[]>>({});
  const [projectMessages, setProjectMessages] = useState<Record<string, ProjectMessage[]>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewingProjectId, setReviewingProjectId] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadMyPage() {
      const supabase = getSupabaseBrowserClient();

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace('/login');
        return;
      }

      setUser(userData.user);

      const [
  { data: profileData, error: profileError },
  { data: estimateData, error: estimateError },
  { data: projectData, error: projectError },
] = await Promise.all([
  supabase
    .from('profiles')
    .select(
      'company_name, department_name, contact_name, phone, postal_code, address'
    )
    .eq('id', userData.user.id)
    .single(),

  supabase
    .from('estimates')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('created_at', { ascending: false }),

  supabase
    .from('projects')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('id', projectId)
    .order('created_at', { ascending: false }),
]);

      if (profileData) {
        setProfile({
          company_name: profileData.company_name ?? '',
          department_name: profileData.department_name ?? '',
          contact_name: profileData.contact_name ?? '',
          phone: profileData.phone ?? '',
          postal_code: profileData.postal_code ?? '',
          address: profileData.address ?? '',
        });
      }

      if (profileError) {
        console.error('Profile load error:', profileError);
      }

      if (estimateError) {
  console.error('Estimate load error:', estimateError);
} else {
  const loadedEstimates = estimateData ?? [];

  setEstimates(loadedEstimates);

  const imageEntries = await Promise.all(
    loadedEstimates
      .filter((estimate) => Boolean(estimate.image_path))
      .map(async (estimate) => {
        const { data, error: imageError } = await supabase.storage
          .from('estimate-images')
          .createSignedUrl(
            estimate.image_path as string,
            60 * 60
          );

        if (imageError || !data?.signedUrl) {
          console.error(
            'Estimate image load error:',
            imageError
          );

          return null;
        }

        return [
          estimate.id,
          data.signedUrl,
        ] as const;
      })
  );

  const imageMap: Record<string, string> = {};

  imageEntries.forEach((entry) => {
    if (!entry) return;

    const [estimateId, signedUrl] = entry;
    imageMap[estimateId] = signedUrl;
  });

  setEstimateImages(imageMap);
        if (projectError) {
  console.error('Project load error:', projectError);
} else {
  const loadedProjects = projectData ?? [];
  setProjects(loadedProjects);
  if (loadedProjects.length > 0) {
    const ids = loadedProjects.map((p) => p.id);
    const [{ data: fd, error: fe }, { data: md, error: me }] = await Promise.all([
      (supabase.from('project_files' as any) as any).select('*').in('project_id', ids).order('created_at', { ascending: false }),
      (supabase.from('project_messages' as any) as any).select('*').in('project_id', ids).order('created_at', { ascending: true }),
    ]);
    if (fe) console.error('Project files load error:', fe);
    else {
      const grouped: Record<string, ProjectFile[]> = {};
      for (const f of ((fd ?? []) as ProjectFile[])) {
        const { data: signed } = await supabase.storage.from('project-files').createSignedUrl(f.storage_path, 60 * 60);
        grouped[f.project_id] = [...(grouped[f.project_id] ?? []), { ...f, signed_url: signed?.signedUrl ?? null }];
      }
      setProjectFiles(grouped);
    }
    if (me) console.error('Project messages load error:', me);
    else {
      const grouped: Record<string, ProjectMessage[]> = {};
      for (const m of ((md ?? []) as ProjectMessage[])) grouped[m.project_id] = [...(grouped[m.project_id] ?? []), m];
      setProjectMessages(grouped);
    }
  }
}
}

      setLoading(false);
    }

    loadMyPage();
  }, [router, projectId]);

  function updateProfile(field: keyof Profile, value: string) {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function createProjectCode() {
  const now = new Date();

  const date =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  const random = Math.floor(100000 + Math.random() * 900000);

  return `PRJ-${date}-${random}`;
}

async function requestFormalQuote(estimate: Estimate) {
  if (!user || requestingEstimateId) return;

  const confirmed = window.confirm(
    `見積ID「${estimate.estimate_code}」の内容で正式見積りを依頼しますか？`
  );

  if (!confirmed) return;

  setRequestingEstimateId(estimate.id);
  setQuoteMessage('');
  setQuoteError('');

  const supabase = getSupabaseBrowserClient();

  try {
    // すでに案件化されていないか確認
    const { data: existingProject, error: checkError } =
      await supabase
        .from('projects')
        .select('*')
        .eq('estimate_id', estimate.id)
        .eq('user_id', user.id)
        .maybeSingle();

    if (checkError) {
      throw checkError;
    }

    if (existingProject) {
      setProjects((current) => {
        const exists = current.some(
          (project) => project.id === existingProject.id
        );

        return exists
          ? current
          : [existingProject, ...current];
      });

      setQuoteMessage('この見積りはすでに正式見積り依頼済みです。');
      return;
    }

    const projectCode = createProjectCode();

    const title = [
      productionMethodLabel(estimate.production_method),
      expressionLabel(estimate.expression),
    ].join('・');

    const { data: newProject, error: projectError } =
      await supabase
        .from('projects')
        .insert({
          project_code: projectCode,
          user_id: user.id,
          estimate_id: estimate.id,
          title,
          description: estimate.customer_notes || null,
          status: 'quote_requested',
        })
        .select('*')
        .single();

    if (projectError) {
      throw projectError;
    }

    const { error: estimateError } = await supabase
      .from('estimates')
      .update({
        status: 'quote_requested',
      })
      .eq('id', estimate.id)
      .eq('user_id', user.id);

    if (estimateError) {
      console.error(
        'Estimate status update error:',
        estimateError
      );
    }

    setProjects((current) => [
      newProject,
      ...current,
    ]);

    setEstimates((current) =>
      current.map((item) =>
        item.id === estimate.id
          ? {
              ...item,
              status: 'quote_requested',
            }
          : item
      )
    );

    setQuoteMessage(
      `正式見積りを依頼しました。案件番号：${projectCode}`
    );
  } catch (e) {
    console.error('Formal quote request error:', e);

    setQuoteError(
      '正式見積りの依頼を送信できませんでした。'
    );
  } finally {
    setRequestingEstimateId(null);
  }
}
async function orderProject(project: Project) {
  if (!user || orderingProjectId) return;

  if (
    project.status !== 'quote_presented' ||
    project.quoted_amount == null ||
    project.quoted_hours == null ||
    !project.confirmed_deadline
  ) {
    setOrderError(
      '正式見積りの内容が確定していないため発注できません。'
    );
    return;
  }

  const confirmed = window.confirm(
    `案件「${project.project_code}」を正式に発注しますか？\n\n` +
      `金額：${project.quoted_amount.toLocaleString()}円\n` +
      `工数：${project.quoted_hours}時間\n` +
      `納期：${formatDate(project.confirmed_deadline)}`
  );

  if (!confirmed) return;

  setOrderingProjectId(project.id);
  setOrderMessage('');
  setOrderError('');

  const supabase = getSupabaseBrowserClient();

  const { data, error: updateError } = await (supabase as any)
    .rpc('order_project', {
      p_project_id: project.id,
    })
    .single();

  setOrderingProjectId(null);

  if (updateError) {
    console.error(
      'Project order error:',
      updateError
    );

    setOrderError(
      '発注処理を完了できませんでした。'
    );
    return;
  }

  setProjects((current) =>
    current.map((item) =>
      item.id === project.id
        ? data
        : item
    )
  );

  const mailSent = await sendCsWorksNotification(
    supabase,
    'ordered',
    project.id
  );

  setOrderMessage(
    mailSent
      ? `案件 ${project.project_code} を正式に発注しました。`
      : `案件 ${project.project_code} を正式に発注しました。管理者へのメール通知のみ失敗しました。`
  );
}
  async function submitProjectReview(project: Project, action: 'approval' | 'revision_request') {
    if (!user || reviewingProjectId || project.status !== 'customer_review') return;
    const comment = (reviewComments[project.id] ?? '').trim();
    if (action === 'revision_request' && !comment) {
      setReviewError('修正内容を入力してください。');
      return;
    }
    if (!window.confirm(action === 'approval' ? 'この確認内容を承認しますか？' : '修正を依頼しますか？')) return;
    setReviewingProjectId(project.id); setReviewMessage(''); setReviewError('');
    const supabase = getSupabaseBrowserClient();
    const { data: msg, error: msgError } = await (supabase.from('project_messages' as any) as any)
      .insert({ project_id: project.id, user_id: user.id, message: action === 'approval' ? (comment || '確認内容を承認しました。') : comment, message_type: action })
      .select('*').single();
    if (msgError) {
      console.error(msgError); setReviewingProjectId(null); setReviewError('確認結果を送信できませんでした。'); return;
    }
    if (action === 'revision_request') {
      const { data: updated, error: updateError } = await (supabase as any)
        .rpc('request_project_revision', {
          p_project_id: project.id,
        })
        .single();
      if (updateError) {
        console.error(updateError); setReviewingProjectId(null); setReviewError('修正依頼のステータスを更新できませんでした。'); return;
      }
      setProjects((cur) => cur.map((p) => p.id === project.id ? updated : p));
      const mailSent = await sendCsWorksNotification(
        supabase,
        'revision_requested',
        project.id,
        comment
      );
      if (!mailSent) {
        console.error('Revision request email notification failed.');
      }
    }
    setProjectMessages((cur) => ({ ...cur, [project.id]: [...(cur[project.id] ?? []), msg as ProjectMessage] }));
    setReviewComments((cur) => ({ ...cur, [project.id]: '' }));
    setReviewingProjectId(null);
    setReviewMessage(action === 'approval' ? '確認内容を承認しました。' : '修正を依頼しました。');
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();

    if (!user) return;

    setSaving(true);
    setMessage('');
    setError('');

    const supabase = getSupabaseBrowserClient();

    const { error: saveError } = await supabase
      .from('profiles')
      .update({
        company_name: profile.company_name,
        department_name: profile.department_name,
        contact_name: profile.contact_name,
        phone: profile.phone,
        postal_code: profile.postal_code,
        address: profile.address,
      })
      .eq('id', user.id);

    setSaving(false);

    if (saveError) {
      console.error('Profile save error:', saveError);
      setError('お客様情報を保存できませんでした。');
      return;
    }

    setMessage('お客様情報を保存しました。');
  }

  async function logout() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace('/');
    router.refresh();
  }

  if (loading) {
    return (
      <main className="authPage">
        <section className="authCard">
          <p>My Pageを読み込んでいます…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="myPageShell">
      <header className="myPageHeader">
        <div>
          <div className="authBrand">CS Works</div>
          <h1>プロジェクト詳細</h1>
        </div>

        <button className="logoutButton" onClick={() => router.push('/mypage')}>
          My Pageへ戻る
        </button>
      </header>

      <section className="welcomeCard">
        <span className="statusDot" /> ログイン中

        <h2>
          {profile.contact_name
            ? `${profile.contact_name} 様`
            : 'CS Worksへようこそ'}
        </h2>

        <p>{user?.email}</p>
      </section>

      <div className="myPageGrid" style={{ display: 'none' }}>
        <section className="dashboardCard">
          <div className="dashboardIcon">AI</div>
          <h3>AI概算見積り</h3>
          <p>新しい制作内容をAIで概算見積りできます。</p>

          <Link className="dashboardLink" href="/">
            新しい見積りを作成 →
          </Link>
        </section>

        <section className="dashboardCard">
          <div className="dashboardIcon">見積</div>
          <h3>見積り履歴</h3>

          <p>
            保存済みのAI概算見積りを確認できます。
          </p>

          <a className="dashboardLink" href="#estimate-history">
            {estimates.length > 0
              ? `${estimates.length}件の見積りを見る →`
              : '保存済みの見積りはありません'}
          </a>
        </section>

        <section className="dashboardCard">
  <div className="dashboardIcon">案件</div>

  <h3>プロジェクト</h3>

  <p>
    正式見積りを依頼した案件の状況を確認できます。
  </p>

  {projects.length > 0 ? (
    <a
      className="dashboardLink"
      href="#project-list"
    >
      {projects.length}件のプロジェクトを見る →
    </a>
  ) : (
    <span className="muted">
      現在進行中のプロジェクトはありません
    </span>
  )}
</section>
      </div>

      <section
        id="estimate-history"
        className="authCard"
        style={{
          margin: '28px auto 0',
          maxWidth: '100%',
        }}
      >
        <div className="authBrand">ESTIMATES</div>
        <h2>見積り履歴</h2>

        <p className="muted">
          My Pageに保存したAI概算見積りです。
        </p>

        {quoteError ? (
  <div className="errorBox">
    {quoteError}
  </div>
) : null}

{quoteMessage ? (
  <div
    style={{
      marginTop: '14px',
      padding: '12px 14px',
      borderRadius: '10px',
      background: '#eefbf3',
      color: '#16733b',
      fontWeight: 700,
    }}
  >
    {quoteMessage}
  </div>
) : null}

        {estimates.length === 0 ? (
          <div
            style={{
              marginTop: '20px',
              padding: '24px',
              borderRadius: '14px',
              background: '#f6f8fb',
            }}
          >
            <strong>まだ保存された見積りはありません。</strong>

            <p className="muted">
              AI概算見積りを実行して、結果画面から保存してください。
            </p>

            <Link className="dashboardLink" href="/">
              AI概算見積りを作成 →
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: '14px',
              marginTop: '22px',
            }}
          >
            {estimates.map((estimate) => (
              <article
                key={estimate.id}
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
    gap: '18px',
    alignItems: 'center',
    marginBottom: '16px',
  }}
>
  <div
    style={{
      width: '120px',
      height: '90px',
      flex: '0 0 120px',
      border: '1px solid #dbe3ec',
      borderRadius: '12px',
      overflow: 'hidden',
      background: '#f4f7fa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {estimateImages[estimate.id] ? (
      <img
        src={estimateImages[estimate.id]}
        alt="見積り参考画像"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#ffffff',
        }}
      />
    ) : (
      <span
        style={{
          color: '#94a3b8',
          fontSize: '12px',
          fontWeight: 700,
        }}
      >
        画像なし
      </span>
    )}
  </div>

  <div
    style={{
      flex: 1,
      minWidth: 0,
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '14px',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div
          style={{
            color: '#64748b',
            fontSize: '12px',
            marginBottom: '4px',
          }}
        >
          見積ID
        </div>

        <strong
          style={{
            overflowWrap: 'anywhere',
          }}
        >
          {estimate.estimate_code}
        </strong>
      </div>

      <div
        style={{
          color: '#64748b',
          fontSize: '13px',
        }}
      >
        {formatDate(estimate.created_at)}
      </div>
    </div>

    <div
      style={{
        marginTop: '10px',
        color: '#475569',
        fontSize: '13px',
      }}
    >
      {productionMethodLabel(
        estimate.production_method
      )}
      {' ／ '}
      {expressionLabel(
        estimate.expression
      )}
    </div>
  </div>
</div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '12px',
                    padding: '15px',
                    borderRadius: '12px',
                    background: '#f6f9fc',
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: '#64748b',
                        fontSize: '12px',
                      }}
                    >
                      制作方法
                    </div>

                    <strong>
                      {productionMethodLabel(
                        estimate.production_method
                      )}
                    </strong>
                  </div>

                  <div>
                    <div
                      style={{
                        color: '#64748b',
                        fontSize: '12px',
                      }}
                    >
                      用途
                    </div>

                    <strong>
                      {usageLabel(estimate.usage)}
                    </strong>
                  </div>

                  <div>
                    <div
                      style={{
                        color: '#64748b',
                        fontSize: '12px',
                      }}
                    >
                      表現
                    </div>

                    <strong>
                      {expressionLabel(estimate.expression)}
                    </strong>
                  </div>

                  <div>
                    <div
                      style={{
                        color: '#64748b',
                        fontSize: '12px',
                      }}
                    >
                      点数
                    </div>

                    <strong>{estimate.quantity}点</strong>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: '18px',
                    flexWrap: 'wrap',
                    marginTop: '16px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: '#64748b',
                        fontSize: '12px',
                      }}
                    >
                      想定制作時間
                    </div>

                    <strong
                      style={{
                        fontSize: '18px',
                      }}
                    >
                      {estimate.estimated_hours != null
                        ? `${estimate.estimated_hours}時間`
                        : '―'}
                    </strong>
                  </div>

                  <div>
                    <div
                      style={{
                        color: '#64748b',
                        fontSize: '12px',
                      }}
                    >
                      概算金額
                    </div>

                    <strong
                      style={{
                        color: '#145edb',
                        fontSize: '24px',
                      }}
                    >
                      {estimate.estimated_amount != null
                        ? `${estimate.estimated_amount.toLocaleString()}円`
                        : '個別見積り'}
                    </strong>
                  </div>
                </div>

                {estimate.customer_notes ? (
                  <div
                    style={{
                      marginTop: '15px',
                      paddingTop: '15px',
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
                      制作条件・メモ
                    </div>

                    <p
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.7,
                      }}
                    >
                      {estimate.customer_notes}
                    </p>
                  </div>
                ) : null}

                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '14px',
                    borderTop: '1px solid #e5eaf0',
                    color: '#64748b',
                    fontSize: '12px',
                  }}
                >
                  難易度スコア：
                  {estimate.complexity_score ?? '―'}
                  {'　'}
                  AI信頼度：
                  {estimate.confidence != null
                    ? `${estimate.confidence}%`
                    : '―'}
                </div>

                <div
  style={{
    marginTop: '18px',
    paddingTop: '18px',
    borderTop: '1px solid #e5eaf0',
  }}
>
  {estimate.status === 'quote_requested' ||
  projects.some(
    (project) => project.estimate_id === estimate.id
  ) ? (
    <div
      style={{
        padding: '13px 16px',
        borderRadius: '10px',
        background: '#eefbf3',
        color: '#16733b',
        fontWeight: 700,
      }}
    >
      ✓ 正式見積り依頼済み
    </div>
  ) : (
    <button
      type="button"
      className="primaryButton"
      onClick={() => requestFormalQuote(estimate)}
      disabled={requestingEstimateId === estimate.id}
    >
      {requestingEstimateId === estimate.id
        ? '依頼を送信中…'
        : '正式見積りを依頼する'}
    </button>
  )}
</div>
                
              </article>
            ))}
          </div>
        )}
      </section>
<section
  id="project-list"
  style={{
    width: '100%',
    boxSizing: 'border-box',
    margin: '28px 0 0',
    padding: '28px',
    border: '1px solid #e2e8f0',
    borderRadius: '20px',
    background: '#ffffff',
  }}
>
  <div className="authBrand">
    PROJECTS
  </div>

  <h2>プロジェクト</h2>

  <p className="muted">
    正式見積りを依頼した案件の進行状況です。
  </p>
{orderError ? (
  <div
    className="errorBox"
    style={{ marginTop: '14px' }}
  >
    {orderError}
  </div>
) : null}

{orderMessage ? (
  <div
    style={{
      marginTop: '14px',
      padding: '12px 14px',
      borderRadius: '10px',
      background: '#eefbf3',
      color: '#16733b',
      fontWeight: 700,
    }}
  >
    {orderMessage}
  </div>
) : null}
  {reviewError ? <div className="errorBox" style={{ marginTop: '14px' }}>{reviewError}</div> : null}
  {reviewMessage ? <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '10px', background: '#eefbf3', color: '#16733b', fontWeight: 700 }}>{reviewMessage}</div> : null}
  {projects.length === 0 ? (
    <div
      style={{
        marginTop: '20px',
        padding: '24px',
        borderRadius: '14px',
        background: '#f6f8fb',
      }}
    >
      <strong>
        現在プロジェクトはありません。
      </strong>

      <p className="muted">
        保存したAI概算見積りから
        「正式見積りを依頼する」を押すと、
        ここに案件が追加されます。
      </p>
    </div>
  ) : (
    <div
      style={{
        display: 'grid',
        gap: '14px',
        marginTop: '22px',
      }}
    >
      {projects.map((project) => {
        const sourceEstimate = estimates.find(
          (estimate) =>
            estimate.id === project.estimate_id
        );

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
                gap: '18px',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '120px',
                  height: '90px',
                  flex: '0 0 120px',
                  border:
                    '1px solid #dbe3ec',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: '#f4f7fa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {sourceEstimate &&
                estimateImages[sourceEstimate.id] ? (
                  <img
                    src={
                      estimateImages[
                        sourceEstimate.id
                      ]
                    }
                    alt="プロジェクト参考画像"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      background: '#ffffff',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      color: '#94a3b8',
                      fontSize: '12px',
                      fontWeight: 700,
                    }}
                  >
                    画像なし
                  </span>
                )}
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    color: '#64748b',
                    fontSize: '12px',
                    marginBottom: '4px',
                  }}
                >
                  案件番号
                </div>

                <strong
                  style={{
                    fontSize: '17px',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {project.project_code}
                </strong>

                <div
                  style={{
                    marginTop: '7px',
                    fontWeight: 700,
                  }}
                >
                  {project.title}
                </div>

                <div
                  style={{
                    marginTop: '10px',
                    display: 'inline-flex',
                    padding: '6px 10px',
                    borderRadius: '999px',
                    background: '#eefbf3',
                    color: '#16733b',
                    fontSize: '12px',
                    fontWeight: 800,
                  }}
                >
                  {projectStatusLabel(
                    project.status
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '12px',
                marginTop: '18px',
                padding: '15px',
                borderRadius: '12px',
                background: '#f6f9fc',
              }}
            >
              <div>
                <div
                  style={{
                    color: '#64748b',
                    fontSize: '12px',
                  }}
                >
                  正式見積金額
                </div>

                <strong>
                  {project.quoted_amount != null
                    ? `${project.quoted_amount.toLocaleString()}円`
                    : '確認中'}
                </strong>
              </div>

              <div>
                <div
                  style={{
                    color: '#64748b',
                    fontSize: '12px',
                  }}
                >
                  正式見積工数
                </div>

                <strong>
                  {project.quoted_hours != null
                    ? `${project.quoted_hours}時間`
                    : '確認中'}
                </strong>
              </div>

              <div>
                <div
                  style={{
                    color: '#64748b',
                    fontSize: '12px',
                  }}
                >
                  確定納期
                </div>

                <strong>
                  {project.confirmed_deadline
                    ? formatDate(
                        project.confirmed_deadline
                      )
                    : '未確定'}
                </strong>
              </div>

              <div>
                <div
                  style={{
                    color: '#64748b',
                    fontSize: '12px',
                  }}
                >
                  依頼日
                </div>

                <strong>
                  {formatDate(project.created_at)}
                </strong>
              </div>
            </div>

            {project.status === 'quote_presented' ? (
  <div
    style={{
      marginTop: '18px',
      padding: '18px',
      borderRadius: '12px',
      border: '1px solid #dbe3ec',
      background: '#ffffff',
    }}
  >
    <div
      style={{
        fontWeight: 800,
        fontSize: '16px',
        marginBottom: '7px',
      }}
    >
      正式見積りをご確認ください
    </div>

    <p
      style={{
        margin: '0 0 16px',
        color: '#475569',
        lineHeight: 1.7,
        fontSize: '14px',
      }}
    >
      上記の正式見積金額・工数・納期をご確認のうえ、
      問題なければ発注してください。
    </p>

    <button
      type="button"
      className="primaryButton"
      onClick={() => orderProject(project)}
      disabled={orderingProjectId === project.id}
    >
      {orderingProjectId === project.id
        ? '発注処理中…'
        : 'この内容で発注する'}
    </button>
  </div>
) : null}

{project.status === 'ordered' ? (
  <div
    style={{
      marginTop: '18px',
      padding: '14px 16px',
      borderRadius: '12px',
      background: '#eefbf3',
      color: '#16733b',
      fontWeight: 800,
    }}
  >
    ✓ 発注済み
    {project.ordered_at ? (
      <div
        style={{
          marginTop: '4px',
          fontSize: '12px',
          fontWeight: 500,
        }}
      >
        発注日：{formatDate(project.ordered_at)}
      </div>
    ) : null}
  </div>
) : null}
            
            {(project.status === 'delivered' || project.status === 'completed') ? (
  <div style={{ marginTop: '18px', padding: '18px', borderRadius: '12px', border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
    <div style={{ fontWeight: 800, fontSize: '16px', color: '#166534' }}>納品ファイル</div>
    <p style={{ margin: '7px 0 14px', color: '#475569', lineHeight: 1.7, fontSize: '14px' }}>
      制作が完了しました。下記から納品データを開くことができます。
    </p>
    {(projectFiles[project.id] ?? []).filter((f) => f.file_type === 'delivery').length ? (
      (projectFiles[project.id] ?? []).filter((f) => f.file_type === 'delivery').map((f) => (
        <div key={f.id} style={{ padding: '12px', marginTop: '8px', borderRadius: '10px', background: '#fff', border: '1px solid #dcfce7', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <div><strong>{f.file_name}</strong><div style={{ color: '#64748b', fontSize: '12px', marginTop: '3px' }}>{formatDate(f.created_at)}</div></div>
          {f.signed_url ? <a href={f.signed_url} target="_blank" rel="noreferrer" className="dashboardLink">納品ファイルを開く →</a> : null}
        </div>
      ))
    ) : <div>納品ファイルを準備しています。</div>}
  </div>
) : null}

{project.status === 'customer_review' ? (
              <div style={{ marginTop: '18px', padding: '18px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                <div style={{ fontWeight: 800, fontSize: '16px' }}>制作内容をご確認ください</div>
                <p style={{ margin: '7px 0 14px', color: '#475569', lineHeight: 1.7, fontSize: '14px' }}>
                  確認用ファイルを開き、問題なければ承認してください。修正が必要な場合は内容を入力して修正依頼を送信してください。
                </p>
                {(projectFiles[project.id] ?? []).filter((f) => f.file_type === 'review' || f.file_type === 'revision').map((f) => (
                  <div key={f.id} style={{ padding: '11px 12px', marginBottom: '8px', borderRadius: '10px', background: '#fff', border: '1px solid #e5eaf0', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <div><strong>{f.file_name}</strong><div style={{ color: '#64748b', fontSize: '12px' }}>{formatDate(f.created_at)}</div></div>
                    {f.signed_url ? <a href={f.signed_url} target="_blank" rel="noreferrer">ファイルを開く →</a> : null}
                  </div>
                ))}
                {(projectMessages[project.id] ?? []).some((m) => m.message_type === 'approval') ? (
                  <div style={{ marginTop: '12px', padding: '13px 15px', borderRadius: '10px', background: '#eefbf3', color: '#16733b', fontWeight: 800 }}>✓ 確認内容を承認済みです</div>
                ) : (
                  <>
                    <textarea value={reviewComments[project.id] ?? ''} onChange={(e) => setReviewComments((c) => ({ ...c, [project.id]: e.target.value }))} placeholder="修正が必要な場合は、修正箇所や内容をご記入ください。承認時のコメントは任意です。" rows={4} style={{ width: '100%', boxSizing: 'border-box', marginTop: '12px' }} />
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                      <button type="button" className="primaryButton" disabled={reviewingProjectId === project.id} onClick={() => submitProjectReview(project, 'approval')}>この内容で承認する</button>
                      <button type="button" disabled={reviewingProjectId === project.id} onClick={() => submitProjectReview(project, 'revision_request')} style={{ padding: '12px 18px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700 }}>修正を依頼する</button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {sourceEstimate ? (
              <div
                style={{
                  marginTop: '14px',
                  color: '#64748b',
                  fontSize: '12px',
                }}
              >
                元のAI概算見積り：
                {sourceEstimate.estimate_code}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  )}
</section>
      <section
        className="authCard"
        style={{
          display: 'none',
          margin: '28px auto 0',
          maxWidth: '100%',
        }}
      >
        <div className="authBrand">ACCOUNT</div>
        <h2>お客様情報</h2>

        <p className="muted">
          正式見積りや制作依頼に使用する情報を登録できます。
        </p>

        <form onSubmit={saveProfile} className="authForm">
          <div>
            <label>会社名</label>
            <input
              type="text"
              value={profile.company_name}
              onChange={(e) =>
                updateProfile('company_name', e.target.value)
              }
              placeholder="株式会社クリエイトサポート"
            />
          </div>

          <div>
            <label>部署名</label>
            <input
              type="text"
              value={profile.department_name}
              onChange={(e) =>
                updateProfile('department_name', e.target.value)
              }
              placeholder="企画部"
            />
          </div>

          <div>
            <label>担当者名</label>
            <input
              type="text"
              value={profile.contact_name}
              onChange={(e) =>
                updateProfile('contact_name', e.target.value)
              }
              placeholder="山田 太郎"
            />
          </div>

          <div>
            <label>メールアドレス</label>
            <input
              type="email"
              value={user?.email ?? ''}
              disabled
            />
            <small>
              ログインに使用しているメールアドレスです。
            </small>
          </div>

          <div>
            <label>電話番号</label>
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) =>
                updateProfile('phone', e.target.value)
              }
              placeholder="0565-00-0000"
            />
          </div>

          <div>
            <label>郵便番号</label>
            <input
              type="text"
              value={profile.postal_code}
              onChange={(e) =>
                updateProfile('postal_code', e.target.value)
              }
              placeholder="000-0000"
            />
          </div>

          <div>
            <label>住所</label>
            <input
              type="text"
              value={profile.address}
              onChange={(e) =>
                updateProfile('address', e.target.value)
              }
              placeholder="愛知県..."
            />
          </div>

          {error ? (
            <div className="errorBox">{error}</div>
          ) : null}

          {message ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#eefbf3',
                color: '#16733b',
                fontWeight: 700,
              }}
            >
              {message}
            </div>
          ) : null}

          <button
            className="primaryButton"
            disabled={saving}
          >
            {saving
              ? '保存中…'
              : 'お客様情報を保存'}
          </button>
        </form>
      </section>
    </main>
  );
}
