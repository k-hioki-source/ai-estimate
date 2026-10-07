'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../../../lib/supabase/client';

type QuoteProject = {
  id: string;
  project_code: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  quoted_amount: number | null;
  quoted_hours: number | null;
  confirmed_deadline: string | null;
  quote_presented_at: string | null;
};

type Profile = {
  company_name: string | null;
  department_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
};

function formatDate(value: string | null) {
  if (!value) return '―';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function yen(value: number) {
  return `${value.toLocaleString('ja-JP')}円`;
}

function quoteCode(projectCode: string) {
  return `Q-${projectCode}`;
}

export default function ProjectQuotePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [project, setProject] = useState<QuoteProject | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace('/login');
        return;
      }

      const { data: projectData, error: projectError } = await (
        supabase.from('projects') as any
      )
        .select(
          'id, project_code, user_id, title, description, status, quoted_amount, quoted_hours, confirmed_deadline, quote_presented_at'
        )
        .eq('id', projectId)
        .maybeSingle();

      if (projectError) {
        console.error('Project quote load error:', projectError);
        setError('見積書を読み込めませんでした。');
        setLoading(false);
        return;
      }

      if (!projectData) {
        setError('このプロジェクトが見つかりません。');
        setLoading(false);
        return;
      }

      const loadedProject = projectData as QuoteProject;

      if (
        loadedProject.quoted_amount == null ||
        !loadedProject.quote_presented_at
      ) {
        setError('このプロジェクトの正式見積書はまだ発行されていません。');
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await (
        supabase.from('profiles') as any
      )
        .select(
          'company_name, department_name, contact_name, email, phone, postal_code, address'
        )
        .eq('id', loadedProject.user_id)
        .maybeSingle();

      if (profileError) {
        console.error('Quote profile load error:', profileError);
        setError('お客様情報を読み込めませんでした。');
        setLoading(false);
        return;
      }

      setProject(loadedProject);
      setProfile((profileData ?? null) as Profile | null);
      setLoading(false);
    })();
  }, [projectId, router]);

  if (loading) {
    return (
      <main className="quotePage">
        <p>見積書を読み込んでいます…</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="quotePage">
        <div className="toolbar">
          <button
            type="button"
            onClick={() => router.push(`/mypage/projects/${projectId}`)}
          >
            案件詳細へ戻る
          </button>
        </div>
        <div className="errorBox">{error}</div>
      </main>
    );
  }

  // quoted_amount は正式見積り入力値＝税抜金額として扱う。
  const subtotal = project.quoted_amount ?? 0;
  const taxRate = 10;
  const taxAmount = Math.floor(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount;

  return (
    <main className="quotePage">
      <div className="toolbar noPrint">
        <button
          type="button"
          onClick={() => router.push(`/mypage/projects/${projectId}`)}
        >
          ← 案件詳細へ戻る
        </button>
        <button
          type="button"
          className="printButton"
          onClick={() => window.print()}
        >
          印刷・PDF保存
        </button>
      </div>

      <article className="document">
        <header className="documentHeader">
          <h1>見 積 書</h1>
          <div className="documentMeta">
            <div>
              <span>見積番号</span>
              <strong>{quoteCode(project.project_code)}</strong>
            </div>
            <div>
              <span>見積日</span>
              <strong>{formatDate(project.quote_presented_at)}</strong>
            </div>
          </div>
        </header>

        <section className="parties">
          <div className="recipient">
            <strong>{profile?.company_name || '―'} 御中</strong>
            {profile?.department_name ? <div>{profile.department_name}</div> : null}
            {profile?.contact_name ? <div>{profile.contact_name} 様</div> : null}
            <p>下記のとおりお見積り申し上げます。</p>
          </div>

          <div className="issuer">
            <div className="issuerTitle">発行者</div>
            <strong>株式会社クリエイトサポート</strong>
            <div>〒444-2216</div>
            <div>愛知県豊田市九久平町澤ノ堂15番地1</div>
            <div>代表 日置 勝己</div>
            <div>登録番号：T1180301029001</div>
          </div>
        </section>

        <section className="amountBox">
          <span>お見積金額（税込）</span>
          <strong>{yen(total)}</strong>
        </section>

        <table className="detailTable">
          <tbody>
            <tr>
              <th>プロジェクト番号</th>
              <td>{project.project_code}</td>
            </tr>
            <tr>
              <th>案件名</th>
              <td>{project.title}</td>
            </tr>
            <tr>
              <th>納期</th>
              <td>{formatDate(project.confirmed_deadline)}</td>
            </tr>
            <tr>
              <th>見積工数</th>
              <td>
                {project.quoted_hours != null
                  ? `${project.quoted_hours}時間`
                  : '―'}
              </td>
            </tr>
          </tbody>
        </table>

        <section className="description">
          <h2>作業内容・制作条件</h2>
          <p>{project.description || '特記事項なし'}</p>
        </section>

        <section className="priceSection">
          <table className="priceTable">
            <tbody>
              <tr>
                <th>税抜金額</th>
                <td>{yen(subtotal)}</td>
              </tr>
              <tr>
                <th>消費税（{taxRate}%）</th>
                <td>{yen(taxAmount)}</td>
              </tr>
              <tr className="total">
                <th>合計金額</th>
                <td>{yen(total)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="documentFooter">
          <p>
            本見積書は、CS Worksで提示されている最新の正式見積り内容をもとに発行されています。
          </p>
        </footer>
      </article>

      <style jsx>{`
        .quotePage{min-height:100vh;background:#f1f5f9;padding:28px;color:#0f172a}
        .toolbar{max-width:920px;margin:0 auto 16px;display:flex;justify-content:space-between;gap:12px}
        .toolbar button{padding:11px 16px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:800;cursor:pointer}
        .toolbar .printButton{border-color:#1d4ed8;background:#1d4ed8;color:#fff}
        .document{box-sizing:border-box;width:100%;max-width:920px;min-height:1180px;margin:0 auto;padding:58px 64px;background:#fff;box-shadow:0 12px 34px rgba(15,23,42,.08)}
        .documentHeader{display:flex;justify-content:space-between;gap:30px;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:22px}
        .documentHeader h1{margin:0;font-size:32px;letter-spacing:.28em}
        .documentMeta{display:grid;gap:8px;font-size:13px}
        .documentMeta div{display:grid;grid-template-columns:76px 1fr;gap:12px}
        .documentMeta span{color:#64748b}
        .parties{display:grid;grid-template-columns:1fr 1fr;gap:48px;margin-top:34px}
        .recipient strong{display:inline-block;font-size:20px;border-bottom:1px solid #0f172a;padding-bottom:4px}
        .recipient>div{font-size:13px;line-height:1.75;margin-top:3px}
        .recipient p{margin-top:22px;line-height:1.8}
        .issuer{justify-self:end;width:100%;max-width:340px;font-size:13px;line-height:1.75}
        .issuerTitle{color:#64748b;font-size:11px;font-weight:800;margin-bottom:5px}
        .issuer strong{font-size:16px}
        .amountBox{margin-top:38px;padding:20px 24px;border:2px solid #0f172a;display:flex;justify-content:space-between;align-items:center}
        .amountBox span{font-weight:800}
        .amountBox strong{font-size:28px}
        .detailTable,.priceTable{width:100%;border-collapse:collapse}
        .detailTable{margin-top:28px}
        .detailTable th,.detailTable td,.priceTable th,.priceTable td{border:1px solid #cbd5e1;padding:12px 14px;text-align:left}
        .detailTable th{width:180px;background:#f8fafc;font-size:13px}
        .description{margin-top:28px}
        .description h2{font-size:15px;margin:0 0 10px}
        .description p{min-height:80px;margin:0;padding:14px;border:1px solid #cbd5e1;white-space:pre-wrap;line-height:1.75}
        .priceSection{display:flex;justify-content:flex-end;margin-top:30px}
        .priceTable{width:390px}
        .priceTable th{background:#f8fafc;width:55%}
        .priceTable td{text-align:right;font-weight:700}
        .priceTable .total th,.priceTable .total td{border-top:2px solid #0f172a;font-size:16px}
        .documentFooter{margin-top:48px;padding-top:16px;border-top:1px solid #cbd5e1;color:#64748b;font-size:11px}
        .errorBox{max-width:920px;margin:20px auto;padding:16px;border:1px solid #fecaca;border-radius:12px;background:#fef2f2;color:#b91c1c}
        @media(max-width:700px){
          .quotePage{padding:12px}
          .document{padding:30px 20px;min-height:0}
          .documentHeader,.parties{display:block}
          .documentMeta{margin-top:20px}
          .issuer{margin-top:30px;justify-self:auto}
          .amountBox{align-items:flex-start;gap:10px;flex-direction:column}
          .amountBox strong{font-size:24px}
          .priceTable{width:100%}
        }
        @media print{
          @page{size:A4 portrait;margin:9mm 11mm}
          html,body{margin:0!important;padding:0!important;background:#fff!important}
          .quotePage{min-height:0;background:#fff;padding:0;font-size:11px}
          .noPrint{display:none!important}
          .document{width:100%;max-width:none;min-height:0;margin:0;padding:0;box-shadow:none}
          .documentHeader{gap:18px;padding-bottom:12px}
          .documentHeader h1{font-size:26px;letter-spacing:.24em}
          .documentMeta{gap:4px;font-size:10px}
          .documentMeta div{grid-template-columns:62px 1fr;gap:8px}
          .parties{gap:28px;margin-top:18px}
          .recipient strong{font-size:16px}
          .recipient p{margin-top:12px;line-height:1.5}
          .issuer{max-width:320px;font-size:10px;line-height:1.45}
          .issuerTitle{font-size:9px;margin-bottom:3px}
          .issuer strong{font-size:12px}
          .amountBox{margin-top:20px;padding:12px 16px;break-inside:avoid}
          .amountBox strong{font-size:22px}
          .detailTable{margin-top:16px;break-inside:avoid}
          .detailTable th,.detailTable td,.priceTable th,.priceTable td{padding:7px 9px}
          .detailTable th{width:150px;font-size:10px}
          .description{margin-top:16px;break-inside:avoid}
          .description h2{font-size:11px;margin:0 0 6px}
          .description p{min-height:0;padding:9px;line-height:1.5;font-size:10px}
          .priceSection{margin-top:16px;break-inside:avoid}
          .priceTable{width:330px}
          .priceTable .total th,.priceTable .total td{font-size:12px}
          .documentFooter{margin-top:22px;padding-top:9px;font-size:8px;break-inside:avoid}
        }
      `}</style>
    </main>
  );
}
