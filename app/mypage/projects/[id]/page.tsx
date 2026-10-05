'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '../../../../lib/supabase/client';
import type { Database } from '../../../../lib/supabase/database.types';

type Estimate = Database['public']['Tables']['estimates']['Row'];
type Project = Omit<Database['public']['Tables']['projects']['Row'], 'status'> & {
  status:
    | Database['public']['Tables']['projects']['Row']['status']
    | 'approved'
    | 'invoice_requested'
    | 'invoiced';
  archived_at?: string | null;
};

type ProjectFile = {
  id: string; project_id: string; uploaded_by: string; file_name: string;
  storage_path: string; mime_type: string | null; file_size: number | null;
  file_type: 'reference' | 'review' | 'revision' | 'delivery';
  created_at: string; signed_url?: string | null;
};
type ProjectMessage = {
  id: string; project_id: string; user_id: string; message: string;
  message_type: 'message' | 'revision_request' | 'approval' | 'system';
  sender_type: 'customer' | 'admin' | 'system';
  created_at: string;
};

type ProjectOrder = {
  id: string;
  project_id: string;
  order_code: string;
};

type ProjectDelivery = {
  id: string;
  project_id: string;
  delivery_code: string;
};

type ProjectInvoice = {
  id: string;
  project_id: string;
  invoice_code: string;
  invoice_date: string;
  payment_due_date: string | null;
  total_amount: number;
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

function projectStatusLabel(status: string) {
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

    case 'approved':
      return '承認済み・納品待ち';

    case 'delivered':
      return '納品済み・請求書発行待ち';

    case 'invoice_requested':
      return '請求書発行依頼済み';

    case 'invoiced':
      return '請求済み・お支払い待ち';

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
  type: 'quote_requested' | 'quote_presented' | 'ordered' | 'revision_requested' | 'approved' | 'delivered' | 'material_uploaded' | 'customer_message' | 'invoice_requested' | 'project_declined',
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
  const [decliningProjectId, setDecliningProjectId] = useState<string | null>(null);
  const [declineMessage, setDeclineMessage] = useState('');
  const [declineError, setDeclineError] = useState('');
  const [projectFiles, setProjectFiles] = useState<Record<string, ProjectFile[]>>({});
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [referenceMessage, setReferenceMessage] = useState('');
  const [referenceError, setReferenceError] = useState('');
  const [deletingReferenceId, setDeletingReferenceId] = useState<string | null>(null);
  const [projectMessages, setProjectMessages] = useState<Record<string, ProjectMessage[]>>({});
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewingProjectId, setReviewingProjectId] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [chatText, setChatText] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatError, setChatError] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [archiveMessage, setArchiveMessage] = useState('');
  const [archiveError, setArchiveError] = useState('');
  const [projectOrder, setProjectOrder] = useState<ProjectOrder | null>(null);
  const [projectDelivery, setProjectDelivery] = useState<ProjectDelivery | null>(null);
  const [projectInvoice, setProjectInvoice] = useState<ProjectInvoice | null>(null);
  const [requestingInvoice, setRequestingInvoice] = useState(false);
  const [invoiceRequestMessage, setInvoiceRequestMessage] = useState('');
  const [invoiceRequestError, setInvoiceRequestError] = useState('');

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

    const [
      { data: orderData, error: orderLoadError },
      { data: deliveryData, error: deliveryLoadError },
      { data: invoiceData, error: invoiceLoadError },
    ] = await Promise.all([
      (supabase.from('project_orders' as any) as any)
        .select('id, project_id, order_code')
        .eq('project_id', loadedProjects[0].id)
        .maybeSingle(),
      (supabase.from('project_deliveries' as any) as any)
        .select('id, project_id, delivery_code')
        .eq('project_id', loadedProjects[0].id)
        .maybeSingle(),
      (supabase.from('project_invoices' as any) as any)
        .select('id, project_id, invoice_code, invoice_date, payment_due_date, total_amount')
        .eq('project_id', loadedProjects[0].id)
        .maybeSingle(),
    ]);

    if (orderLoadError) console.error('Project order load error:', orderLoadError);
    else setProjectOrder((orderData ?? null) as ProjectOrder | null);

    if (deliveryLoadError) console.error('Project delivery load error:', deliveryLoadError);
    else setProjectDelivery((deliveryData ?? null) as ProjectDelivery | null);

    if (invoiceLoadError) console.error('Project invoice load error:', invoiceLoadError);
    else setProjectInvoice((invoiceData ?? null) as ProjectInvoice | null);
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
      await (supabase.from('project_messages' as any) as any)
        .update({ read_by_customer_at: new Date().toISOString() })
        .in('project_id', ids)
        .eq('message_type', 'message')
        .eq('sender_type', 'admin')
        .is('read_by_customer_at', null);

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

    const mailSent = await sendCsWorksNotification(
      supabase,
      'quote_requested',
      newProject.id
    );

    setQuoteMessage(
      mailSent
        ? `正式見積りを依頼しました。案件番号：${projectCode}`
        : `正式見積りを依頼しました。案件番号：${projectCode}（管理者へのメール通知のみ失敗しました）`
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

  const { data: generatedOrder, error: generatedOrderError } = await (supabase.from('project_orders' as any) as any)
    .select('id, project_id, order_code')
    .eq('project_id', project.id)
    .maybeSingle();

  if (generatedOrderError) {
    console.error('Generated project order load error:', generatedOrderError);
  } else {
    setProjectOrder((generatedOrder ?? null) as ProjectOrder | null);
  }

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
  async function declineProjectOrder(project: Project) {
  if (!user || decliningProjectId || project.status !== 'quote_presented') return;

  if (!window.confirm(
    `案件「${project.project_code}」の発注を見送りますか？\n\n案件データと正式見積りは履歴として残ります。`
  )) return;

  setDecliningProjectId(project.id);
  setDeclineMessage('');
  setDeclineError('');
  setOrderError('');
  setOrderMessage('');

  const supabase = getSupabaseBrowserClient();
  const { data, error: declineUpdateError } = await (supabase as any)
    .rpc('decline_project_order', { p_project_id: project.id })
    .single();

  setDecliningProjectId(null);

  if (declineUpdateError) {
    console.error('Project decline error:', declineUpdateError);
    setDeclineError('発注見送りの処理を完了できませんでした。');
    return;
  }

  setProjects((current) =>
    current.map((item) => item.id === project.id ? (data as Project) : item)
  );

  const mailSent = await sendCsWorksNotification(
    supabase,
    'project_declined',
    project.id
  );

  setDeclineMessage(
    mailSent
      ? `案件 ${project.project_code} は「発注見送り」となりました。正式見積り・案件内容は履歴として保存されています。`
      : `案件 ${project.project_code} は「発注見送り」となりました。管理者へのメール通知のみ失敗しました。`
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
    } else {
      const { data: updated, error: updateError } = await (supabase as any)
        .rpc('approve_project', { p_project_id: project.id })
        .single();
      if (updateError) {
        console.error(updateError); setReviewingProjectId(null); setReviewError('承認ステータスを更新できませんでした。'); return;
      }
      setProjects((cur) => cur.map((p) => p.id === project.id ? updated : p));

      const mailSent = await sendCsWorksNotification(
        supabase,
        'approved',
        project.id,
        comment || '確認内容を承認しました。'
      );

      if (!mailSent) {
        console.error('Approval email notification failed.');
      }
    }
    setProjectMessages((cur) => ({ ...cur, [project.id]: [...(cur[project.id] ?? []), msg as ProjectMessage] }));
    setReviewComments((cur) => ({ ...cur, [project.id]: '' }));
    setReviewingProjectId(null);
    setReviewMessage(action === 'approval' ? '確認内容を承認しました。' : '修正を依頼しました。');
  }

  async function sendProjectMessage(project: Project) {
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
        sender_type: 'customer',
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
      'customer_message',
      project.id,
      text
    );
    if (!mailSent) {
      console.error('Customer message email notification failed.');
    }
  }

  async function uploadReferenceFile(project: Project) {
    if (!user || uploadingReference || !['ordered', 'in_production', 'customer_review', 'revision'].includes(project.status)) return;
    if (!referenceFile) {
      setReferenceError('アップロードする制作資料を選択してください。');
      return;
    }
    if (referenceFile.size > 50 * 1024 * 1024) {
      setReferenceError('ファイルサイズは50MB以下にしてください。');
      return;
    }

    setUploadingReference(true);
    setReferenceError('');
    setReferenceMessage('');

    const supabase = getSupabaseBrowserClient();
    const safeName = referenceFile.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const storagePath = `${project.id}/${Date.now()}-${safeName}`;

    const { error: storageError } = await supabase.storage
      .from('project-files')
      .upload(storagePath, referenceFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: referenceFile.type || undefined,
      });

    if (storageError) {
      console.error('Reference file storage upload error:', storageError);
      setUploadingReference(false);
      setReferenceError('制作資料をアップロードできませんでした。');
      return;
    }

    const { data: fileRow, error: insertError } = await (supabase.from('project_files' as any) as any)
      .insert({
        project_id: project.id,
        uploaded_by: user.id,
        file_name: referenceFile.name,
        storage_path: storagePath,
        mime_type: referenceFile.type || null,
        file_size: referenceFile.size,
        file_type: 'reference',
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Reference file DB insert error:', insertError);
      await supabase.storage.from('project-files').remove([storagePath]);
      setUploadingReference(false);
      setReferenceError('制作資料の情報を保存できませんでした。');
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
    setReferenceFile(null);
    setUploadingReference(false);

    const mailSent = await sendCsWorksNotification(
      supabase,
      'material_uploaded',
      project.id,
      referenceFile.name
    );

    setReferenceMessage(
      mailSent
        ? '制作資料を追加しました。'
        : '制作資料を追加しました。管理者へのメール通知のみ失敗しました。'
    );
  }


  async function deleteReferenceFile(project: Project, file: ProjectFile) {
    if (!user || deletingReferenceId) return;
    if (!['ordered', 'in_production', 'customer_review', 'revision'].includes(project.status)) return;
    if (file.file_type !== 'reference' || file.uploaded_by !== user.id) return;

    const confirmed = window.confirm(
      `「${file.file_name}」を削除しますか？\n\n削除した制作資料は元に戻せません。`
    );
    if (!confirmed) return;

    setDeletingReferenceId(file.id);
    setReferenceError('');
    setReferenceMessage('');

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setReferenceError('ログイン情報を確認できませんでした。再ログインしてください。');
        return;
      }

      const response = await fetch('/api/cs-works/project-files/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          fileId: file.id,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        console.error('Reference file delete API error:', result);
        setReferenceError(result?.error || '制作資料を削除できませんでした。');
        return;
      }

      setProjectFiles((current) => ({
        ...current,
        [project.id]: (current[project.id] ?? []).filter((item) => item.id !== file.id),
      }));
      setReferenceMessage('制作資料を削除しました。');
    } catch (deleteError) {
      console.error('Reference file delete request error:', deleteError);
      setReferenceError('制作資料を削除できませんでした。時間をおいて再度お試しください。');
    } finally {
      setDeletingReferenceId(null);
    }
  }

  async function toggleArchiveProject(project: Project) {
    if (!user || archiving) return;
    const restoring = Boolean(project.archived_at);
    if (!restoring && !['completed', 'cancelled'].includes(project.status)) return;
    if (!window.confirm(restoring ? `案件「${project.project_code}」をアーカイブから戻しますか？` : `案件「${project.project_code}」をアーカイブしますか？\n\n案件・メッセージ・ファイルは削除されません。`)) return;
    setArchiving(true); setArchiveMessage(''); setArchiveError('');
    const supabase = getSupabaseBrowserClient();
    const { data, error: archiveUpdateError } = await (supabase as any)
      .rpc(restoring ? 'restore_project' : 'archive_project', { p_project_id: project.id }).single();
    setArchiving(false);
    if (archiveUpdateError) {
      console.error('Project archive error:', archiveUpdateError);
      setArchiveError(restoring ? 'アーカイブから戻せませんでした。' : 'アーカイブできませんでした。');
      return;
    }
    setProjects((current) => current.map((item) => item.id === project.id ? (data as Project) : item));
    setArchiveMessage(restoring ? 'アーカイブから戻しました。' : 'この案件をアーカイブしました。');
  }

  async function requestInvoice(project: Project) {
    if (!user || requestingInvoice || project.status !== 'delivered') return;
    if (!window.confirm('この案件の請求書発行を依頼しますか？\n\nお支払期限は請求日の翌月末です。')) return;

    setRequestingInvoice(true);
    setInvoiceRequestMessage('');
    setInvoiceRequestError('');

    const supabase = getSupabaseBrowserClient();
    const { data, error: requestError } = await (supabase as any)
      .rpc('request_project_invoice', { p_project_id: project.id })
      .single();

    setRequestingInvoice(false);

    if (requestError) {
      console.error('Invoice request error:', requestError);
      setInvoiceRequestError('請求書の発行を依頼できませんでした。');
      return;
    }

    setProjects((current) =>
      current.map((item) => item.id === project.id ? (data as Project) : item)
    );

    const mailSent = await sendCsWorksNotification(
      supabase,
      'invoice_requested',
      project.id
    );

    setInvoiceRequestMessage(
      mailSent
        ? '請求書の発行を依頼しました。'
        : '請求書の発行を依頼しました。管理者へのメール通知のみ失敗しました。'
    );
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

  const project = projects[0] ?? null;
  const sourceEstimate = project
    ? estimates.find((estimate) => estimate.id === project.estimate_id) ?? null
    : null;
  const files = project ? (projectFiles[project.id] ?? []) : [];
  const messages = project ? (projectMessages[project.id] ?? []) : [];
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

  return (
    <main className="myPageShell">
      <header className="myPageHeader">
        <div>
          <div className="authBrand">CS Works</div>
          <h1>プロジェクト詳細</h1>
        </div>
        <button
          type="button"
          className="logoutButton"
          onClick={() => router.push('/mypage')}
        >
          My Pageへ戻る
        </button>
      </header>

      {!project ? (
        <section className="projectDetailPanel">
          <div className="emptyState">
            <strong>プロジェクトが見つかりません。</strong>
            <p>My Pageのプロジェクト一覧から案件を選び直してください。</p>
            <button
              type="button"
              className="primaryButton"
              onClick={() => router.push('/mypage')}
            >
              My Pageへ戻る
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="projectHero">
            <div className="projectHeroMain">
              <div className="projectEyebrow">PROJECT</div>
              <div className="projectCode">{project.project_code}</div>
              <h2>{project.title}</h2>
              <span className={`statusPill status-${project.status}`}>
                {projectStatusLabel(project.status)}
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

          {orderError ? <div className="errorBox noticeBox">{orderError}</div> : null}
          {referenceError ? <div className="errorBox noticeBox">{referenceError}</div> : null}
          {referenceMessage ? <div className="successBox noticeBox">{referenceMessage}</div> : null}
          {orderMessage ? <div className="successBox noticeBox">{orderMessage}</div> : null}
          {declineError ? <div className="errorBox noticeBox">{declineError}</div> : null}
          {declineMessage ? <div className="successBox noticeBox">{declineMessage}</div> : null}
          {reviewError ? <div className="errorBox noticeBox">{reviewError}</div> : null}
          {reviewMessage ? <div className="successBox noticeBox">{reviewMessage}</div> : null}
          {invoiceRequestError ? <div className="errorBox noticeBox">{invoiceRequestError}</div> : null}
          {invoiceRequestMessage ? <div className="successBox noticeBox">{invoiceRequestMessage}</div> : null}
          {archiveError ? <div className="errorBox noticeBox">{archiveError}</div> : null}
          {archiveMessage ? <div className="successBox noticeBox">{archiveMessage}</div> : null}

          <div className="detailLayout">
            <div className="detailMain">
              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">01</div>
                    <h3>案件概要</h3>
                  </div>
                </div>

                <div className="summaryGrid">
                  <div className="summaryItem">
                    <span>正式見積金額</span>
                    <strong className="price">
                      {project.quoted_amount != null
                        ? `${project.quoted_amount.toLocaleString()}円`
                        : '確認中'}
                    </strong>
                  </div>
                  <div className="summaryItem">
                    <span>正式見積工数</span>
                    <strong>
                      {project.quoted_hours != null
                        ? `${project.quoted_hours}時間`
                        : '確認中'}
                    </strong>
                  </div>
                  <div className="summaryItem">
                    <span>確定納期</span>
                    <strong>
                      {project.confirmed_deadline
                        ? formatDate(project.confirmed_deadline)
                        : '未確定'}
                    </strong>
                  </div>
                  <div className="summaryItem">
                    <span>発注日</span>
                    <strong>
                      {project.ordered_at ? formatDate(project.ordered_at) : '未発注'}
                    </strong>
                  </div>
                </div>

                {project.description ? (
                  <div className="descriptionBox">
                    <span>制作条件・ご要望</span>
                    <p>{project.description}</p>
                  </div>
                ) : null}

                {sourceEstimate ? (
                  <div className="sourceEstimate">
                    <div>
                      <span>元のAI概算見積り</span>
                      <strong>{sourceEstimate.estimate_code}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(`/mypage/estimates/${sourceEstimate.id}`)
                      }
                    >
                      見積り詳細を見る →
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">02</div>
                    <h3>見積り・発注</h3>
                  </div>
                </div>

                <div className="paymentTerms">
                  <strong>お支払いについて</strong>
                  <p>お支払いは請求書払いです。納品後に請求書発行をご依頼いただき、請求書発行日の翌月末までにお支払いください。</p>
                </div>

                {project.status === 'quote_requested' ||
                project.status === 'quote_reviewing' ? (
                  <div className="stateCard neutral">
                    <strong>正式見積りを作成しています</strong>
                    <p>
                      ご依頼内容を確認のうえ、正式な金額・工数・納期をご案内します。
                    </p>
                  </div>
                ) : null}

                {project.status === 'quote_presented' ? (
                  <div className="stateCard attention">
                    <strong>正式見積りをご確認ください</strong>
                    <p>
                      金額・工数・納期をご確認いただき、問題なければ発注してください。
                    </p>
                    <div className="quoteDecisionActions">
                      <button
                        type="button"
                        className="primaryButton"
                        onClick={() => orderProject(project)}
                        disabled={orderingProjectId === project.id || decliningProjectId === project.id}
                      >
                        {orderingProjectId === project.id ? '発注処理中…' : 'この内容で発注する'}
                      </button>
                      <button
                        type="button"
                        className="declineOrderButton"
                        onClick={() => declineProjectOrder(project)}
                        disabled={decliningProjectId === project.id || orderingProjectId === project.id}
                      >
                        {decliningProjectId === project.id ? '処理中…' : '今回は発注を見送る'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {project.status === 'cancelled' ? (
                  <div className="stateCard declined">
                    <strong>今回は発注見送りとなりました</strong>
                    <p>正式見積り・案件内容は履歴として保存されています。必要に応じてこの案件をアーカイブできます。</p>
                  </div>
                ) : null}

                {[
                  'ordered',
                  'in_production',
                  'customer_review',
                  'revision',
                  'approved',
                  'delivered',
                  'invoice_requested',
                  'completed',
                ].includes(project.status) ? (
                  <div className="stateCard success">
                    <strong>✓ 発注済み</strong>
                    <p>
                      {project.ordered_at
                        ? `発注日：${formatDate(project.ordered_at)}`
                        : '正式発注を受け付けています。'}
                    </p>
                    {projectOrder ? (
                      <button
                        type="button"
                        className="orderDocumentButton"
                        onClick={() => router.push(`/mypage/projects/${project.id}/order`)}
                      >
                        発注書を表示
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">03</div>
                    <h3>制作準備・制作・確認</h3>
                  </div>
                </div>

                {['ordered', 'in_production', 'customer_review', 'revision'].includes(project.status) ? (
                  <div className="preparationPanel">
                    <div className="stateCard attention">
                      <strong>{project.status === 'ordered' ? '制作開始前の準備' : project.status === 'in_production' ? '制作資料・追加資料' : '追加資料・修正指示資料'}</strong>
                      <p>
                        {project.status === 'ordered'
                          ? '正式発注を受け付けました。制作に必要な指示原稿・写真・PDF・図面・参考資料などがある場合は、こちらから追加してください。クリエイトサポートで内容を確認後、制作を開始します。'
                          : project.status === 'in_production'
                            ? '制作中に追加で必要になった写真・PDF・図面・指示原稿などがある場合は、こちらから追加してください。'
                            : '確認・修正に必要な追加資料や修正指示書などがある場合は、こちらから追加してください。'}
                      </p>
                    </div>

                    <div className="referenceUploadPanel">
                      <div className="referenceUploadHead">
                        <div>
                          <strong>制作資料・指示原稿</strong>
                          <p>1ファイル50MBまで。必要な資料は複数回追加できます。</p>
                        </div>
                        <span className="referenceCount">{referenceFiles.length}件</span>
                      </div>

                      <div className="referenceUploadControls">
                        <input
                          type="file"
                          onChange={(e) => setReferenceFile(e.target.files?.[0] ?? null)}
                        />
                        <button
                          type="button"
                          className="primaryButton"
                          disabled={uploadingReference || !referenceFile}
                          onClick={() => uploadReferenceFile(project)}
                        >
                          {uploadingReference ? 'アップロード中…' : '制作資料を追加'}
                        </button>
                      </div>

                      {referenceFiles.length ? (
                        <div className="fileList">
                          {referenceFiles.map((file) => (
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
                              <div className="fileActions">
                                {file.signed_url ? (
                                  <a href={file.signed_url} target="_blank" rel="noreferrer">
                                    ファイルを開く →
                                  </a>
                                ) : null}
                                {file.uploaded_by === user?.id ? (
                                  <button
                                    type="button"
                                    className="fileDeleteButton"
                                    disabled={deletingReferenceId === file.id}
                                    onClick={() => deleteReferenceFile(project, file)}
                                  >
                                    {deletingReferenceId === file.id ? '削除中…' : '削除'}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="emptyInline referenceEmpty">
                          追加の制作資料はまだありません。AI見積り時の参考画像は元の見積り詳細から確認できます。
                        </div>
                      )}
                    </div>

                    <div className="preparationNote">
                      <strong>補足・制作指示について</strong>
                      <p>「この部分は省略」「このアングルを使用」などの指示やご質問は、下の「メッセージ」からお送りください。</p>
                    </div>
                  </div>
                ) : null}

                {project.status === 'in_production' ? (
                  <div className="stateCard progress">
                    <strong>制作中です</strong>
                    <p>現在、制作作業を進めています。</p>
                  </div>
                ) : null}

                {project.status === 'revision' ? (
                  <div className="stateCard progress">
                    <strong>修正対応中です</strong>
                    <p>いただいた修正内容をもとに対応しています。</p>
                  </div>
                ) : null}

                {project.status === 'customer_review' ? (
                  <div className="reviewArea">
                    <div className="stateCard attention">
                      <strong>制作内容をご確認ください</strong>
                      <p>
                        確認用ファイルを開き、問題なければ承認してください。
                        修正が必要な場合は内容を入力して修正依頼を送信してください。
                      </p>
                    </div>

                    <div className="fileList">
                      {reviewFiles.length ? (
                        reviewFiles.map((file) => (
                          <div className="fileRow" key={file.id}>
                            <div>
                              <strong>{file.file_name}</strong>
                              <span>{formatDate(file.created_at)}</span>
                            </div>
                            {file.signed_url ? (
                              <a
                                href={file.signed_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                ファイルを開く →
                              </a>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="emptyInline">確認用ファイルを準備しています。</div>
                      )}
                    </div>

                    <textarea
                      value={reviewComments[project.id] ?? ''}
                      onChange={(event) =>
                        setReviewComments((current) => ({
                          ...current,
                          [project.id]: event.target.value,
                        }))
                      }
                      placeholder="修正が必要な場合は、修正箇所や内容をご記入ください。承認時のコメントは任意です。"
                      rows={4}
                      className="reviewTextarea"
                    />

                    <div className="reviewActions">
                      <button
                        type="button"
                        className="primaryButton"
                        disabled={reviewingProjectId === project.id}
                        onClick={() => submitProjectReview(project, 'approval')}
                      >
                        この内容で承認する
                      </button>
                      <button
                        type="button"
                        className="secondaryAction"
                        disabled={reviewingProjectId === project.id}
                        onClick={() =>
                          submitProjectReview(project, 'revision_request')
                        }
                      >
                        修正を依頼する
                      </button>
                    </div>
                  </div>
                ) : null}

                {project.status === 'approved' ? (
                  <div className="stateCard success">
                    <strong>✓ 制作内容を承認済みです</strong>
                    <p>クリエイトサポートからの納品をお待ちください。</p>
                  </div>
                ) : null}

                {project.status === 'delivered' ||
                project.status === 'invoice_requested' ||
                project.status === 'invoiced' ||
                project.status === 'completed' ? (
                  <div className="stateCard success">
                    <strong>制作・確認工程は完了しています</strong>
                    <p>納品データは下の「納品ファイル」から確認できます。</p>
                  </div>
                ) : null}
              </section>

              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">04</div>
                    <h3>確認・修正履歴</h3>
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
                  <div className="emptyInline">確認・修正履歴はまだありません。</div>
                )}
              </section>

              <section className="detailSection">
                <div className="sectionTitle">
                  <div>
                    <div className="sectionNumber">05</div>
                    <h3>メッセージ</h3>
                  </div>
                </div>

                <p className="sectionLead">
                  この案件について、クリエイトサポートと直接やり取りできます。
                </p>

                <div className="chatList">
                  {messages.filter((item) => item.message_type === 'message').length ? (
                    messages
                      .filter((item) => item.message_type === 'message')
                      .map((item) => {
                        const mine = item.sender_type === 'customer';
                        return (
                          <div className={`chatRow ${mine ? 'mine' : 'other'}`} key={item.id}>
                            <div className="chatMeta">
                              <strong>{item.sender_type === 'customer' ? 'お客様' : 'クリエイトサポート'}</strong>
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
                    placeholder="この案件についての質問・連絡事項を入力してください。"
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
                    <h3>納品ファイル</h3>
                  </div>
                </div>

                {deliveryFiles.length ? (
                  <div className="fileList deliveryList">
                    {deliveryFiles.map((file) => (
                      <div className="fileRow" key={file.id}>
                        <div>
                          <strong>{file.file_name}</strong>
                          <span>{formatDate(file.created_at)}</span>
                        </div>
                        {file.signed_url ? (
                          <a
                            href={file.signed_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            納品ファイルを開く →
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="emptyInline">
                    {project.status === 'delivered' ||
                    project.status === 'completed'
                      ? '納品ファイルを準備しています。'
                      : '納品後、こちらからファイルを確認できます。'}
                  </div>
                )}

                {projectDelivery ? (
                  <button
                    type="button"
                    className="deliveryDocumentButton"
                    onClick={() => router.push(`/mypage/projects/${project.id}/delivery`)}
                  >
                    納品書を表示
                  </button>
                ) : null}

                {project.status === 'delivered' ? (
                  <div className="invoiceRequestCard">
                    <strong>納品が完了しました</strong>
                    <p>内容をご確認のうえ、請求書の発行をご依頼ください。お支払期限は請求日の翌月末です。</p>
                    <button
                      type="button"
                      className="invoiceRequestButton"
                      disabled={requestingInvoice}
                      onClick={() => requestInvoice(project)}
                    >
                      {requestingInvoice ? '依頼処理中…' : '請求書の発行を依頼する'}
                    </button>
                  </div>
                ) : null}

                {project.status === 'invoice_requested' ? (
                  <div className="stateCard attention invoiceWaiting">
                    <strong>請求書発行を依頼済みです</strong>
                    <p>クリエイトサポートで請求書を発行後、こちらから確認できるようになります。</p>
                  </div>
                ) : null}

                {project.status === 'invoiced' ? (
                  <div className={`paymentWaitingCard ${
                    projectInvoice?.payment_due_date &&
                    new Date(`${projectInvoice.payment_due_date}T23:59:59`).getTime() < Date.now()
                      ? 'overdue'
                      : ''
                  }`}>
                    <strong>
                      {projectInvoice?.payment_due_date &&
                      new Date(`${projectInvoice.payment_due_date}T23:59:59`).getTime() < Date.now()
                        ? 'お支払期限を過ぎています'
                        : '請求済み・お支払い待ち'}
                    </strong>
                    <p>
                      {projectInvoice?.payment_due_date
                        ? `お支払期限：${formatDate(projectInvoice.payment_due_date)}`
                        : '請求書のお支払期限をご確認ください。'}
                      {projectInvoice?.total_amount != null
                        ? ` ／ ご請求額：${projectInvoice.total_amount.toLocaleString()}円`
                        : ''}
                    </p>
                    <p className="paymentNote">
                      ご入金確認後、案件ステータスが「完了」に更新されます。
                    </p>
                  </div>
                ) : null}

                {projectInvoice ? (
                  <button
                    type="button"
                    className="invoiceDocumentButton"
                    onClick={() => router.push(`/mypage/projects/${project.id}/invoice`)}
                  >
                    請求書を表示
                  </button>
                ) : null}

                {project.status === 'completed' && projectInvoice ? (
                  <div className="paymentCompleteCard">
                    <strong>✓ お支払い確認済み・案件完了</strong>
                    <p>ご入金を確認しました。この案件は完了しています。</p>
                  </div>
                ) : null}
              </section>
            </div>

            <aside className="detailSide">
              <div className="sideCard">
                <span className="sideLabel">現在のステータス</span>
                <strong>{projectStatusLabel(project.status)}</strong>
                <div className="progressSteps">
                  <div className="done">見積り依頼</div>
                  <div
                    className={
                      [
                        'quote_presented',
                        'ordered',
                        'in_production',
                        'customer_review',
                        'revision',
                        'approved',
                        'delivered',
                        'invoice_requested',
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
                    className={project.status === 'completed' ? 'done' : ''}
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
                        : '確認中'}
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
              {(project.archived_at || ['completed', 'cancelled'].includes(project.status)) ? (
                <div className="sideCard archiveCard">
                  <span className="sideLabel">案件の整理</span>
                  <strong>{project.archived_at ? 'アーカイブ済み' : project.status === 'cancelled' ? '発注見送りの案件' : '完了した案件'}</strong>
                  <p>{project.archived_at ? '案件データは保存されています。必要な場合は通常の一覧へ戻せます。' : project.status === 'cancelled' ? '正式見積り・案件内容は保存されています。通常の一覧から非表示にできます。' : '通常の一覧から非表示にできます。メッセージや納品ファイルは削除されません。'}</p>
                  <button type="button" className="archiveButton" disabled={archiving} onClick={() => toggleArchiveProject(project)}>
                    {archiving ? '処理中…' : project.archived_at ? 'アーカイブから戻す' : 'この案件をアーカイブ'}
                  </button>
                </div>
              ) : null}
            </aside>
          </div>
        </>
      )}

      <style jsx>{`
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
          box-shadow: 0 18px 40px rgba(15, 23, 42, .12);
        }
        .projectEyebrow { font-size: 12px; font-weight: 900; letter-spacing: .12em; opacity: .72; }
        .projectCode { margin-top: 10px; font-size: 13px; font-weight: 800; opacity: .9; }
        .projectHero h2 { margin: 7px 0 12px; font-size: clamp(22px, 3vw, 32px); line-height: 1.35; }
        .statusPill { display: inline-flex; padding: 7px 11px; border-radius: 999px; background: rgba(255,255,255,.14); font-size: 12px; font-weight: 900; }
        .heroMeta { display: flex; gap: 26px; flex-wrap: wrap; }
        .heroMeta div { min-width: 110px; }
        .heroMeta span { display: block; font-size: 11px; opacity: .7; margin-bottom: 5px; }
        .heroMeta strong { font-size: 14px; }
        .noticeBox { margin-top: 16px; }
        .successBox { padding: 12px 14px; border-radius: 10px; background: #eefbf3; color: #16733b; font-weight: 700; }
        .detailLayout { display: grid; grid-template-columns: minmax(0,1fr) 280px; gap: 22px; margin-top: 22px; align-items: start; }
        .detailMain { display: grid; gap: 18px; min-width: 0; }
        .detailSection, .sideCard,
         .archiveCard p { margin: -6px 0 14px; color: #64748b; font-size: 12px; line-height: 1.65; }
         .archiveButton { width: 100% !important; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; color: #334155; font-weight: 800; cursor: pointer; }
         .archiveButton:hover { background: #f8fafc; }
         .archiveButton:disabled { opacity: .55; cursor: default; }
 .projectDetailPanel {
          border: 1px solid #e2e8f0;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 10px 28px rgba(15,23,42,.045);
        }
        .detailSection { padding: 24px; }
        .sectionTitle { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
        .sectionTitle > div { display: flex; align-items: center; gap: 10px; }
        .sectionNumber { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: #eef4ff; color: #1d4ed8; font-size: 11px; font-weight: 900; }
        .sectionTitle h3 { margin: 0; font-size: 18px; }
        .summaryGrid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; }
        .summaryItem { padding: 14px; border-radius: 12px; background: #f7f9fc; border: 1px solid #edf1f5; }
        .summaryItem span, .descriptionBox > span, .sourceEstimate span, .sideLabel { display: block; color: #64748b; font-size: 11px; font-weight: 700; margin-bottom: 6px; }
        .summaryItem strong { font-size: 14px; }
        .summaryItem .price { color: #145edb; font-size: 18px; }
        .descriptionBox { margin-top: 14px; padding: 15px; border: 1px solid #e5eaf0; border-radius: 12px; }
        .descriptionBox p { margin: 0; white-space: pre-wrap; line-height: 1.7; }
        .sourceEstimate { margin-top: 14px; padding-top: 14px; border-top: 1px solid #e5eaf0; display: flex; justify-content: space-between; align-items: center; gap: 14px; }
        .sourceEstimate button { width: auto !important; border: 0; background: transparent; color: #145edb; font-weight: 800; cursor: pointer; }
        .stateCard { padding: 17px; border-radius: 13px; border: 1px solid #e2e8f0; }
        .stateCard strong { font-size: 16px; }
        .stateCard p { margin: 7px 0 0; color: #475569; line-height: 1.65; font-size: 13px; }
        .stateCard .primaryButton { margin-top: 14px; width: auto !important; }
        .quoteDecisionActions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
        .quoteDecisionActions .primaryButton { margin-top: 0; }
        .declineOrderButton { width: auto !important; padding: 12px 18px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; color: #64748b; font-weight: 800; cursor: pointer; }
        .declineOrderButton:hover { background: #f8fafc; color: #334155; }
        .declineOrderButton:disabled { opacity: .55; cursor: default; }
        .stateCard.declined { background: #f8fafc; border-color: #cbd5e1; color: #475569; }
        .orderDocumentButton { margin-top: 14px; width: auto !important; padding: 11px 16px; border: 1px solid #86efac; border-radius: 10px; background: #fff; color: #166534; font-weight: 900; cursor: pointer; }
        .orderDocumentButton:hover { background: #f0fdf4; }
        .deliveryDocumentButton { margin-top: 14px; width: auto !important; padding: 11px 16px; border: 1px solid #86efac; border-radius: 10px; background: #fff; color: #166534; font-weight: 900; cursor: pointer; }
        .deliveryDocumentButton:hover { background: #f0fdf4; }
        .paymentTerms { margin-bottom: 14px; padding: 14px 16px; border: 1px solid #bfdbfe; border-radius: 12px; background: #eff6ff; }
        .paymentTerms strong { color: #1e3a8a; font-size: 13px; }
        .paymentTerms p { margin: 5px 0 0; color: #475569; font-size: 12px; line-height: 1.65; }
        .invoiceRequestCard { margin-top: 16px; padding: 17px; border: 1px solid #93c5fd; border-radius: 13px; background: #eff6ff; }
        .invoiceRequestCard strong { color: #1e3a8a; font-size: 15px; }
        .invoiceRequestCard p { margin: 6px 0 12px; color: #475569; font-size: 12px; line-height: 1.65; }
        .invoiceRequestButton { width: auto !important; padding: 11px 16px; border: 0; border-radius: 10px; background: #1d4ed8; color: #fff; font-weight: 900; cursor: pointer; }
        .invoiceRequestButton:disabled { opacity: .55; cursor: default; }
        .invoiceWaiting { margin-top: 16px; }
        .paymentWaitingCard { margin-top: 16px; padding: 17px; border: 1px solid #fdba74; border-radius: 13px; background: #fff7ed; color: #9a3412; }
        .paymentWaitingCard strong { font-size: 15px; }
        .paymentWaitingCard p { margin: 6px 0 0; color: #7c2d12; font-size: 12px; line-height: 1.65; }
        .paymentWaitingCard .paymentNote { color: #64748b; }
        .paymentWaitingCard.overdue { border-color: #fca5a5; background: #fef2f2; color: #991b1b; }
        .paymentWaitingCard.overdue p { color: #7f1d1d; }
        .paymentCompleteCard { margin-top: 16px; padding: 17px; border: 1px solid #86efac; border-radius: 13px; background: #f0fdf4; color: #166534; }
        .paymentCompleteCard strong { font-size: 15px; }
        .paymentCompleteCard p { margin: 6px 0 0; color: #475569; font-size: 12px; line-height: 1.65; }
        .invoiceDocumentButton { margin-top: 14px; margin-left: 8px; width: auto !important; padding: 11px 16px; border: 1px solid #93c5fd; border-radius: 10px; background: #fff; color: #1d4ed8; font-weight: 900; cursor: pointer; }
        .invoiceDocumentButton:hover { background: #eff6ff; }
        .stateCard.neutral { background: #f8fafc; }
        .stateCard.attention { background: #fffaf2; border-color: #fed7aa; }
        .stateCard.progress { background: #eff6ff; border-color: #bfdbfe; }
        .stateCard.success { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
        .preparationPanel { display: grid; gap: 14px; }
        .referenceUploadPanel { padding: 16px; border-radius: 13px; border: 1px solid #dbe3ec; background: #f8fafc; }
        .referenceUploadHead { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
        .referenceUploadHead > div > strong { font-size: 15px; }
        .referenceUploadHead p { margin: 5px 0 0; color: #64748b; font-size: 12px; line-height: 1.6; }
        .referenceCount { flex: 0 0 auto; padding: 5px 9px; border-radius: 999px; background: #eaf2ff; color: #1d4ed8; font-size: 11px; font-weight: 900; }
        .referenceUploadControls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
        .referenceUploadControls button { width: auto !important; }
        .referenceEmpty { margin-top: 14px; }
        .preparationNote { padding: 14px 16px; border-radius: 12px; border: 1px solid #e2e8f0; background: #fff; }
        .preparationNote strong { font-size: 13px; }
        .preparationNote p { margin: 5px 0 0; color: #64748b; font-size: 12px; line-height: 1.65; }
        .fileList { margin-top: 14px; display: grid; gap: 8px; }
        .fileRow { padding: 12px 13px; border: 1px solid #e5eaf0; border-radius: 11px; display: flex; justify-content: space-between; gap: 12px; align-items: center; background: #fff; }
        .fileRow span { display: block; color: #64748b; font-size: 11px; margin-top: 4px; }
        .fileRow a { color: #145edb; font-size: 13px; font-weight: 800; white-space: nowrap; }
        .fileActions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .fileDeleteButton { padding: 0; border: 0; background: transparent; color: #b91c1c; font-size: 13px; font-weight: 800; cursor: pointer; }
        .fileDeleteButton:hover { text-decoration: underline; }
        .fileDeleteButton:disabled { color: #94a3b8; cursor: default; text-decoration: none; }
        .reviewTextarea { width: 100%; box-sizing: border-box; margin-top: 14px; }
        .reviewActions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
        .reviewActions button { width: auto !important; }
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
        .projectDetailPanel { margin-top: 24px; padding: 30px; }
        .emptyState { text-align: center; padding: 40px 10px; }
        .emptyState p { color: #64748b; }
        .emptyState button { width: auto !important; margin-top: 8px; }

        @media (max-width: 1000px) {
          .detailLayout { grid-template-columns: 1fr; }
          .detailSide { position: static; grid-template-columns: repeat(2,minmax(0,1fr)); }
          .summaryGrid { grid-template-columns: repeat(2,minmax(0,1fr)); }
        }
        @media (max-width: 650px) {
          .projectHero { display: block; padding: 22px 18px; border-radius: 17px; }
          .heroMeta { margin-top: 20px; }
          .detailSection { padding: 18px 14px; border-radius: 14px; }
          .detailSide { grid-template-columns: 1fr; }
          .summaryGrid { grid-template-columns: 1fr 1fr; }
          .sourceEstimate, .fileRow { align-items: flex-start; flex-direction: column; }
          .timelineHead { display: block; }
        }
        @media (max-width: 430px) {
          .summaryGrid { grid-template-columns: 1fr; }
        }
      `}</style>
    </main>
  );
}
