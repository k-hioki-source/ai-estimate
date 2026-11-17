'use client';
import { useEffect, useState } from 'react';
import { formalQuotesEnabled, type FormalQuote, type QuoteContext } from '../../lib/cs-works/formal-quotes';
import { formalQuoteRequest } from '../../lib/cs-works/formal-quotes-client';
export function QuoteItemsTable({ quote }: { quote: FormalQuote }) {
  return <div style={{ overflowX: 'auto', margin: '16px 0' }}><p>正式見積り 第{quote.revision}版 ／ {quote.items.length}点{quote.state === 'superseded' ? ' ／ 旧版（参考）' : quote.state === 'accepted' ? ' ／ 発注確定済み' : ''}</p><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr>{['番号', 'イラスト名・制作内容', '数量', '金額（税抜）', '工数'].map(x => <th key={x} style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid #cbd5e1' }}>{x}</th>)}</tr></thead><tbody>{quote.items.map(x => <tr key={x.item_key}><td style={{ padding: 8 }}>{x.number}</td><td style={{ padding: 8, overflowWrap: 'anywhere' }}>{x.name}{x.description && <div style={{ whiteSpace: 'pre-wrap', color: '#64748b' }}>{x.description}</div>}</td><td style={{ padding: 8 }}>1点</td><td style={{ padding: 8, whiteSpace: 'nowrap' }}>{x.amount.toLocaleString()}円</td><td style={{ padding: 8 }}>{x.hours}時間</td></tr>)}</tbody>
<tfoot>
{(quote.coupon_discount_amount??0)>0&&<tr><td colSpan={3}>初回お試しクーポン</td><td>−{quote.coupon_discount_amount!.toLocaleString()}円</td><td/></tr>}
<tr><td colSpan={3}>値引後小計（税抜）</td><td>{quote.subtotal.toLocaleString()}円</td><td/></tr>
<tr><td colSpan={3}>消費税10％</td><td>{Math.floor(quote.subtotal/10).toLocaleString()}円</td><td/></tr>
<tr><td colSpan={3}>税込合計</td><td>{(quote.subtotal+Math.floor(quote.subtotal/10)).toLocaleString()}円</td><td/></tr>
</tfoot></table>
{(quote.coupon_discount_amount??0)>0&&quote.state==='presented'&&<p>クーポンは先に発注が確定した案件に適用されます。他の案件で利用済みの場合は見積り金額が更新されます。</p>}
{quote.subtotal===0&&quote.coupon_application==='full'&&<p>クーポン適用・0円納品。請求書は発行しません。</p>}</div>;
}
// Only new-mode records render this component. A failed load never silently prints an empty legacy document.
export default function FormalQuoteDetails({ projectId, quoteId, onReadinessChange }: { projectId: string; quoteId: string; onReadinessChange?: (ready: boolean) => void }) {
  const [quote, setQuote] = useState<FormalQuote | null>(null), [error, setError] = useState('');
  useEffect(() => { let active = true; setQuote(null); setError(''); onReadinessChange?.(false);
    if (!formalQuotesEnabled) { setError('正式見積り明細の表示設定を確認してください。'); return; }
    formalQuoteRequest<QuoteContext>(projectId).then(c => { const q = c.history.find(x => x.id === quoteId); if (!q) throw Error('対象の見積りを取得できません。'); if (active) { setQuote(q); onReadinessChange?.(true); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [projectId, quoteId, onReadinessChange]);
  return quote ? <QuoteItemsTable quote={quote} /> : <p role={error ? 'alert' : 'status'} style={{ color: error ? '#b91c1c' : undefined }}>{error || '正式見積り明細を読み込み中…'}</p>;
}
