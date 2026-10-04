'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import type { Database } from '../../../../lib/supabase/database.types';

type Project = Omit<Database['public']['Tables']['projects']['Row'], 'status'> & {
  status:
    | Database['public']['Tables']['projects']['Row']['status']
    | 'approved'
    | 'invoice_requested'
    | 'invoiced';
};
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
  sender_type: 'customer' | 'admin' | 'system';
  created_at: string;
};

type Profile = {
  id: string;
  company_name: string | null;
  department_name: string | null;
  contact_name: string | null;
  email: string | null;
};

type ProjectInvoice = {
  id: string;
  project_id: string;
  invoice_code: string;
  invoice_date: string;
  payment_due_date: string | null;
  total_amount: number;
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
    case 'approved':
      return '承認済み・納品待ち';
    case 'delivered':
      return '納品済み・請求書発行待ち';
    case 'invoice_requested':
      return '請求書発行依頼あり';
    case 'invoiced':
      return '請求済み・入金待ち';
    case 'completed':
      return '完了';
    case 'cancelled':
      return '発注見送り';
    default:
      return status;
  }
}


async function sendCsWorksNotification(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  type:
    | 'quote_presented'
    | 'ordered'
    | 'revision_requested'
    | 'delivered'
    | 'review_requested'
    | 'admin_message'
    | 'invoice_issued'
    | 'payment_completed',
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
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<ProjectWithData[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<Record<string, ProjectFile[]>>({});
  const [projectMessages, setProjectMessages] = useState<Record<string, ProjectMessage[]>>({});
  const [projectInvoices, setProjectInvoices] = useState<Record<string, ProjectInvoice | null>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [uploadingProjectId, setUploadingProjectId] = useState<string | null>(null);
  const [chatText, setChatText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState('');
  const [testingPaymentReminderId, setTestingPaymentReminderId] = useState<string | null>(null);

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
          .eq('id', projectId)
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

          // 案件詳細を開いた時点で、お客様からの通常メッセージを既読にする
          await (supabase.from('project_messages' as any) as any)
            .update({ read_by_admin_at: new Date().toISOString() })
            .in('project_id', projectIds)
            .eq('message_type', 'message')
            .eq('sender_type', 'customer')
            .is('read_by_admin_at', null);

          for (const item of ((messageData ?? []) as ProjectMessage[])) {
            groupedMessages[item.project_id] = [
              ...(groupedMessages[item.project_id] ?? []),
              item,
            ];
          }

          setProjectMessages(groupedMessages);
        }
      }

      if (loadedProjects.length > 0) {
        const projectIds = loadedProjects.map((project) => project.id);
        const { data: invoiceData, error: invoiceError } = await (
          supabase.from('project_invoices' as any) as any
        )
          .select('id, project_id, invoice_code, invoice_date, payment_due_date, total_amount')
          .in('project_id', projectIds);

        if (invoiceError) {
          console.error('Project invoice load error:', invoiceError);
        } else {
          const invoiceMap: Record<string, ProjectInvoice | null> = {};
          for (const invoice of ((invoiceData ?? []) as ProjectInvoice[])) {
            invoiceMap[invoice.project_id] = invoice;
          }
          setProjectInvoices(invoiceMap);
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
  }, [router, projectId]);

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
    status: nextStatus as Database['public']['Tables']['projects']['Row']['status'],
  };

  if (nextStatus === 'completed') {
    updateData.completed_at = new Date().toISOString();
  }

  const statusResult =
    nextStatus === 'delivered'
      ? await (supabase as any).rpc('deliver_project', {
          p_project_id: project.id,
        })
      : nextStatus === 'completed'
        ? await (supabase as any).rpc('complete_project', {
            p_project_id: project.id,
          })
        : await supabase
            .from('projects')
            .update(updateData)
            .eq('id', project.id)
            .select('*')
            .single();

  const data = statusResult.data as Project | null;
  const updateError = statusResult.error;

  setChangingStatusId(null);

  if (updateError || !data) {
    console.error('Project status update error:', updateError);
    setError(
      nextStatus === 'delivered'
        ? '納品処理または納品書の作成に失敗しました。'
        : nextStatus === 'completed'
          ? '請求書の作成に失敗しました。'
          : '案件ステータスを変更できませんでした。'
    );
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

  if (nextStatus === 'customer_review') {
    mailSent = await sendCsWorksNotification(
      supabase,
      'review_requested',
      project.id
    );
  } else if (nextStatus === 'delivered') {
    mailSent = await sendCsWorksNotification(
      supabase,
      'delivered',
      project.id
    );
  } else if ((data as Project).status === 'invoiced') {
    mailSent = await sendCsWorksNotification(
      supabase,
      'invoice_issued',
      project.id
    );
  }

  setMessage(
    nextStatus === 'customer_review'
      ? mailSent
        ? `案件 ${project.project_code} をお客様確認中に変更し、お客様へ確認依頼メールを送信しました。`
        : `案件 ${project.project_code} をお客様確認中に変更しました。メール通知のみ失敗しました。`
      : nextStatus === 'delivered'
        ? mailSent
          ? `案件 ${project.project_code} を納品済みに変更し、お客様へメール通知しました。`
          : `案件 ${project.project_code} を納品済みに変更しました。メール通知のみ失敗しました。`
        : (data as Project).status === 'invoiced'
          ? mailSent
            ? `案件 ${project.project_code} の請求書を発行し、お客様へメール通知しました。`
            : `案件 ${project.project_code} の請求書を発行しました。メール通知のみ失敗しました。`
          : `案件 ${project.project_code} を「${statusLabel(nextStatus)}」に変更しました。`
  );
}


  async function confirmProjectPayment(project: ProjectWithData) {
    if (changingStatusId) return;

    const invoice = projectInvoices[project.id];
    const confirmed = window.confirm(
      `案件「${project.project_code}」の入金を確認済みにして、案件を完了しますか？`
    );
    if (!confirmed) return;

    setChangingStatusId(project.id);
    setMessage('');
    setError('');

    const supabase = getSupabaseBrowserClient();
    const { data, error: paymentError } = await (supabase as any)
      .rpc('confirm_project_payment', { p_project_id: project.id })
      .single();

    setChangingStatusId(null);

    if (paymentError || !data) {
      console.error('Payment confirmation error:', paymentError);
      setError('入金確認または案件完了処理に失敗しました。');
      return;
    }

    setProjects((current) =>
      current.map((item) =>
        item.id === project.id ? { ...item, ...(data as Project) } : item
      )
    );

    const mailSent = await sendCsWorksNotification(
      supabase,
      'payment_completed',
      project.id
    );

    setMessage(
      `案件 ${project.project_code} の入金を確認し、案件を完了しました。` +
      (invoice?.invoice_code ? `（${invoice.invoice_code}）` : '') +
      (mailSent ? ' お客様へメール通知しました。' : ' メール通知のみ失敗しました。')
    );
  }

  async function testPaymentReminder(project: ProjectWithData) {
    if (testingPaymentReminderId) return;

    const confirmed = window.confirm(
      `案件「${project.project_code}」の支払期限リマインダーをテスト送信しますか？\n\nお客様宛て・管理者宛てにテストメールを送信します。\n案件ステータスやリマインダー送信済み日時は変更しません。`
    );
    if (!confirmed) return;

    setTestingPaymentReminderId(project.id);
    setMessage('');
    setError('');

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setError('ログイン情報を取得できませんでした。再ログインしてからお試しください。');
        return;
      }

      const response = await fetch('/api/cs-works/payment-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ projectId: project.id }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        console.error('Payment reminder test failed:', response.status, result);
        setError(
          `支払期限リマインダーのテスト送信に失敗しました。` +
          (result?.error ? `（${result.error}）` : `（HTTP ${response.status}）`)
        );
        return;
      }

      setMessage(
        `案件 ${project.project_code} の支払期限リマインダーをテスト送信しました。お客様宛て・管理者宛てのメールをご確認ください。`
      );
    } catch (testError) {
      console.error('Payment reminder test error:', testError);
      setError('支払期限リマインダーのテスト送信中にエラーが発生しました。');
    } finally {
      setTestingPaymentReminderId(null);
    }
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

  async function sendProjectMessage(project: ProjectWithData) {
    if (!user || sendingChat) return;
    const text = chatText.trim();
    if (!text) {
      setChatError('メッセージを入力してください。');
      return;
    }

    setSendingChat(true);
    setChatError('');
    const supabase = getSupabaseBrowserClient();

    const { data, error: sendError } = await (supabase.from('project_messages' as any) as any)
      .insert({
        project_id: project.id,
        user_id: user.id,
        message: text,
        message_type: 'message',
        sender_type: 'admin',
      })
      .select('*')
      .single();

    setSendingChat(false);

    if (sendError) {
      console.error('Project message send error:', sendError);
      setChatError('メッセージを送信できませんでした。');
      return;
    }

    setProjectMessages((current) => ({
      ...current,
      [project.id]: [...(current[project.id] ?? []), data as ProjectMessage],
    }));
    setChatText('');

    const mailSent = await sendCsWorksNotification(
      supabase,
      'admin_message',
      project.id,
      text
    );
    if (!mailSent) {
      console.error('Admin message email notification failed.');
    }
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


  const project = projects[0] ?? null;
  const files = project ? (projectFiles[project.id] ?? []) : [];
  const messages = project ? (projectMessages[project.id] ?? []) : [];
  const form = project ? forms[project.id] : undefined;
  const invoice = project ? (projectInvoices[project.id] ?? null) : null;

  const referenceFiles = files.filter((file) => file.file_type === 'reference');
  const reviewFiles = files.filter(
    (file) => file.file_type === 'review' || file.file_type === 'revision'
  );
  const deliveryFiles = files.filter((file) => file.file_type === 'delivery');
  const relevantMessages = messages.filter(
    (item) =>
      item.message_type === 'approval' ||
      item.message_type === 'revision_request'
  );
  const latestReviewResult =
    relevantMessages.length > 0
      ? relevantMessages[relevantMessages.length - 1]
      : null;
  const isLatestApproved = latestReviewResult?.message_type === 'approval';

  return (
    <main className="myPageShell">
      <header className="myPageHeader">
        <div>
          <div className="authBrand">CS Works ADMIN</div>
          <h1>案件詳細</h1>
        </div>
        <button
          type="button"
          className="logoutButton"
          onClick={() => router.push('/admin')}
        >
          案件一覧へ
        </button>
      </header>

      {error ? <div className="errorBox noticeBox">{error}</div> : null}
      {message ? <div className="successBox noticeBox">{message}</div> : null}

      {!project ? (
        <section className="projectDetailPanel">
          <div className="emptyState">
            <strong>案件が見つかりません。</strong>
            <p>管理画面の案件一覧から選び直してください。</p>
            <button
              type="button"
              className="primaryButton"
              onClick={() => router.push('/admin')}
            >
              案件一覧へ戻る
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="projectHero">
            <div className="projectHeroMain">
              <div className="projectEyebrow">PROJECT ADMINISTRATION</div>
              <div className="projectCode">{project.project_code}</div>
              <h2>{project.title}</h2>
              <span className={`statusPill status-${project.status}`}>
                {statusLabel(project.status)}
              </span>
            </div>

            <div className="heroMeta">
              <div>
                <span>依頼日</span>
                <strong>{formatDate(project.created_at)}</strong>
              </div>
              <div>
                <span>確定納期</span>
                <strong>
                  {project.confirmed_deadline
                    ? formatDate(project.confirmed_deadline)
                    : '未確定'}
                </strong>
              </div>
            </div>
          </section>

          <div className="detailLayout">
            <div className="detailMain">
              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">01</div>
                    <h3>お客様・案件情報</h3>
                  </div>
                </div>

                <div className="customerCard">
                  <div>
                    <span>会社名</span>
                    <strong>{project.customer?.company_name || '会社名未登録'}</strong>
                  </div>
                  <div>
                    <span>担当者</span>
                    <strong>
                      {project.customer?.department_name
                        ? `${project.customer.department_name} `
                        : ''}
                      {project.customer?.contact_name || '担当者名未登録'}
                    </strong>
                  </div>
                  <div>
                    <span>メール</span>
                    <strong>{project.customer?.email || '未登録'}</strong>
                  </div>
                </div>

                <div className="summaryGrid">
                  <div className="summaryItem">
                    <span>AI概算金額</span>
                    <strong>
                      {project.estimate?.estimated_amount != null
                        ? `${project.estimate.estimated_amount.toLocaleString()}円`
                        : '個別見積り'}
                    </strong>
                  </div>
                  <div className="summaryItem">
                    <span>AI概算工数</span>
                    <strong>
                      {project.estimate?.estimated_hours != null
                        ? `${project.estimate.estimated_hours}時間`
                        : '―'}
                    </strong>
                  </div>
                  <div className="summaryItem">
                    <span>見積ID</span>
                    <strong>{project.estimate?.estimate_code || '―'}</strong>
                  </div>
                  <div className="summaryItem">
                    <span>現在の状態</span>
                    <strong>{statusLabel(project.status)}</strong>
                  </div>
                </div>

                {project.description ? (
                  <div className="descriptionBox">
                    <span>お客様ご入力内容</span>
                    <p>{project.description}</p>
                  </div>
                ) : null}
              </section>

              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">02</div>
                    <h3>正式見積り</h3>
                  </div>
                </div>

                <div className="quoteGrid">
                  <label>
                    <span>正式見積金額</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form?.amount ?? ''}
                      onChange={(e) =>
                        updateForm(project.id, 'amount', e.target.value)
                      }
                      placeholder="例：30000"
                    />
                  </label>

                  <label>
                    <span>正式見積工数</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={form?.hours ?? ''}
                      onChange={(e) =>
                        updateForm(project.id, 'hours', e.target.value)
                      }
                      placeholder="例：10"
                    />
                  </label>

                  <label>
                    <span>納期</span>
                    <input
                      type="date"
                      value={form?.deadline ?? ''}
                      onChange={(e) =>
                        updateForm(project.id, 'deadline', e.target.value)
                      }
                    />
                  </label>
                </div>

                {(
                  project.status === 'quote_requested' ||
                  project.status === 'quote_reviewing' ||
                  project.status === 'quote_presented'
                ) ? (
                  <button
                    type="button"
                    className="primaryButton actionButton"
                    disabled={savingId === project.id}
                    onClick={() => presentQuote(project)}
                  >
                    {savingId === project.id
                      ? '保存中…'
                      : project.status === 'quote_presented'
                        ? '正式見積りを更新'
                        : '正式見積りを提示'}
                  </button>
                ) : (
                  <div className="stateCard success">
                    <strong>✓ 正式見積り提示済み</strong>
                    <p>
                      {project.quoted_amount != null
                        ? `${project.quoted_amount.toLocaleString()}円`
                        : '―'}
                      {' ／ '}
                      {project.quoted_hours != null
                        ? `${project.quoted_hours}時間`
                        : '―'}
                      {' ／ 納期 '}
                      {project.confirmed_deadline
                        ? formatDate(project.confirmed_deadline)
                        : '―'}
                    </p>
                  </div>
                )}
              </section>

              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">03</div>
                    <h3>制作進行</h3>
                  </div>
                </div>

                {['ordered', 'in_production', 'customer_review', 'revision'].includes(project.status) ? (
                  <div className="uploadPanel referencePanel">
                    <div className="referencePanelHead">
                      <div>
                        <strong>お客様からの制作資料・指示原稿</strong>
                        <p>お客様が案件ページから追加した写真・PDF・図面・指示原稿などです。</p>
                      </div>
                      <span className="fileCountBadge">{referenceFiles.length}件</span>
                    </div>
                    {referenceFiles.length > 0 ? (
                      <FileRows files={referenceFiles} />
                    ) : (
                      <div className="emptyInline">お客様から追加された制作資料はまだありません。</div>
                    )}
                    <p className="referenceHint">
                      資料が不足している場合は、下の「お客様とのメッセージ」から追加資料をご依頼ください。
                    </p>
                  </div>
                ) : null}

                {project.status === 'quote_requested' ||
                project.status === 'quote_reviewing' ||
                project.status === 'quote_presented' ? (
                  <div className="stateCard neutral">
                    <strong>発注待ち</strong>
                    <p>正式見積り提示後、お客様の発注を待ちます。</p>
                  </div>
                ) : null}

                {project.status === 'cancelled' ? (
                  <div className="stateCard declined">
                    <strong>お客様が発注を見送りました</strong>
                    <p>
                      正式見積り提示後、お客様により発注見送りとなった案件です。
                      正式見積り・案件内容は履歴として保存されています。
                    </p>
                  </div>
                ) : null}

                {project.status === 'ordered' ? (
                  <div className="stateCard attention">
                    <strong>お客様から発注されました</strong>
                    <p>制作を開始する場合は下のボタンを押してください。</p>
                    <button
                      type="button"
                      className="primaryButton actionButton"
                      disabled={changingStatusId === project.id}
                      onClick={() => changeProjectStatus(project, 'in_production')}
                    >
                      {changingStatusId === project.id
                        ? '変更中…'
                        : '制作を開始する'}
                    </button>
                  </div>
                ) : null}

                {project.status === 'in_production' ? (
                  <div className="workPanel">
                    <div className="stateCard progress">
                      <strong>制作中</strong>
                      <p>
                        お客様へ確認してもらうファイルをアップロードし、確認工程へ進めます。
                      </p>
                    </div>

                    <div className="uploadPanel">
                      <strong>お客様確認用ファイル</strong>
                      <p>画像・PDFなどをアップロードできます（最大50MB）。</p>
                      <div className="uploadControls">
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
                          disabled={
                            uploadingProjectId === project.id ||
                            !selectedFiles[project.id]
                          }
                          onClick={() => uploadProjectFile(project, 'review')}
                        >
                          {uploadingProjectId === project.id
                            ? 'アップロード中…'
                            : '確認ファイルをアップロード'}
                        </button>
                      </div>
                      <FileRows files={reviewFiles} />
                    </div>

                    <button
                      type="button"
                      className="primaryButton actionButton"
                      disabled={changingStatusId === project.id}
                      onClick={() =>
                        changeProjectStatus(project, 'customer_review')
                      }
                    >
                      {changingStatusId === project.id
                        ? '変更中…'
                        : 'お客様確認へ進める'}
                    </button>
                  </div>
                ) : null}

                {project.status === 'customer_review' ? (
                  <div className="stateCard attention">
                    <strong>お客様確認中</strong>
                    <p>
                      お客様の承認または修正依頼を待っています。
                    </p>
                    {!isLatestApproved ? (
                      <button
                        type="button"
                        className="secondaryAction actionButton"
                        disabled={changingStatusId === project.id}
                        onClick={() => changeProjectStatus(project, 'revision')}
                      >
                        修正対応へ
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {project.status === 'revision' ? (
                  <div className="workPanel">
                    <div className="stateCard progress">
                      <strong>修正対応中</strong>
                      <p>修正版をアップロードして、再度お客様確認へ進めます。</p>
                    </div>

                    <div className="uploadPanel">
                      <strong>修正版ファイル</strong>
                      <p>修正した画像・PDFなどをアップロードできます（最大50MB）。</p>
                      <div className="uploadControls">
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
                          disabled={
                            uploadingProjectId === project.id ||
                            !selectedFiles[project.id]
                          }
                          onClick={() => uploadProjectFile(project, 'revision')}
                        >
                          {uploadingProjectId === project.id
                            ? 'アップロード中…'
                            : '修正版をアップロード'}
                        </button>
                      </div>
                      <FileRows files={reviewFiles} />
                    </div>

                    <button
                      type="button"
                      className="primaryButton actionButton"
                      disabled={changingStatusId === project.id}
                      onClick={() =>
                        changeProjectStatus(project, 'customer_review')
                      }
                    >
                      {changingStatusId === project.id
                        ? '変更中…'
                        : '再度お客様確認へ'}
                    </button>
                  </div>
                ) : null}

                {project.status === 'approved' ? (
                  <div className="stateCard success">
                    <strong>✓ お客様承認済み・納品待ち</strong>
                    <p>最終納品ファイルを登録し、「最終納品」からお客様へ納品してください。</p>
                  </div>
                ) : null}

                {project.status === 'delivered' ? (
                  <div className="stateCard progress">
                    <strong>納品済み・請求書発行待ち</strong>
                    <p>お客様からの請求書発行依頼をお待ちください。</p>
                  </div>
                ) : null}

                {project.status === 'invoice_requested' ? (
                  <div className="stateCard invoiceRequest">
                    <strong>請求書発行依頼があります</strong>
                    <p>「請求書を発行する」を押すと請求書を作成し、案件は入金待ちになります。</p>
                    <button
                      type="button"
                      className="primaryButton actionButton"
                      disabled={changingStatusId === project.id}
                      onClick={() => changeProjectStatus(project, 'completed')}
                    >
                      {changingStatusId === project.id
                        ? '請求書発行中…'
                        : '請求書を発行する'}
                    </button>
                  </div>
                ) : null}

                {project.status === 'invoiced' ? (
                  <div className={`stateCard paymentWaiting ${
                    invoice?.payment_due_date &&
                    new Date(`${invoice.payment_due_date}T23:59:59`).getTime() < Date.now()
                      ? 'overdue'
                      : ''
                  }`}>
                    <strong>
                      {invoice?.payment_due_date &&
                      new Date(`${invoice.payment_due_date}T23:59:59`).getTime() < Date.now()
                        ? '支払期限超過・未入金'
                        : '請求済み・入金待ち'}
                    </strong>
                    <p>
                      {invoice?.payment_due_date
                        ? `支払期限：${formatDate(invoice.payment_due_date)}`
                        : '支払期限を確認してください。'}
                      {invoice?.total_amount != null
                        ? ` ／ 請求額：${invoice.total_amount.toLocaleString()}円`
                        : ''}
                    </p>
                    <button
                      type="button"
                      className="secondaryAction actionButton"
                      disabled={testingPaymentReminderId === project.id}
                      onClick={() => testPaymentReminder(project)}
                    >
                      {testingPaymentReminderId === project.id
                        ? 'テスト送信中…'
                        : '支払リマインダーをテスト送信'}
                    </button>
                    <button
                      type="button"
                      className="primaryButton actionButton"
                      disabled={changingStatusId === project.id}
                      onClick={() => confirmProjectPayment(project)}
                    >
                      {changingStatusId === project.id
                        ? '処理中…'
                        : '入金確認・案件完了'}
                    </button>
                  </div>
                ) : null}

                {project.status === 'completed' ? (
                  <div className="stateCard success">
                    <strong>✓ この案件は完了しています</strong>
                    <p>
                      {project.completed_at
                        ? `完了日：${formatDate(project.completed_at)}`
                        : '案件完了'}
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">04</div>
                    <h3>お客様からの確認結果・コメント</h3>
                  </div>
                </div>

                {relevantMessages.length ? (
                  <div className="timeline">
                    {relevantMessages.map((item) => (
                      <div className="timelineItem" key={item.id}>
                        <div
                          className={`timelineDot ${
                            item.message_type === 'approval' ? 'approved' : ''
                          }`}
                        />
                        <div>
                          <div className="timelineHead">
                            <strong>
                              {item.message_type === 'approval'
                                ? '承認'
                                : '修正依頼'}
                            </strong>
                            <span>{formatDate(item.created_at)}</span>
                          </div>
                          <p>{item.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="emptyInline">確認結果はまだありません。</div>
                )}
              </section>

              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">05</div>
                    <h3>お客様とのメッセージ</h3>
                  </div>
                </div>

                <p className="sectionLead">
                  この案件に関する連絡をお客様と直接やり取りできます。
                </p>

                <div className="chatList">
                  {messages.filter((item) => item.message_type === 'message').length ? (
                    messages
                      .filter((item) => item.message_type === 'message')
                      .map((item) => {
                        const mine = item.sender_type === 'admin';
                        return (
                          <div className={`chatRow ${mine ? 'mine' : 'other'}`} key={item.id}>
                            <div className="chatMeta">
                              <strong>{item.sender_type === 'admin' ? 'クリエイトサポート' : 'お客様'}</strong>
                              <span>{formatDate(item.created_at)}</span>
                            </div>
                            <div className="chatBubble">{item.message}</div>
                          </div>
                        );
                      })
                  ) : (
                    <div className="emptyInline">メッセージはまだありません。</div>
                  )}
                </div>

                <div className="chatComposer">
                  <textarea
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="お客様への連絡事項を入力してください。"
                    rows={4}
                  />
                  {chatError ? <div className="chatError">{chatError}</div> : null}
                  <button
                    type="button"
                    className="primaryButton"
                    disabled={sendingChat || !chatText.trim()}
                    onClick={() => sendProjectMessage(project)}
                  >
                    {sendingChat ? '送信中…' : 'メッセージを送信'}
                  </button>
                </div>
              </section>

              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">06</div>
                    <h3>最終納品</h3>
                  </div>
                </div>

                {project.status === 'approved' ? (
                  <div className="deliveryPanel">
                    <div className="stateCard success">
                      <strong>✓ お客様承認済み</strong>
                      <p>最終データをアップロードして納品してください。</p>
                    </div>

                    <div className="uploadPanel deliveryUpload">
                      <strong>最終納品ファイル</strong>
                      <p>納品するファイルをアップロードしてください（最大50MB）。</p>
                      <div className="uploadControls">
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
                          disabled={
                            uploadingProjectId === project.id ||
                            !selectedFiles[project.id]
                          }
                          onClick={() => uploadProjectFile(project, 'delivery')}
                        >
                          {uploadingProjectId === project.id
                            ? 'アップロード中…'
                            : '納品ファイルをアップロード'}
                        </button>
                      </div>
                    </div>

                    <FileRows files={deliveryFiles} />

                    {deliveryFiles.length > 0 ? (
                      <button
                        type="button"
                        className="primaryButton actionButton"
                        disabled={changingStatusId === project.id}
                        onClick={() => changeProjectStatus(project, 'delivered')}
                      >
                        お客様へ納品する
                      </button>
                    ) : null}
                  </div>
                ) : deliveryFiles.length > 0 ? (
                  <FileRows files={deliveryFiles} />
                ) : (
                  <div className="emptyInline">
                    お客様承認後、最終納品ファイルを登録できます。
                  </div>
                )}
              </section>
            </div>

            <aside className="detailSide">
              <div className="sideCard">
                <span className="sideLabel">現在のステータス</span>
                <strong>{statusLabel(project.status)}</strong>
                <div className="progressSteps">
                  <div className="done">見積り依頼</div>
                  <div
                    className={
                      [
                        'quote_presented',
                        'cancelled',
                        'ordered',
                        'in_production',
                        'customer_review',
                        'revision',
                        'approved',
                        'delivered',
                        'invoice_requested',
                        'invoiced',
                        'completed',
                      ].includes(project.status)
                        ? 'done'
                        : ''
                    }
                  >
                    正式見積り
                  </div>
                  <div
                    className={
                      [
                        'ordered',
                        'in_production',
                        'customer_review',
                        'revision',
                        'approved',
                        'delivered',
                        'invoice_requested',
                        'invoiced',
                        'completed',
                      ].includes(project.status)
                        ? 'done'
                        : ''
                    }
                  >
                    発注
                  </div>
                  <div
                    className={
                      [
                        'in_production',
                        'customer_review',
                        'revision',
                        'approved',
                        'delivered',
                        'invoice_requested',
                        'invoiced',
                        'completed',
                      ].includes(project.status)
                        ? 'done'
                        : ''
                    }
                  >
                    制作
                  </div>
                  <div
                    className={
                      ['customer_review', 'revision', 'approved', 'delivered', 'invoice_requested', 'invoiced', 'completed'].includes(
                        project.status
                      )
                        ? 'done'
                        : ''
                    }
                  >
                    確認
                  </div>
                  <div
                    className={
                      ['delivered', 'invoice_requested', 'invoiced', 'completed'].includes(project.status)
                        ? 'done'
                        : ''
                    }
                  >
                    納品
                  </div>
                  <div
                    className={
                      ['invoice_requested', 'invoiced', 'completed'].includes(project.status)
                        ? 'done'
                        : ''
                    }
                  >
                    請求
                  </div>
                  <div
                    className={['completed'].includes(project.status) ? 'done' : ''}
                  >
                    入金
                  </div>
                </div>
              </div>

              <div className="sideCard">
                <span className="sideLabel">案件情報</span>
                <dl>
                  <div>
                    <dt>案件番号</dt>
                    <dd>{project.project_code}</dd>
                  </div>
                  <div>
                    <dt>正式見積</dt>
                    <dd>
                      {project.quoted_amount != null
                        ? `${project.quoted_amount.toLocaleString()}円`
                        : '未提示'}
                    </dd>
                  </div>
                  <div>
                    <dt>工数</dt>
                    <dd>
                      {project.quoted_hours != null
                        ? `${project.quoted_hours}時間`
                        : '未提示'}
                    </dd>
                  </div>
                  <div>
                    <dt>納期</dt>
                    <dd>
                      {project.confirmed_deadline
                        ? formatDate(project.confirmed_deadline)
                        : '未確定'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="sideCard">
                <span className="sideLabel">帳票</span>
                <div className="documentLinks">
                  {[
                    'ordered',
                    'in_production',
                    'customer_review',
                    'revision',
                    'approved',
                    'delivered',
                    'invoice_requested',
                    'invoiced',
                    'completed',
                  ].includes(project.status) ? (
                    <button
                      type="button"
                      className="documentButton"
                      onClick={() => router.push(`/mypage/projects/${project.id}/order`)}
                    >
                      発注書を表示
                    </button>
                  ) : (
                    <div className="documentUnavailable">発注後に発注書を表示できます。</div>
                  )}

                  {['delivered', 'invoice_requested', 'invoiced', 'completed'].includes(project.status) ? (
                    <button
                      type="button"
                      className="documentButton"
                      onClick={() => router.push(`/mypage/projects/${project.id}/delivery`)}
                    >
                      納品書を表示
                    </button>
                  ) : (
                    <div className="documentUnavailable">納品後に納品書を表示できます。</div>
                  )}

                  {['invoiced', 'completed'].includes(project.status) && invoice ? (
                    <button
                      type="button"
                      className="documentButton"
                      onClick={() => router.push(`/mypage/projects/${project.id}/invoice`)}
                    >
                      請求書を表示
                    </button>
                  ) : (
                    <div className="documentUnavailable">請求書発行後に表示できます。</div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </>
      )}

      <style jsx>{`
        .noticeBox { margin-top: 18px; }
        .successBox { padding: 12px 14px; border-radius: 10px; background: #eefbf3; color: #16733b; font-weight: 700; }
        .projectHero {
          margin-top: 26px;
          padding: 28px 30px;
          border-radius: 22px;
          color: #fff;
          background: linear-gradient(115deg, #101d3c, #244495);
          display: flex;
          justify-content: space-between;
          gap: 28px;
          align-items: flex-end;
          box-shadow: 0 18px 40px rgba(15,23,42,.12);
        }
        .projectEyebrow { font-size: 12px; font-weight: 900; letter-spacing: .12em; opacity: .72; }
        .projectCode { margin-top: 10px; font-size: 13px; font-weight: 800; opacity: .9; }
        .projectHero h2 { margin: 7px 0 12px; font-size: clamp(22px,3vw,32px); line-height: 1.35; }
        .statusPill { display: inline-flex; padding: 7px 11px; border-radius: 999px; background: rgba(255,255,255,.14); font-size: 12px; font-weight: 900; }
        .heroMeta { display: flex; gap: 26px; flex-wrap: wrap; }
        .heroMeta div { min-width: 110px; }
        .heroMeta span { display: block; font-size: 11px; opacity: .7; margin-bottom: 5px; }
        .heroMeta strong { font-size: 14px; }
        .detailLayout { display: grid; grid-template-columns: minmax(0,1fr) 280px; gap: 22px; margin-top: 22px; align-items: start; }
        .detailMain { display: grid; gap: 18px; min-width: 0; }
        .detailSection, .sideCard, .projectDetailPanel {
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 10px 28px rgba(15,23,42,.045);
        }
        .detailSection { padding: 24px; }
        .sectionTitle { margin-bottom: 18px; }
        .sectionTitle > div { display: flex; align-items: center; gap: 10px; }
        .sectionNumber { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: #eef4ff; color: #1d4ed8; font-size: 11px; font-weight: 900; }
        .sectionTitle h3 { margin: 0; font-size: 18px; }
        .customerCard { display: grid; grid-template-columns: 1.2fr 1fr 1.2fr; gap: 10px; margin-bottom: 12px; }
        .customerCard > div, .summaryItem { padding: 14px; border-radius: 12px; background: #f7f9fc; border: 1px solid #edf1f5; min-width: 0; }
        .customerCard span, .summaryItem span, .descriptionBox > span, .sideLabel { display: block; color: #64748b; font-size: 11px; font-weight: 700; margin-bottom: 6px; }
        .customerCard strong { display: block; overflow-wrap: anywhere; }
        .summaryGrid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; }
        .summaryItem strong { display: block; font-size: 14px; overflow-wrap: anywhere; }
        .descriptionBox { margin-top: 14px; padding: 15px; border: 1px solid #e5eaf0; border-radius: 12px; }
        .descriptionBox p { margin: 0; white-space: pre-wrap; line-height: 1.7; }
        .quoteGrid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
        .quoteGrid label span { display: block; font-size: 12px; font-weight: 800; margin-bottom: 6px; }
        .quoteGrid input { width: 100%; box-sizing: border-box; }
        .actionButton { width: auto !important; margin-top: 14px; }
        .stateCard { padding: 17px; border-radius: 13px; border: 1px solid #e2e8f0; }
        .stateCard strong { font-size: 16px; }
        .stateCard p { margin: 7px 0 0; color: #475569; line-height: 1.65; font-size: 13px; }
        .stateCard.neutral { background: #f8fafc; }
        .stateCard.declined { background: #f8fafc; border-color: #cbd5e1; color: #475569; }
        .stateCard.declined p { color: #64748b; }
        .stateCard.attention { background: #fffaf2; border-color: #fed7aa; }
        .stateCard.progress { background: #eff6ff; border-color: #bfdbfe; }
        .stateCard.success { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
        .stateCard.invoiceRequest { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
        .stateCard.invoiceRequest p { color: #7f1d1d; }
        .stateCard.paymentWaiting { background: #fff7ed; border-color: #fdba74; color: #9a3412; }
        .stateCard.paymentWaiting p { color: #7c2d12; }
        .stateCard.paymentWaiting.overdue { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
        .stateCard.paymentWaiting.overdue p { color: #7f1d1d; }
        .workPanel, .deliveryPanel { display: grid; gap: 14px; }
        .uploadPanel { padding: 16px; border-radius: 13px; border: 1px solid #dbe3ec; background: #f8fafc; }
        .uploadPanel > p { margin: 6px 0 12px; color: #64748b; font-size: 13px; }
        .referencePanel { margin-bottom: 14px; background: #f8fbff; border-color: #cbdcf5; }
        .referencePanelHead { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
        .referencePanelHead > div > p { margin: 6px 0 0; color: #64748b; font-size: 13px; line-height: 1.6; }
        .fileCountBadge { flex: 0 0 auto; padding: 6px 10px; border-radius: 999px; background: #eaf2ff; color: #1d4ed8; font-size: 12px; font-weight: 900; }
        .referenceHint { margin: 12px 0 0 !important; padding-top: 12px; border-top: 1px solid #e2e8f0; line-height: 1.6; }
        .deliveryUpload { border-color: #bbf7d0; background: #f7fff9; }
        .uploadControls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .uploadControls button { width: auto !important; }
        .fileList { margin-top: 14px; display: grid; gap: 8px; }
        .fileRow { padding: 12px 13px; border: 1px solid #e5eaf0; border-radius: 11px; display: flex; justify-content: space-between; gap: 12px; align-items: center; background: #fff; }
        .fileRow span { display: block; color: #64748b; font-size: 11px; margin-top: 4px; }
        .fileRow a { color: #145edb; font-size: 13px; font-weight: 800; white-space: nowrap; }
        .secondaryAction { padding: 12px 18px; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff; font-weight: 800; cursor: pointer; }
        .timeline { display: grid; gap: 0; }
        .timelineItem { position: relative; display: grid; grid-template-columns: 18px 1fr; gap: 12px; padding: 0 0 18px; }
        .timelineItem:not(:last-child)::before { content: ''; position: absolute; left: 5px; top: 13px; bottom: 0; width: 2px; background: #e2e8f0; }
        .timelineDot { width: 12px; height: 12px; margin-top: 4px; border-radius: 50%; background: #f97316; z-index: 1; }
        .timelineDot.approved { background: #22c55e; }
        .timelineHead { display: flex; justify-content: space-between; gap: 12px; }
        .timelineHead span { color: #64748b; font-size: 11px; }
        .timelineItem p { margin: 5px 0 0; color: #475569; line-height: 1.65; white-space: pre-wrap; }
        .emptyInline { padding: 18px; border-radius: 11px; background: #f8fafc; color: #64748b; font-size: 13px; }
        .sectionLead { margin: -6px 0 16px; color: #64748b; font-size: 13px; line-height: 1.65; }
        .chatList { display: grid; gap: 14px; }
        .chatRow { max-width: 82%; }
        .chatRow.mine { margin-left: auto; }
        .chatRow.other { margin-right: auto; }
        .chatMeta { display: flex; gap: 10px; align-items: center; margin-bottom: 5px; font-size: 11px; color: #64748b; }
        .chatRow.mine .chatMeta { justify-content: flex-end; }
        .chatBubble { padding: 11px 13px; border-radius: 13px; background: #f1f5f9; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
        .chatRow.mine .chatBubble { background: #eaf2ff; }
        .chatComposer { margin-top: 18px; padding-top: 18px; border-top: 1px solid #e5eaf0; }
        .chatComposer textarea { width: 100%; box-sizing: border-box; }
        .chatComposer button { width: auto !important; margin-top: 10px; }
        .chatError { margin-top: 8px; color: #b91c1c; font-size: 13px; font-weight: 700; }
        .detailSide { display: grid; gap: 14px; position: sticky; top: 18px; }
        .sideCard { padding: 18px; }
        .sideCard > strong { display: block; font-size: 16px; margin-bottom: 16px; }
        .progressSteps { display: grid; gap: 8px; }
        .progressSteps div { position: relative; padding: 8px 9px 8px 30px; border-radius: 9px; background: #f8fafc; color: #94a3b8; font-size: 12px; font-weight: 800; }
        .progressSteps div::before { content: ''; position: absolute; left: 11px; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; background: #cbd5e1; }
        .progressSteps div.done { color: #166534; background: #f0fdf4; }
        .progressSteps div.done::before { background: #22c55e; }
        .sideCard dl { margin: 0; display: grid; gap: 12px; }
        .sideCard dl div { padding-bottom: 11px; border-bottom: 1px solid #eef2f7; }
        .sideCard dt { color: #64748b; font-size: 11px; }
        .sideCard dd { margin: 4px 0 0; font-weight: 800; overflow-wrap: anywhere; }
        .documentLinks { display: grid; gap: 9px; }
        .documentButton { width: 100%; padding: 11px 12px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; color: #0f172a; font-weight: 800; cursor: pointer; text-align: left; }
        .documentButton:hover { background: #f8fafc; border-color: #94a3b8; }
        .documentUnavailable { padding: 10px 11px; border-radius: 9px; background: #f8fafc; color: #94a3b8; font-size: 11px; line-height: 1.5; }
        .projectDetailPanel { margin-top: 24px; padding: 30px; }
        .emptyState { text-align: center; padding: 40px 10px; }
        .emptyState p { color: #64748b; }
        .emptyState button { width: auto !important; margin-top: 8px; }

        @media (max-width: 1000px) {
          .detailLayout { grid-template-columns: 1fr; }
          .detailSide { position: static; grid-template-columns: repeat(2,minmax(0,1fr)); }
          .summaryGrid { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .customerCard { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 700px) {
          .projectHero { display: block; padding: 22px 18px; border-radius: 17px; }
          .heroMeta { margin-top: 20px; }
          .detailSection { padding: 18px 14px; border-radius: 14px; }
          .detailSide { grid-template-columns: 1fr; }
          .quoteGrid, .customerCard { grid-template-columns: 1fr; }
          .sourceEstimate, .fileRow { align-items: flex-start; flex-direction: column; }
          .timelineHead { display: block; }
        }
        @media (max-width: 430px) {
          .summaryGrid { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );

  function FileRows({ files }: { files: ProjectFile[] }) {
    if (!files.length) return null;

    return (
      <div className="fileList">
        {files.map((file) => (
          <div className="fileRow" key={file.id}>
            <div>
              <strong>{file.file_name}</strong>
              <span>
                {file.file_size != null
                  ? `${(file.file_size / 1024 / 1024).toFixed(2)} MB ・ `
                  : ''}
                {formatDate(file.created_at)}
              </span>
            </div>
            {file.signed_url ? (
              <a href={file.signed_url} target="_blank" rel="noreferrer">
                ファイルを開く →
              </a>
            ) : null}
          </div>
        ))}
      </div>
    );
  }
}
