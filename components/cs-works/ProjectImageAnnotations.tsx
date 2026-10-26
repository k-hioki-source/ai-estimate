'use client';
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { emptyAnnotations, imagePoint, validateAnnotations, type AnnotationDocument, type AnnotationStroke, type ReviewFile, type SavedAnnotation } from '../../lib/cs-works/image-annotations';
import { annotationRequest, markAnnotationDirty } from '../../lib/cs-works/image-annotations-client';

type Props = { projectId: string; batchId: string; file: Pick<ReviewFile, 'id' | 'file_name'>; url: string; editable: boolean; saved?: SavedAnnotation; onClose: () => void; onSaved?: () => void };
const buttonStyle = { width: 'auto', flex: '0 0 auto', border: '1px solid #94a3b8', borderRadius: 6, background: '#fff', color: '#0f172a', padding: '7px 10px', cursor: 'pointer' } as const;
const newId = () => crypto.randomUUID();
export default function ProjectImageAnnotations({ projectId, batchId, file, url, editable, saved, onClose, onSaved }: Props) {
  const [document, setDocument] = useState<AnnotationDocument>(() => saved?.document ?? emptyAnnotations());
  const [baseline, setBaseline] = useState(() => JSON.stringify(saved?.document ?? emptyAnnotations()));
  const [version, setVersion] = useState(saved?.version ?? 0);
  const [tool, setTool] = useState<'pin' | 'pen' | 'select'>('pin');
  const [stroke, setStroke] = useState<AnnotationStroke | null>(null);
  const strokeRef = useRef<AnnotationStroke | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const titleId = useId();
  const dirty = JSON.stringify(document) !== baseline;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty || !!stroke || !!pendingPin;
  const key = `${projectId}:${batchId}:${file.id}`;
  const canEdit = editable && !saved?.finalized_at;
  const totalPoints = document.strokes.reduce((n, s) => n + s.points.length, 0);
  const undo = useRef<AnnotationDocument[]>([]);
  function change(next: AnnotationDocument) { undo.current.push(document); if (undo.current.length > 20) undo.current.shift(); setDocument(next); setNotice(''); }
  function close() { if (saving) return; if (dirtyRef.current && !window.confirm('未保存の修正指示を破棄して閉じますか？')) return; onClose(); }
  closeRef.current = close;
  useEffect(() => { markAnnotationDirty(key, dirty || !!pendingPin || !!stroke); return () => markAnnotationDirty(key, false); }, [key, dirty, pendingPin, stroke]);
  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden'; dialogRef.current?.focus();
    const beforeUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeRef.current(); } };
    window.document.addEventListener('keydown', escape, true);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.document.body.style.overflow = previousOverflow; window.removeEventListener('beforeunload', beforeUnload); window.document.removeEventListener('keydown', escape, true); previous?.focus(); };
  }, []);
  const point = (e: ReactPointerEvent<SVGSVGElement>) => imagePoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  function pointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (!canEdit || saving || !ready || e.button !== 0) return;
    if (tool === 'select') return;
    e.preventDefault();
    if (tool === 'pin') { if (document.pins.length >= 100) { setError('コメントピンは100件までです。'); return; } setPendingPin(point(e)); setComment(''); return; }
    if (document.strokes.length >= 200 || totalPoints >= 20000) { setError('赤線の保存上限です。不要な線を削除してください。'); return; }
    const next = { id: newId(), points: [point(e)] }; strokeRef.current = next; setStroke(next); e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const current = strokeRef.current; if (!current) return;
    if (current.points.length >= 2000 || totalPoints + current.points.length >= 20000) return;
    const p = point(e), last = current.points[current.points.length - 1];
    if (Math.hypot((p.x - last.x) * size.width, (p.y - last.y) * size.height) < 1) return;
    const next = { ...current, points: [...current.points, p] }; strokeRef.current = next; setStroke(next);
  }
  function endStroke() { const s = strokeRef.current; if (s && s.points.length >= 2) change({ ...document, strokes: [...document.strokes, s] }); strokeRef.current = null; setStroke(null); }
  async function save() {
    if (saving || !canEdit || pendingPin || stroke) return;
    if (!validateAnnotations(document)) { setError('コメントと線の内容を確認してください。'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await annotationRequest<SavedAnnotation>(projectId, { action: 'save', batchId, fileId: file.id, version, document });
      setVersion(result.version); setBaseline(JSON.stringify(document)); setNotice('下書きを保存しました。案件画面の「修正を依頼する」で送信してください。'); onSaved?.();
    } catch (e) { setError(e instanceof Error ? e.message : '保存に失敗しました。'); }
    finally { setSaving(false); }
  }
  return <div data-csworks-annotation-dialog role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}
    onKeyDown={e => {
      if (e.key === 'Tab') {
        const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]');
        if (!nodes?.length) return; const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && (window.document.activeElement === first || window.document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && window.document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }} style={{ position: 'fixed', inset: 0, zIndex: 10010, background: '#f1f5f9', color: '#0f172a', display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
    <header style={{ padding: '10px 16px', background: '#fff', borderBottom: '1px solid #cbd5e1' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <strong id={titleId} style={{ flex: '1 1 200px', overflowWrap: 'anywhere' }}>{file.file_name} — {canEdit ? '修正指示モード' : '修正指示（閲覧専用）'}</strong>
        <button type="button" style={buttonStyle} onClick={close} disabled={saving}>閉じる</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
        {canEdit && <>
          {(['pin', 'pen', 'select'] as const).map(t => <button key={t} type="button" style={{ ...buttonStyle, background: tool === t ? '#dbeafe' : '#fff' }} aria-pressed={tool === t} disabled={saving || !!stroke || !!pendingPin} onClick={() => { setTool(t); setSelected(null); }}>{t === 'pin' ? 'コメントピン' : t === 'pen' ? '赤ペン' : '線を選択'}</button>)}
          <button type="button" style={buttonStyle} disabled={saving || !!stroke || !!pendingPin || !undo.current.length} onClick={() => { setDocument(undo.current.pop()!); setSelected(null); }}>取り消し</button>
          <button type="button" style={buttonStyle} disabled={saving || !selected} onClick={() => { change({ ...document, strokes: document.strokes.filter(s => s.id !== selected) }); setSelected(null); }}>選択した線を削除</button>
          <button type="button" style={buttonStyle} disabled={saving || !document.strokes.length || !!stroke || !!pendingPin} onClick={() => { if (window.confirm('赤線をすべて削除しますか？')) change({ ...document, strokes: [] }); }}>赤線を全削除</button>
          <button type="button" style={{ ...buttonStyle, background: '#1d4ed8', color: '#fff' }} disabled={saving || !dirty || !!pendingPin || !!stroke} onClick={save}>{saving ? '保存中…' : '下書き保存'}</button>
          <span aria-live="polite">{dirty || pendingPin || stroke ? '未保存' : '保存済み'}</span>
        </>}
        <button type="button" style={buttonStyle} disabled={zoom <= .25} aria-label="画像を縮小" onClick={() => setZoom(z => Math.max(.25, z - .25))}>−</button>
        <output>{Math.round(zoom * 100)}%</output>
        <button type="button" style={buttonStyle} disabled={zoom >= 4} aria-label="画像を拡大" onClick={() => setZoom(z => Math.min(4, z + .25))}>＋</button>
      </div>
      {canEdit && <p style={{ margin: '8px 0 0', fontSize: 13 }}>ピンは画像をクリック、赤線はドラッグして記入します。保存後、既存の修正依頼ボタンから送信します。</p>}
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}{notice && <p role="status" style={{ color: '#166534' }}>{notice}</p>}
    </header>
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexWrap: 'wrap', overflow: 'auto' }}>
      <div style={{ flex: '1 1 500px', minWidth: 0, overflow: 'auto', background: '#cbd5e1', padding: 16 }}>
        <div data-testid="annotation-image" style={{ position: 'relative', width: size.width ? size.width * zoom : '100%', height: size.height ? size.height * zoom : 'auto', background: '#fff', lineHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={file.file_name} draggable={false} style={{ display: 'block', width: '100%', height: size.height ? '100%' : 'auto', maxWidth: 'none' }}
            onLoad={e => { const img = e.currentTarget; const available = Math.max(200, (img.parentElement?.parentElement?.clientWidth ?? 932) - 32); const fit = Math.min(1, Math.min(900, available) / img.naturalWidth, 650 / img.naturalHeight); setSize({ width: img.naturalWidth * fit, height: img.naturalHeight * fit }); setReady(true); }}
            onError={() => { setReady(false); setError('画像を読み込めません。案件画面を再読み込みしてください。'); }} />
          {ready && <svg ref={svgRef} data-testid="annotation-overlay" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none"
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endStroke} onPointerCancel={() => { strokeRef.current = null; setStroke(null); }} onLostPointerCapture={endStroke}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: canEdit && tool !== 'select' ? 'none' : 'auto', cursor: canEdit ? tool === 'select' ? 'pointer' : 'crosshair' : 'default' }}>
            {[...document.strokes, ...(stroke ? [stroke] : [])].map(s => <polyline key={s.id} data-stroke-id={s.id} points={s.points.map(p => `${p.x * size.width},${p.y * size.height}`).join(' ')}
              fill="none" stroke={selected === s.id ? '#2563eb' : '#dc2626'} strokeWidth={selected === s.id ? 5 : 3} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
              onPointerDown={e => { if (canEdit && tool === 'select' && !saving) { e.stopPropagation(); setSelected(s.id); } }} />)}
            {document.pins.map(p => <g key={p.id} data-pin-number={p.number} transform={`translate(${p.x * size.width},${p.y * size.height})`}>
              <circle r={12 / zoom} fill="#dc2626" stroke="#fff" strokeWidth={2 / zoom} /><text textAnchor="middle" dominantBaseline="central" fontSize={13 / zoom} fill="white" fontFamily="sans-serif">{p.number}</text>
            </g>)}
            {pendingPin && <circle cx={pendingPin.x * size.width} cy={pendingPin.y * size.height} r={10 / zoom} fill="#2563eb" />}
          </svg>}
        </div>
      </div>
      <aside style={{ flex: '0 1 290px', minWidth: 240, padding: 16, background: '#fff', overflow: 'auto', lineHeight: 1.6 }}>
        <strong>コメント一覧</strong>
        {pendingPin && <div style={{ marginTop: 12 }}>
          <label>新しいピンのコメント<textarea aria-label="新しいピンのコメント" value={comment} maxLength={2000} rows={3} onChange={e => setComment(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} /></label>
          <button type="button" style={buttonStyle} disabled={!comment.trim()} onClick={() => { change({ ...document, pins: [...document.pins, { ...pendingPin, id: newId(), number: Math.max(0, ...document.pins.map(p => p.number)) + 1, comment: comment.trim() }] }); setPendingPin(null); }}>ピンを追加</button>
          <button type="button" style={buttonStyle} onClick={() => setPendingPin(null)}>キャンセル</button>
        </div>}
        {!document.pins.length && !pendingPin && <p>コメントはありません。</p>}
        {document.pins.map(p => <div key={p.id} style={{ marginTop: 12, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
          <label><strong>ピン {p.number}</strong>{canEdit ? <textarea aria-label={`ピン ${p.number} のコメント`} value={p.comment} maxLength={2000} rows={3} disabled={saving} onChange={e => change({ ...document, pins: document.pins.map(x => x.id === p.id ? { ...x, comment: e.target.value } : x) })} style={{ width: '100%', boxSizing: 'border-box' }} /> : <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.comment}</p>}</label>
          {canEdit && <button type="button" style={buttonStyle} disabled={saving} onClick={() => change({ ...document, pins: document.pins.filter(x => x.id !== p.id) })}>ピン {p.number} を削除</button>}
        </div>)}
      </aside>
    </div>
  </div>;
}
