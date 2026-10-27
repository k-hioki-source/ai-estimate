'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formalQuotesEnabled, quoteTotals, type FormalQuote, type QuoteContext, type QuoteItem } from '../../lib/cs-works/formal-quotes';
import { formalQuoteRequest } from '../../lib/cs-works/formal-quotes-client';
import { QuoteItemsTable } from './FormalQuoteDetails';
type Project = { id: string; status: string; formal_quote_id?: string | null };
const blank = (number: number): QuoteItem => ({ item_key: crypto.randomUUID(), number: String(number).padStart(2, '0'), name: '', description: '', amount: 0, hours: 0 });
export default function FormalQuoteEditor({ project, children, onPresented }: { project: Project; children: ReactNode; onPresented: (project: any, replayed: boolean) => Promise<void> }) {
  const [context, setContext] = useState<QuoteContext | null>(null), [mode, setMode] = useState(!!project.formal_quote_id);
  const [items, setItems] = useState<QuoteItem[]>([]), [deadline, setDeadline] = useState('');
  const [draft, setDraft] = useState<FormalQuote | null>(null), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const request = useRef<string | null>(null);
  const requestAction = useRef<boolean | null>(null);
  useEffect(() => { if (!formalQuotesEnabled) return; let active = true; setContext(null); setMode(!!project.formal_quote_id); setItems([]); setDeadline(''); setDraft(null); setDirty(false); request.current = null;
    formalQuoteRequest<QuoteContext>(project.id).then(c => { if (!active) return; setContext(c); const q = c.draft || c.current; setDraft(c.draft); if (q) { setMode(true); setItems(q.items); setDeadline(q.deadline); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [project.id]);
  useEffect(() => { const guard = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
  const editable = ['quote_requested', 'quote_reviewing', 'quote_presented'].includes(project.status);
  if (!formalQuotesEnabled) return project.formal_quote_id ? <p role="alert">正式見積り明細の設定を確認してください。</p> : <>{children}</>;
  if (!context) return <p role={error ? 'alert' : 'status'}>{error || '正式見積りを確認中…'}</p>;
  if (!mode) return <>{['quote_requested', 'quote_reviewing'].includes(project.status) && <button type="button" onClick={() => { setMode(true); setItems([blank(1)]); }}>イラストごとの明細で見積もる</button>}{children}</>;
  if (!editable) return context.current ? <><QuoteItemsTable quote={context.current} /><details><summary>提示済み見積りの履歴</summary>{context.history.map(q => <p key={q.id}><a href={`/mypage/projects/${project.id}/quote?quoteId=${q.id}`} target="_blank" rel="noreferrer">第{q.revision}版の見積書</a></p>)}</details></> : <p>正式見積りは確定済みです。</p>;
  const change = (i: number, field: keyof QuoteItem, value: string | number) => { setItems(xs => xs.map((x, n) => n === i ? { ...x, [field]: value } : x)); setDirty(true); request.current = null; setNotice(''); };
  let totals: ReturnType<typeof quoteTotals> | null = null; try { totals = quoteTotals(items); } catch {}
  async function save(present: boolean) {
    if (busy) return; setError(''); setNotice('');
    try { quoteTotals(items); if (!deadline) throw Error('納期を入力してください。'); } catch (e) { setError((e as Error).message); return; }
    if (present && !window.confirm('この明細・合計金額・納期をお客様へ提示しますか？')) return;
    setBusy(true); if (requestAction.current !== present) request.current = null; requestAction.current = present; request.current ||= crypto.randomUUID();
    try {
      const r = await formalQuoteRequest<{ quote: FormalQuote; project: any; replayed: boolean }>(project.id, { action: present ? 'present' : 'save', requestId: request.current, expectedQuoteId: context!.current?.id ?? null, draftId: draft?.id ?? null, editVersion: draft?.edit_version ?? 0, deadline, items });
      setDirty(false); setDraft(present ? null : r.quote); setContext(c => ({ ...c!, current: present ? r.quote : c!.current, draft: present ? null : r.quote, history: present ? [r.quote, ...c!.history.filter(q => q.id !== r.quote.id)] : c!.history })); request.current = null;
      setNotice(present ? '正式見積りを提示しました。' : '下書きを保存しました。お客様にはまだ表示されません。');
      if (present) await onPresented(r.project, r.replayed);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div style={{ border: '1px solid #bfdbfe', background: '#f8fbff', borderRadius: 12, padding: 16 }}>
    <strong>イラスト別の正式見積り</strong><p>AI概算とは独立した見積りです。1行につきイラスト1点を登録してください。提示後の変更は新しい版として保存します。</p>
    {context.history.length > 0 && <details><summary>提示済み見積りの履歴</summary>{context.history.map(q => <p key={q.id}><a href={`/mypage/projects/${project.id}/quote?quoteId=${q.id}`} target="_blank" rel="noreferrer">第{q.revision}版の見積書（{q.subtotal.toLocaleString()}円・税抜）</a></p>)}</details>}
    {context.current && <p>現在の提示：第{context.current.revision}版 ／ {context.current.subtotal.toLocaleString()}円（税抜）</p>}
    <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
      {items.map((x, i) => <div key={x.item_key} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 12, marginTop: 10, border: '1px solid #dbe3ec', borderRadius: 8, background: '#fff' }}>
        <label>番号<input aria-label={`明細${i + 1}の番号`} value={x.number} maxLength={40} onChange={e => change(i, 'number', e.target.value)} style={{ display: 'block', width: 70 }} /></label>
        <label style={{ flex: '1 1 200px' }}>イラスト名<input aria-label={`明細${i + 1}の名前`} value={x.name} maxLength={200} onChange={e => change(i, 'name', e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box' }} /></label>
        <label>金額（税抜・円）<input aria-label={`明細${i + 1}の金額`} type="number" min={0} step={1} value={Number.isNaN(x.amount) ? '' : x.amount} onChange={e => change(i, 'amount', e.target.value === '' ? NaN : Number(e.target.value))} style={{ display: 'block', width: 140 }} /></label>
        <label>工数（時間）<input aria-label={`明細${i + 1}の工数`} type="number" min={0} step="0.01" value={Number.isNaN(x.hours) ? '' : x.hours} onChange={e => change(i, 'hours', e.target.value === '' ? NaN : Number(e.target.value))} style={{ display: 'block', width: 100 }} /></label>
        <label style={{ flex: '1 1 100%' }}>制作内容・備考<textarea aria-label={`明細${i + 1}の制作内容`} value={x.description} maxLength={2000} onChange={e => change(i, 'description', e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box' }} /></label>
        <button type="button" onClick={() => { setItems(xs => xs.filter((_, n) => n !== i)); setDirty(true); request.current = null; }}>この明細を削除</button>
      </div>)}
      <button type="button" disabled={items.length >= 200} onClick={() => { let n = items.length + 1; while (items.some(x => x.number === String(n).padStart(2, '0'))) n++; setItems(xs => [...xs, blank(n)]); setDirty(true); request.current = null; }} style={{ marginTop: 12 }}>＋ イラストを追加</button>
      <p>税抜小計：{totals?.subtotal.toLocaleString() ?? '—'}円 ／ 消費税10％：{totals?.tax.toLocaleString() ?? '—'}円 ／ 税込合計：{totals?.total.toLocaleString() ?? '—'}円 ／ 合計工数：{totals?.hours ?? '—'}時間</p>
      <label>案件全体の納期 <input type="date" value={deadline} onChange={e => { setDeadline(e.target.value); setDirty(true); request.current = null; }} /></label>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}><button type="button" onClick={() => save(false)}>下書き保存</button><button type="button" onClick={() => save(true)} style={{ background: '#1d4ed8', color: '#fff', border: 0, borderRadius: 8, padding: '12px 18px' }}>{busy ? '処理中…' : 'この明細で正式見積りを提示'}</button></div>
    </fieldset>
    {dirty && <p>未保存の変更があります。</p>}{notice && <p role="status">{notice}</p>}{error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
  </div>;
}
