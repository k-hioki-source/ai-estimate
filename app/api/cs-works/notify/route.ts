import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendCsWorksEmail, type CsWorksMailPayload } from '@/lib/email';

export const runtime = 'nodejs';

type NotifyBody = {
  type: CsWorksMailPayload['type'];
  projectId: string;
  message?: string;
};

const allowedTypes: CsWorksMailPayload['type'][] = [
  'quote_presented',
  'review_requested',
  'ordered',
  'revision_requested',
  'delivered',
  'material_uploaded',
];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as NotifyBody;

    if (!body.projectId || !allowedTypes.includes(body.type)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid request' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { ok: false, error: 'Supabase environment variables are missing' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.slice(7));

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = callerProfile?.role === 'admin';

    // 管理者だけが送れる通知
    if (
      (
        body.type === 'quote_presented' ||
        body.type === 'review_requested' ||
        body.type === 'delivered'
      ) &&
      !isAdmin
    ) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        id,
        project_code,
        user_id,
        title,
        status,
        quoted_amount,
        confirmed_deadline
      `)
      .eq('id', body.projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { ok: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // 顧客通知は本人の案件だけ許可
    if (
      (
        body.type === 'ordered' ||
        body.type === 'revision_requested' ||
        body.type === 'material_uploaded'
      ) &&
      project.user_id !== user.id
    ) {
      return NextResponse.json(
        { ok: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // 通知種別と現在ステータスを照合
    const validStatus =
      (body.type === 'quote_presented' && project.status === 'quote_presented') ||
      (body.type === 'review_requested' && project.status === 'customer_review') ||
      (body.type === 'ordered' && project.status === 'ordered') ||
      (body.type === 'revision_requested' && project.status === 'revision') ||
      (body.type === 'delivered' && project.status === 'delivered') ||
      (
        body.type === 'material_uploaded' &&
        ['ordered', 'in_production', 'customer_review', 'revision', 'approved'].includes(
          project.status
        )
      );

    if (!validStatus) {
      return NextResponse.json(
        { ok: false, error: 'Project status does not match notification type' },
        { status: 409 }
      );
    }

    const { data: customerProfile, error: profileError } = await supabase
      .from('profiles')
      .select('contact_name, email')
      .eq('id', project.user_id)
      .single();

    if (profileError || !customerProfile) {
      return NextResponse.json(
        { ok: false, error: 'Customer profile not found' },
        { status: 404 }
      );
    }

    const result = await sendCsWorksEmail({
      type: body.type,
      projectCode: project.project_code,
      projectId: project.id,
      projectTitle: project.title ?? undefined,
      customerName: customerProfile.contact_name ?? undefined,
      customerEmail: customerProfile.email ?? undefined,
      quotedAmount: project.quoted_amount,
      confirmedDeadline: project.confirmed_deadline,
      message: body.message,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: 'Email send failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('CS Works notification API error:', error);

    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
