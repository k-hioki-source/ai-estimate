'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { illustrationsEnabled, type Illustration, type IllustrationContext, type IllustrationProject, type IllustrationResult } from '../../lib/cs-works/illustrations';
import { illustrationRequest, notifyIllustrationResult } from '../../lib/cs-works/illustrations-client';
import { hasUnsavedAnnotations } from '../../lib/cs-works/image-annotations-client';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import type { ReviewFile } from '../../lib/cs-works/image-annotations';
import ProjectFilePreview from './ProjectFilePreview';
import ProjectFileShare from './ProjectFileShare';
const labels = { in_production: '制作中', customer_review: 'お客様確認中', revision: '修正対応中', approved: '承認済み' };
const stateStyles = {
 in_production: { color: '#334155', background: '#f1f5f9', border: '#94a3b8' },
 customer_review: { color: '#92400e', background: '#fffbeb', border: '#f59e0b' },
 revision: { color: '#9a3412', background: '#fff7ed', border: '#f97316' },
 approved: { color: '#166534', background: '#f0fdf4', border: '#22c55e' },
};
const current = (i: Illustration) => i.versions.find(v => v.id === i.current_version_id);
const reviewKey = (i: Illustration) => current(i)?.id || i.id;
function FileActions({ file, editable = false, url: initial }: { file: ReviewFile; editable?: boolean; url?: string }) {
 const [url, setUrl] = useState(initial), [error, setError] = useState(''), [busy, setBusy] = useState(false);
 useEffect(() => { setUrl(initial); }, [file.id, initial]);
 async function open() { setBusy(true); setError(''); try { const { data, error } = await getSupabaseBrowserClient().storage.from('project-files').createSignedUrl(file.storage_path, 3600); if (error || !data) throw Error('ファイルを表示できません。'); setUrl(data.signedUrl); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
 return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
  <span style={{ overflowWrap: 'anywhere' }}>{file.file_name}</span>
  {url ? <ProjectFilePreview url={url} fileName={file.file_name} mimeType={file.mime_type} projectId={file.project_id} fileId={file.id} fileType={file.file_type} annotationEditable={editable} /> : <button type="button" disabled={busy} onClick={open}>{busy ? '読み込み中…' : 'ファイルを表示'}</button>}
  <ProjectFileShare fileId={file.id} projectId={file.project_id} fileType={file.file_type} />
  {error && <span role="alert">{error}</span>}
 </div>;
}
export default function IllustrationWorkflow({ project, isAdmin = false, customerEditor = false, onProject }: { project: IllustrationProject; isAdmin?: boolean; customerEditor?: boolean; onProject: (p: any) => void }) {
 const [context, setContext] = useState<IllustrationContext | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState('');
 const [selected, setSelected] = useState<string[]>([]), [decisions, setDecisions] = useState<Record<string, 'approval' | 'revision_request'>>({}), [comments, setComments] = useState<Record<string, string>>({});
 const [files, setFiles] = useState<Record<string, File | null>>({}), [urls, setUrls] = useState<Record<string, string>>({});
 const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
 const pendingFiles = useRef<Record<string, { file: File; requestId: string; path: string; mime: string; uploaded: boolean }>>({});
 const request = useRef<{ signature: string; id: string } | null>(null);
 const reload = useCallback(async () => {
  const c = await illustrationRequest<IllustrationContext>(project.id); setContext(c); setSelected([]);
  const paths = c.items.flatMap(i => { const v = current(i); return v ? [v.file.storage_path] : []; });
  if (paths.length) { const r = await getSupabaseBrowserClient().storage.from('project-files').createSignedUrls(paths, 3600); if (!r.error && r.data) setUrls(Object.fromEntries(r.data.filter(x => x.signedUrl).map(x => [x.path!, x.signedUrl!]))); }
  return c;
 }, [project.id]);
 useEffect(() => { setContext(null); setError(''); setSelected([]); setComments({}); setDecisions({}); setUrls({}); setFiles({}); pendingFiles.current = {}; request.current = null;
  if (!illustrationsEnabled) return;
  let active = true;
  illustrationRequest<IllustrationContext>(project.id).then(c => { if (active) setContext(c); }).catch(e => { if (active) setError(e.message); });
  return () => { active = false; };
 }, [project.id]);
 if (!illustrationsEnabled) return <p role="alert">イラスト別の制作管理は現在利用できません。管理者へお問い合わせください。</p>;
 function operationId(body: Record<string, unknown>) { const signature = JSON.stringify(body); if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() }; return request.current!.id; }
 async function setup(action: 'prepare' | 'begin') {
  if (busy || !window.confirm(action === 'prepare' ? '発注済みの明細からイラスト別の制作管理を準備しますか？' : '制作を開始しますか？')) return;
  setBusy(action); setError(''); setNotice('');
  try { const p = await illustrationRequest<IllustrationProject>(project.id, { action }); onProject(p); await reload(); setNotice(action === 'prepare' ? '発注明細を制作一覧へ引き継ぎました。' : '制作を開始しました。'); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
 }
 async function upload(i: Illustration) {
  const file = files[i.id]; if (!file || busy) return; setError(''); setNotice('');
  const ext = file.name.split('.').pop()?.toLowerCase(); const mime = file.type || (ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'pdf' ? 'application/pdf' : '');
  if (!['image/png', 'image/jpeg', 'application/pdf'].includes(mime) || file.size < 1 || file.size > 52428800 || file.name.length > 255) { setError('PNG・JPEG・PDFの50MB以下のファイルを選択してください。'); return; }
  let pending = pendingFiles.current[i.id];
  if (!pending || pending.file !== file) { const id = crypto.randomUUID(); pending = { file, requestId: id, path: `${project.id}/illustrations/${i.id}/${id}.${mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'pdf'}`, mime, uploaded: false }; pendingFiles.current[i.id] = pending; }
  setBusy(i.id); let attached = false;
  try {
   if (!pending.uploaded) { const { error } = await getSupabaseBrowserClient().storage.from('project-files').upload(pending.path, file, { contentType: mime, upsert: false }); if (error) throw Error('アップロードできませんでした。接続とファイルを確認してください。'); pending.uploaded = true; }
   await illustrationRequest(project.id, { action: 'attach', illustrationId: i.id, requestId: pending.requestId, name: file.name, path: pending.path, mime, size: file.size });
   attached = true; delete pendingFiles.current[i.id]; if (fileInputs.current[i.id]) fileInputs.current[i.id]!.value = ''; setFiles(x => ({ ...x, [i.id]: null })); await reload(); setNotice(`${i.number} ${i.name} の新しい稿を登録しました。確認依頼する対象を選択してください。`);
  } catch (e) { setError(attached ? '稿の登録は完了しています。「最新の状態を取得」を押してください。' : (e as Error).message + (pending.uploaded ? ' ファイルの送信は完了しています。同じファイルのまま再試行できます。' : '')); } finally { setBusy(''); }
 }
 async function send(action: 'start' | 'submit', ids: string[]) {
  if (busy) return; setError(''); setNotice('');
  if (hasUnsavedAnnotations(project.id)) { setError('未保存の赤入れを保存してから送信してください。'); return; }
  const items = context?.items.filter(i => ids.includes(i.id)) || [];
  if (!items.length) { setError('対象のイラストを選択してください。'); return; }
  const body: Record<string, unknown> = action === 'start' ? { action, ids } : { action, items: items.map(i => ({ illustrationId: i.id, batchId: current(i)?.review_batch_id, action: decisions[reviewKey(i)] || 'approval', comment: comments[reviewKey(i)] || '' })) };
  if (action === 'submit' && items.some(i => decisions[reviewKey(i)] === 'revision_request' && !(comments[reviewKey(i)] || '').trim())) { setError('修正依頼するイラストにコメントを入力してください。'); return; }
  if (!window.confirm(action === 'start' ? `${items.length}点をお客様確認へ送りますか？` : `${items.length}点の確認結果を送信しますか？`)) return;
  setBusy(action); let committed = false;
  try {
   const r = await illustrationRequest<IllustrationResult>(project.id, { ...body, requestId: operationId(body) });
   committed = true; onProject(r.project); setSelected([]); request.current = null; const sent = await notifyIllustrationResult(project.id, r); await reload();
   setNotice((action === 'start' ? '確認依頼を送信しました。' : '確認結果を保存しました。') + (sent ? '' : 'メール通知のみ失敗しました。'));
  } catch (e) { setError(committed ? '送信内容は保存済みです。「最新の状態を取得」を押してください。' : (e as Error).message); } finally { setBusy(''); }
 }
 const editableProject = context && ['in_production', 'revision', 'customer_review'].includes(context.project.status);
 const selectable = (i: Illustration) => isAdmin ? !!editableProject && ['in_production', 'revision'].includes(i.state) && !!current(i) && !current(i)?.review_batch_id : customerEditor && i.state === 'customer_review' && current(i)?.review?.state === 'open';
 return <section aria-label="イラスト別の制作・確認" style={{ marginTop: 20, padding: 'clamp(12px, 3vw, 24px)', border: '2px solid #93b4fb', borderRadius: 18, background: '#f1f6ff', boxShadow: '0 4px 18px rgba(30, 64, 175, .08)' }}>
  <header style={{ marginBottom: 20 }}>
   <h4 style={{ margin: '0 0 8px', color: '#173d9a', fontSize: 22, fontWeight: 800, lineHeight: 1.5 }}>イラスト別の制作・確認</h4>
   <p style={{ margin: 0, color: '#334155', fontSize: 14, lineHeight: 1.8 }}>{isAdmin ? 'イラストごとに稿を登録し、お客様へ確認を依頼します。' : customerEditor ? '各イラストのファイルを確認し、承認または修正依頼を送信してください。' : 'イラストごとの制作状況と確認履歴を表示しています。'}</p>
  </header>
  {!context ? <p role={error ? 'alert' : 'status'}>{error || '制作一覧を読み込み中…'}</p> : !context.project.illustration_workflow ? <div>
    {isAdmin && ['ordered', 'in_production'].includes(context.project.status) ? <><p>発注が確定したイラスト明細を制作一覧へ引き継ぎます。</p><button type="button" disabled={!!busy} onClick={() => setup('prepare')}>発注明細から制作一覧を準備</button></> : <p>管理者が制作一覧を準備しています。</p>}
  </div> : <>
   <div aria-label="制作状況の集計" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 22 }}>
    {[{ label: '全イラスト', count: context.items.length, color: '#1e40af', background: '#e0ebff', border: '#93b4fb' }, ...(['approved', 'customer_review', 'revision', 'in_production'] as const).map(state => ({ label: labels[state], count: context.items.filter(i => i.state === state).length, ...stateStyles[state] }))].map(stat => <div key={stat.label} style={{ padding: '12px 14px', border: `1px solid ${stat.border}`, borderRadius: 12, background: stat.background, color: stat.color }}><span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{stat.label}</span><strong style={{ display: 'block', marginTop: 4, fontSize: 26, lineHeight: 1.3 }}>{stat.count}<span style={{ fontSize: 14, marginLeft: 4 }}>点</span></strong></div>)}
   </div>
   {isAdmin && context.project.status === 'ordered' && <button type="button" disabled={!!busy} onClick={() => setup('begin')}>制作開始</button>}
   <div style={{ display: 'grid', gap: 22 }}>
   {context.items.map(i => { const v = current(i); const canSelect = selectable(i); const canUpload = isAdmin && editableProject && ['in_production', 'revision'].includes(i.state); return <article key={i.id} style={{ minWidth: 0, padding: 'clamp(14px, 3vw, 22px)', border: `2px solid ${selected.includes(i.id) ? '#2563eb' : stateStyles[i.state].border}`, borderLeft: `6px solid ${stateStyles[i.state].border}`, borderRadius: 14, background: '#fff', boxShadow: '0 3px 10px rgba(15, 23, 42, .06)' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid #dbe3ec' }}>
     {canSelect && <input type="checkbox" style={{ width: 20, height: 20, accentColor: '#2563eb', flexShrink: 0 }} aria-label={`${i.number} ${i.name}を選択`} checked={selected.includes(i.id)} disabled={!!busy} onChange={e => setSelected(xs => e.target.checked ? [...xs, i.id] : xs.filter(id => id !== i.id))} />}
     <strong style={{ overflowWrap: 'anywhere', fontSize: 18, color: '#0f172a' }}>{i.number} {i.name}</strong><span style={{ background: stateStyles[i.state].background, color: stateStyles[i.state].color, border: `1px solid ${stateStyles[i.state].border}`, fontWeight: 700, fontSize: 13, padding: '5px 10px', borderRadius: 999 }}>{labels[i.state]}</span>{v && <span>第{v.revision}稿</span>}
    </div>
    {v ? <FileActions key={v.file_id} file={v.file} url={urls[v.file.storage_path]} editable={customerEditor && !isAdmin && i.state === 'customer_review' && v.review?.state === 'open'} /> : <p>確認用ファイルはまだありません。</p>}
    {canUpload && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}><input type="file" ref={node => { fileInputs.current[i.id] = node; }} aria-label={`${i.number} ${i.name}のファイル`} accept="image/png,image/jpeg,application/pdf" disabled={!!busy} onChange={e => setFiles(xs => ({ ...xs, [i.id]: e.target.files?.[0] || null }))} /><button type="button" disabled={!!busy || !files[i.id]} onClick={() => upload(i)}>{busy === i.id ? '処理中…' : '新しい稿をアップロード'}</button></div>}
    {canSelect && isAdmin && <button type="button" disabled={!!busy} onClick={() => send('start', [i.id])} style={{ marginTop: 12 }}>このイラストの確認を依頼</button>}
    {canSelect && !isAdmin && <fieldset disabled={!!busy} style={{ marginTop: 20, padding: 16, border: '2px solid #93b4fb', borderRadius: 12, minWidth: 0, background: '#f1f6ff' }}><legend style={{ padding: '0 6px', fontWeight: 800, color: '#173d9a' }}>このイラストの確認結果</legend>
     <label>結果 <select style={{ marginLeft: 8, padding: '8px 10px', maxWidth: '100%', border: '1px solid #94a3b8', borderRadius: 8, background: '#fff', color: '#0f172a', font: 'inherit' }} aria-label={`${i.number} ${i.name}の確認結果`} value={decisions[reviewKey(i)] || 'approval'} onChange={e => setDecisions(xs => ({ ...xs, [reviewKey(i)]: e.target.value as 'approval' | 'revision_request' }))}><option value="approval">承認する</option><option value="revision_request">修正を依頼する</option></select></label>
     <textarea aria-label={`${i.number} ${i.name}のコメント`} placeholder="修正依頼の場合はコメントを入力してください。赤入れは画像から下書き保存して送信します。" value={comments[reviewKey(i)] || ''} maxLength={2000} rows={3} onChange={e => setComments(xs => ({ ...xs, [reviewKey(i)]: e.target.value }))} style={{ display: 'block', width: '100%', boxSizing: 'border-box', margin: '12px 0', padding: 12, border: '1px solid #94a3b8', borderRadius: 8, background: '#fff', color: '#0f172a', font: 'inherit', lineHeight: 1.7 }} />
     <button type="button" style={{ background: '#1d4ed8', color: '#fff', border: 0, borderRadius: 10, padding: '12px 16px', fontWeight: 700, lineHeight: 1.6 }} onClick={() => send('submit', [i.id])}>このイラストの確認結果を送信</button>
    </fieldset>}
    {i.versions.length > 0 && <details style={{ marginTop: 12 }}><summary>稿・修正指示の履歴</summary>{i.versions.map(old => <div key={old.id} style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}><strong>第{old.revision}稿</strong><span> ／ {old.review?.state === 'approval' ? '承認済み' : old.review?.state === 'revision_request' ? '修正依頼済み' : old.review?.state === 'open' ? '確認中' : '確認依頼前'}</span><FileActions file={old.file} /></div>)}</details>}
   </article>; })}
   </div>
   {context.items.some(i => selectable(i)) && <button type="button" disabled={!!busy || !selected.length} onClick={() => send(isAdmin ? 'start' : 'submit', selected)} style={{ marginTop: 16, background: '#1d4ed8', color: '#fff', padding: '12px 18px', border: 0, borderRadius: 10 }}>{isAdmin ? '選択したイラストの確認を依頼' : '選択したイラストの確認結果を送信'}（{selected.length}点）</button>}
  </>}
  {error && context && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}{notice && <p role="status">{notice}</p>}
  <button type="button" disabled={!!busy} onClick={() => { setError(''); reload().catch(e => setError(e.message)); }} style={{ marginTop: 14 }}>最新の状態を取得</button>
 </section>;
}
