'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../../../lib/supabase/client';

type ProjectOrder = {
  id: string;
  project_id: string;
  user_id: string;
  order_code: string;
  project_code: string;
  project_title: string;
  project_description: string | null;
  customer_company_name: string | null;
  customer_department_name: string | null;
  customer_contact_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_postal_code: string | null;
  customer_address: string | null;
  subtotal_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  quoted_hours: number | null;
  confirmed_deadline: string | null;
  ordered_at: string;
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

export default function ProjectOrderPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [order, setOrder] = useState<ProjectOrder | null>(null);
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

      const { data, error: loadError } = await (supabase.from('project_orders' as any) as any)
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (loadError) {
        console.error('Project order load error:', loadError);
        setError('発注書を読み込めませんでした。');
      } else if (!data) {
        setError('このプロジェクトの発注書はまだ発行されていません。');
      } else {
        setOrder(data as ProjectOrder);
      }

      setLoading(false);
    })();
  }, [projectId, router]);

  if (loading) {
    return <main className="orderPage"><p>発注書を読み込んでいます…</p></main>;
  }

  if (!order) {
    return (
      <main className="orderPage">
        <div className="toolbar">
          <button type="button" onClick={() => router.push(`/mypage/projects/${projectId}`)}>案件詳細へ戻る</button>
        </div>
        <div className="errorBox">{error}</div>
      </main>
    );
  }

  return (
    <main className="orderPage">
      <div className="toolbar noPrint">
        <button type="button" onClick={() => router.push(`/mypage/projects/${projectId}`)}>← 案件詳細へ戻る</button>
        <button type="button" className="printButton" onClick={() => window.print()}>印刷・PDF保存</button>
      </div>

      <article className="document">
        <header className="documentHeader">
          <h1>発 注 書</h1>
          <div className="documentMeta">
            <div><span>発注番号</span><strong>{order.order_code}</strong></div>
            <div><span>発注日</span><strong>{formatDate(order.ordered_at)}</strong></div>
          </div>
        </header>

        <section className="parties">
          <div className="recipient">
            <strong>株式会社クリエイトサポート 御中</strong>
            <p>下記の内容にて発注いたします。</p>
          </div>

          <div className="issuer">
            <div className="issuerTitle">発注者</div>
            <strong>{order.customer_company_name || '―'}</strong>
            {order.customer_department_name ? <div>{order.customer_department_name}</div> : null}
            {order.customer_contact_name ? <div>{order.customer_contact_name} 様</div> : null}
            {order.customer_postal_code ? <div>〒{order.customer_postal_code}</div> : null}
            {order.customer_address ? <div>{order.customer_address}</div> : null}
            {order.customer_phone ? <div>TEL：{order.customer_phone}</div> : null}
            {order.customer_email ? <div>{order.customer_email}</div> : null}
          </div>
        </section>

        <section className="amountBox">
          <span>発注金額（税込）</span>
          <strong>{yen(order.total_amount)}</strong>
        </section>

        <table className="detailTable">
          <tbody>
            <tr>
              <th>プロジェクト番号</th>
              <td>{order.project_code}</td>
            </tr>
            <tr>
              <th>案件名</th>
              <td>{order.project_title}</td>
            </tr>
            <tr>
              <th>納期</th>
              <td>{formatDate(order.confirmed_deadline)}</td>
            </tr>
            <tr>
              <th>見積工数</th>
              <td>{order.quoted_hours != null ? `${order.quoted_hours}時間` : '―'}</td>
            </tr>
          </tbody>
        </table>

        <section className="description">
          <h2>作業内容・制作条件</h2>
          <p>{order.project_description || '特記事項なし'}</p>
        </section>

        <section className="priceSection">
          <table className="priceTable">
            <tbody>
              <tr><th>税抜金額</th><td>{yen(order.subtotal_amount)}</td></tr>
              <tr><th>消費税（{Number(order.tax_rate)}%）</th><td>{yen(order.tax_amount)}</td></tr>
              <tr className="total"><th>合計金額</th><td>{yen(order.total_amount)}</td></tr>
            </tbody>
          </table>
        </section>

        <footer className="documentFooter">
          <p>本発注書は、CS Worksでの発注確定時点の内容をもとに発行されています。</p>
        </footer>
      </article>

      <style jsx>{`
        .orderPage{min-height:100vh;background:#f1f5f9;padding:28px;color:#0f172a}
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
          .orderPage{padding:12px}
          .document{padding:30px 20px;min-height:0}
          .documentHeader,.parties{display:block}
          .documentMeta{margin-top:20px}
          .issuer{margin-top:30px;justify-self:auto}
          .amountBox{align-items:flex-start;gap:10px;flex-direction:column}
          .amountBox strong{font-size:24px}
          .priceTable{width:100%}
        }
        @media print{
          @page{size:A4;margin:12mm}
          .orderPage{background:#fff;padding:0}
          .noPrint{display:none!important}
          .document{max-width:none;min-height:0;margin:0;padding:0;box-shadow:none}
        }
      `}</style>
    </main>
  );
}
