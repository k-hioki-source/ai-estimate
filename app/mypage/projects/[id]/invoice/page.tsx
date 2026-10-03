'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../../../lib/supabase/client';

type Invoice = {
  id: string; project_id: string; invoice_code: string; project_code: string;
  project_title: string; project_description: string | null;
  customer_company_name: string | null; customer_department_name: string | null;
  customer_contact_name: string | null; customer_postal_code: string | null;
  customer_address: string | null; subtotal_amount: number; tax_rate: number;
  tax_amount: number; total_amount: number; quoted_hours: number | null;
  confirmed_deadline: string | null; invoice_date: string; payment_due_date: string | null;
  issuer_name: string; issuer_registration_number: string;
  bank_name: string; bank_code: string; bank_branch_name: string; bank_branch_code: string;
  bank_account_type: string; bank_account_number: string;
  bank_account_name: string; bank_account_name_kana: string;
};

function dateJP(v:string|null) {
  if (!v) return '―';
  const [y,m,d]=v.slice(0,10).split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}
function yen(v:number){ return `¥${v.toLocaleString('ja-JP')}`; }

export default function InvoicePage() {
  const router=useRouter();
  const params=useParams<{id:string}>();
  const [invoice,setInvoice]=useState<Invoice|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    (async()=>{
      const supabase=getSupabaseBrowserClient();
      const {data:userData}=await supabase.auth.getUser();
      if(!userData.user){ router.replace('/login'); return; }
      const {data,error:e}=await (supabase.from('project_invoices' as any) as any)
        .select('*').eq('project_id',params.id).maybeSingle();
      if(e){ console.error(e); setError('請求書を読み込めませんでした。'); }
      else if(!data){ setError('請求書が見つかりません。'); }
      else setInvoice(data as Invoice);
      setLoading(false);
    })();
  },[params.id,router]);

  if(loading) return <main className="screen"><p>請求書を読み込んでいます…</p></main>;
  if(error || !invoice) return <main className="screen"><p>{error}</p><button onClick={()=>router.back()}>戻る</button></main>;

  return (
    <main className="screen">
      <div className="toolbar">
        <button onClick={()=>router.push(`/mypage/projects/${params.id}`)}>案件詳細へ戻る</button>
        <button className="print" onClick={()=>window.print()}>印刷・PDF保存</button>
      </div>

      <article className="paper">
        <header>
          <div>
            <div className="english">INVOICE</div>
            <h1>請 求 書</h1>
          </div>
          <div className="docmeta">
            <div><span>請求書番号</span><strong>{invoice.invoice_code}</strong></div>
            <div><span>請求日</span><strong>{dateJP(invoice.invoice_date)}</strong></div>
          </div>
        </header>

        <section className="top">
          <div className="customer">
            <div className="address">{invoice.customer_postal_code ? `〒${invoice.customer_postal_code}` : ''}</div>
            <div className="address">{invoice.customer_address}</div>
            <h2>{invoice.customer_company_name || invoice.customer_contact_name || 'お客様'} 御中</h2>
            {invoice.customer_department_name ? <p>{invoice.customer_department_name}</p> : null}
            {invoice.customer_contact_name && invoice.customer_company_name ? <p>{invoice.customer_contact_name} 様</p> : null}
            <p className="greeting">下記の通りご請求申し上げます。</p>
          </div>

          <div className="issuer">
            <div className="issuerText">
              <strong>{invoice.issuer_name}</strong>
              <span>〒444-2216</span>
              <span>愛知県豊田市九久平町澤ノ堂15番地1</span>
              <span>代表　日置 勝己</span>
              <span>登録番号：{invoice.issuer_registration_number}</span>
            </div>
            <img src="/cs-works/company-stamp.png" alt="株式会社クリエイトサポート 社印" />
          </div>
        </section>

        <section className="amount">
          <span>ご請求金額（税込）</span>
          <strong>{yen(invoice.total_amount)}</strong>
        </section>

        <section className="project">
          <div><span>案件番号</span><strong>{invoice.project_code}</strong></div>
          <div><span>案件名</span><strong>{invoice.project_title}</strong></div>
          {invoice.project_description ? <div className="wide"><span>制作内容</span><strong>{invoice.project_description}</strong></div> : null}
        </section>

        <table>
          <thead><tr><th>内容</th><th>数量</th><th>税率</th><th>金額</th></tr></thead>
          <tbody>
            <tr>
              <td>{invoice.project_title}</td>
              <td>1式</td>
              <td>{Number(invoice.tax_rate)}%</td>
              <td>{yen(invoice.subtotal_amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr><th colSpan={3}>小計</th><td>{yen(invoice.subtotal_amount)}</td></tr>
            <tr><th colSpan={3}>消費税（{Number(invoice.tax_rate)}%）</th><td>{yen(invoice.tax_amount)}</td></tr>
            <tr className="total"><th colSpan={3}>合計</th><td>{yen(invoice.total_amount)}</td></tr>
          </tfoot>
        </table>

        <section className="payment">
          <div>
            <span className="label">お支払期限</span>
            <strong>{dateJP(invoice.payment_due_date)}</strong>
          </div>
          <div className="bank">
            <span className="label">お振込先</span>
            <strong>{invoice.bank_name}（金融機関コード {invoice.bank_code}）</strong>
            <p>{invoice.bank_branch_name}（支店コード {invoice.bank_branch_code}）　{invoice.bank_account_type}　{invoice.bank_account_number}</p>
            <p>口座名義：{invoice.bank_account_name_kana}</p>
          </div>
        </section>

        <footer>
          <p>※ 振込手数料はお客様にてご負担くださいますようお願いいたします。</p>
          <p>※ 本請求書はCS Worksの案件ごとに発行しています。</p>
        </footer>
      </article>

      <style jsx>{`
        .screen{min-height:100vh;background:#eef2f7;padding:28px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;color:#172033}
        .toolbar{max-width:900px;margin:0 auto 16px;display:flex;justify-content:space-between}
        .toolbar button{padding:10px 16px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;font-weight:800;cursor:pointer}
        .toolbar .print{background:#173d83;color:#fff;border-color:#173d83}
        .paper{box-sizing:border-box;width:210mm;min-height:297mm;margin:auto;background:#fff;padding:13mm 15mm 11mm;box-shadow:0 12px 35px rgba(15,23,42,.12)}
        header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #173d83;padding-bottom:6mm}
        .english{font-size:11px;letter-spacing:.22em;font-weight:900;color:#6b7b98}
        h1{font-size:30px;letter-spacing:.22em;margin:5px 0 0}
        .docmeta{display:grid;gap:7px;text-align:right;font-size:11px}
        .docmeta span{display:block;color:#64748b;margin-bottom:2px}.docmeta strong{font-size:12px}
        .top{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-top:5mm;min-height:40mm}
        .customer h2{font-size:19px;border-bottom:1px solid #172033;padding-bottom:5px;margin:8px 0}
        .customer p{margin:3px 0;font-size:11px}.customer .greeting{margin-top:13px}.address{font-size:10px;color:#64748b;line-height:1.6}
        .issuer{position:relative;display:flex;justify-content:flex-end;align-items:flex-start;gap:5px}
        .issuerText{display:grid;text-align:left;font-size:10px;line-height:1.65;min-width:57mm}.issuerText strong{font-size:14px;margin-bottom:3px}
        .issuer img{width:27mm;height:27mm;object-fit:contain;margin-top:1mm}
        .amount{margin:4mm 0 5mm;padding:5mm 6mm;background:#f4f7fb;border-left:5px solid #173d83;display:flex;align-items:end;justify-content:space-between}
        .amount span{font-size:12px;font-weight:800}.amount strong{font-size:27px;color:#173d83}
        .project{display:grid;grid-template-columns:1fr 2fr;border:1px solid #d8dee8;margin-bottom:4mm}
        .project div{padding:3mm;border-right:1px solid #d8dee8}.project div:nth-child(2){border-right:0}.project .wide{grid-column:1/-1;border-top:1px solid #d8dee8;border-right:0}
        .project span{display:block;font-size:9px;color:#64748b;margin-bottom:2px}.project strong{font-size:11px;white-space:pre-wrap}
        table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cfd6e0;padding:2.6mm;text-align:left}
        thead th{background:#173d83;color:#fff}th:nth-child(n+2),td:nth-child(n+2){text-align:right}
        tfoot th{background:#f8fafc;text-align:right}.total th,.total td{font-size:13px;font-weight:900;background:#eef4ff}
        .payment{margin-top:5mm;border:1px solid #d8dee8;padding:4mm;display:grid;grid-template-columns:1fr 2fr;gap:8mm}
        .label{display:block;font-size:9px;color:#64748b;font-weight:800;margin-bottom:4px}.payment strong{font-size:11px}.bank p{font-size:10px;margin:4px 0 0}
        footer{margin-top:5mm;border-top:1px solid #e2e8f0;padding-top:4mm;color:#64748b;font-size:9px;line-height:1.6}
        footer p{margin:2px 0}
        @media(max-width:900px){.screen{padding:10px;overflow:auto}.paper{transform-origin:top left}.toolbar{width:210mm}}
        @media print{
          @page{size:A4;margin:0}
          .screen{background:#fff;padding:0}.toolbar{display:none}.paper{width:210mm;height:297mm;min-height:0;margin:0;padding:13mm 15mm 11mm;box-shadow:none;overflow:hidden}
        }
      `}</style>
    </main>
  );
}
