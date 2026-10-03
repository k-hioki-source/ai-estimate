'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../../../lib/supabase/client';

type DeliveryDocument = {
  id: string;
  project_id: string;
  delivery_code: string;
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
  delivered_at: string;
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

export default function DeliveryDocumentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [delivery, setDelivery] = useState<DeliveryDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDelivery() {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.replace('/login');
        return;
      }

      const { data, error: loadError } = await (
        supabase.from('project_deliveries' as any) as any
      )
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (loadError) {
        console.error('Delivery document load error:', loadError);
        setError('納品書を取得できませんでした。');
      } else if (!data) {
        setError('この案件の納品書はまだ発行されていません。');
      } else {
        setDelivery(data as DeliveryDocument);
      }

      setLoading(false);
    }

    loadDelivery();
  }, [projectId, router]);

  if (loading) {
    return <main className="page"><div className="message">納品書を読み込んでいます…</div></main>;
  }

  if (error || !delivery) {
    return (
      <main className="page">
        <div className="toolbar noPrint">
          <button type="button" onClick={() => router.push(`/mypage/projects/${projectId}`)}>
            ← 案件詳細へ戻る
          </button>
        </div>
        <div className="message">{error || '納品書が見つかりません。'}</div>
      </main>
    );
  }

  const customerName =
    delivery.customer_company_name ||
    delivery.customer_contact_name ||
    'お客様';

  return (
    <main className="page">
      <div className="toolbar noPrint">
        <button type="button" onClick={() => router.push(`/mypage/projects/${projectId}`)}>
          ← 案件詳細へ戻る
        </button>
        <button type="button" className="printButton" onClick={() => window.print()}>
          印刷・PDF保存
        </button>
      </div>

      <article className="document">
        <header className="documentHeader">
          <div>
            <div className="documentLabel">DELIVERY NOTE</div>
            <h1>納 品 書</h1>
          </div>
          <div className="documentMeta">
            <div><span>納品番号</span><strong>{delivery.delivery_code}</strong></div>
            <div><span>納品日</span><strong>{formatDate(delivery.delivered_at)}</strong></div>
          </div>
        </header>

        <section className="parties">
          <div className="recipient">
            <strong>{customerName} 御中</strong>
            {delivery.customer_company_name && delivery.customer_contact_name ? (
              <p>
                {delivery.customer_department_name ? `${delivery.customer_department_name} ` : ''}
                {delivery.customer_contact_name} 様
              </p>
            ) : null}
            <p className="greeting">下記の通り納品申し上げます。</p>
          </div>

          <div className="issuer">
            <div className="issuerTitle">発行者</div>
            <strong>株式会社クリエイトサポート</strong>
          </div>
        </section>

        <section className="amountBox">
          <span>納品金額（税込）</span>
          <strong>{yen(delivery.total_amount)}</strong>
        </section>

        <table className="detailTable">
          <tbody>
            <tr><th>案件番号</th><td>{delivery.project_code}</td></tr>
            <tr><th>案件名</th><td>{delivery.project_title}</td></tr>
            <tr><th>確定納期</th><td>{formatDate(delivery.confirmed_deadline)}</td></tr>
            <tr><th>正式見積工数</th><td>{delivery.quoted_hours != null ? `${delivery.quoted_hours}時間` : '―'}</td></tr>
          </tbody>
        </table>

        {delivery.project_description ? (
          <section className="description">
            <h2>制作内容・備考</h2>
            <p>{delivery.project_description}</p>
          </section>
        ) : null}

        <section className="priceSection">
          <table className="priceTable">
            <tbody>
              <tr><th>税抜金額</th><td>{yen(delivery.subtotal_amount)}</td></tr>
              <tr><th>消費税（{Number(delivery.tax_rate)}%）</th><td>{yen(delivery.tax_amount)}</td></tr>
              <tr className="total"><th>合計</th><td>{yen(delivery.total_amount)}</td></tr>
            </tbody>
          </table>
        </section>

        <footer className="documentFooter">
          本納品書は、CS Worksにて納品確定時の案件情報をもとに発行しています。
        </footer>
      </article>

      <style jsx>{`
        * { box-sizing: border-box; }
        .page { min-height: 100vh; background: #f3f6fa; padding: 28px 20px 50px; color: #172033; }
        .toolbar { width: min(920px,100%); margin: 0 auto 16px; display: flex; justify-content: space-between; gap: 12px; }
        .toolbar button { border: 1px solid #cbd5e1; background: #fff; padding: 10px 15px; border-radius: 9px; font-weight: 800; cursor: pointer; }
        .toolbar .printButton { border-color: #1d4ed8; background: #1d4ed8; color: #fff; }
        .message { width: min(920px,100%); margin: 40px auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 14px; background: #fff; }
        .document { width: min(920px,100%); min-height: 1120px; margin: 0 auto; padding: 54px 60px; background: #fff; box-shadow: 0 12px 34px rgba(15,23,42,.09); }
        .documentHeader { display: flex; justify-content: space-between; align-items: flex-start; gap: 28px; padding-bottom: 22px; border-bottom: 2px solid #172033; }
        .documentLabel { font-size: 10px; letter-spacing: .18em; color: #64748b; font-weight: 900; }
        .documentHeader h1 { margin: 8px 0 0; font-size: 34px; letter-spacing: .28em; }
        .documentMeta { min-width: 290px; display: grid; gap: 8px; font-size: 12px; }
        .documentMeta div { display: grid; grid-template-columns: 75px 1fr; gap: 10px; }
        .documentMeta span { color: #64748b; }
        .documentMeta strong { text-align: right; }
        .parties { display: grid; grid-template-columns: 1fr 330px; gap: 48px; margin-top: 32px; align-items: start; }
        .recipient strong { display: inline-block; font-size: 20px; border-bottom: 1px solid #172033; padding-bottom: 5px; }
        .recipient p { margin: 10px 0 0; font-size: 13px; }
        .recipient .greeting { margin-top: 22px; color: #475569; }
        .issuer { font-size: 12px; line-height: 1.65; text-align: right; }
        .issuerTitle { color: #64748b; font-size: 10px; margin-bottom: 4px; }
        .issuer strong { font-size: 14px; }
        .amountBox { margin-top: 32px; padding: 17px 20px; display: flex; justify-content: space-between; align-items: center; border: 2px solid #172033; }
        .amountBox span { font-size: 13px; font-weight: 800; }
        .amountBox strong { font-size: 26px; }
        table { border-collapse: collapse; }
        .detailTable { width: 100%; margin-top: 26px; }
        .detailTable th, .detailTable td, .priceTable th, .priceTable td { padding: 11px 13px; border: 1px solid #d8dee8; }
        .detailTable th { width: 180px; background: #f7f9fc; text-align: left; font-size: 12px; }
        .detailTable td { font-size: 13px; }
        .description { margin-top: 24px; }
        .description h2 { margin: 0 0 8px; font-size: 13px; }
        .description p { min-height: 58px; margin: 0; padding: 12px; border: 1px solid #d8dee8; white-space: pre-wrap; line-height: 1.65; font-size: 12px; }
        .priceSection { display: flex; justify-content: flex-end; margin-top: 26px; }
        .priceTable { width: 390px; }
        .priceTable th { text-align: left; background: #f7f9fc; font-size: 12px; }
        .priceTable td { text-align: right; font-size: 13px; font-weight: 700; }
        .priceTable .total th, .priceTable .total td { border-top: 2px solid #172033; font-size: 14px; font-weight: 900; }
        .documentFooter { margin-top: 42px; padding-top: 12px; border-top: 1px solid #d8dee8; color: #64748b; font-size: 10px; }

        @media (max-width: 700px) {
          .page { padding: 16px 10px 30px; }
          .document { min-height: 0; padding: 28px 20px; }
          .documentHeader, .parties { display: block; }
          .documentMeta { min-width: 0; margin-top: 22px; }
          .parties .issuer { margin-top: 28px; text-align: left; }
          .amountBox { gap: 15px; }
          .amountBox strong { font-size: 21px; }
          .priceTable { width: 100%; }
        }

        @media print {
          @page { size: A4 portrait; margin: 9mm 11mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          .page { min-height: 0; background: #fff; padding: 0; font-size: 11px; }
          .noPrint { display: none !important; }
          .document { width: 100%; max-width: none; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
          .documentHeader { gap: 18px; padding-bottom: 12px; }
          .documentHeader h1 { font-size: 26px; letter-spacing: .24em; }
          .documentMeta { gap: 4px; font-size: 10px; }
          .documentMeta div { grid-template-columns: 62px 1fr; gap: 8px; }
          .parties { gap: 28px; margin-top: 18px; }
          .recipient strong { font-size: 16px; }
          .recipient p { margin-top: 7px; line-height: 1.45; }
          .recipient .greeting { margin-top: 12px; }
          .issuer { max-width: 320px; font-size: 10px; line-height: 1.45; }
          .issuerTitle { font-size: 9px; margin-bottom: 3px; }
          .issuer strong { font-size: 12px; }
          .amountBox { margin-top: 20px; padding: 12px 16px; break-inside: avoid; }
          .amountBox strong { font-size: 22px; }
          .detailTable { margin-top: 16px; break-inside: avoid; }
          .detailTable th, .detailTable td, .priceTable th, .priceTable td { padding: 7px 9px; }
          .detailTable th { width: 150px; font-size: 10px; }
          .description { margin-top: 16px; break-inside: avoid; }
          .description h2 { font-size: 11px; margin: 0 0 6px; }
          .description p { min-height: 0; padding: 9px; line-height: 1.5; font-size: 10px; }
          .priceSection { margin-top: 16px; break-inside: avoid; }
          .priceTable { width: 330px; }
          .priceTable .total th, .priceTable .total td { font-size: 12px; }
          .documentFooter { margin-top: 22px; padding-top: 9px; font-size: 8px; break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
