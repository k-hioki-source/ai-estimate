'use client';
import { useCallback, useEffect, useState } from 'react';
import { annotationsEnabled, annotationImage, type ReviewContext, type ReviewFile, type ReviewBatch } from '../../lib/cs-works/image-annotations';
import { annotationRequest } from '../../lib/cs-works/image-annotations-client';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import ProjectImageAnnotations from './ProjectImageAnnotations';

export function useReviewContext(projectId: string, authenticated: boolean) {
  const [context, setContext] = useState<ReviewContext | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!annotationsEnabled || !authenticated || !projectId) return null;
    try { const data = await annotationRequest<ReviewContext>(projectId); setContext(data); setError(''); return data; }
    catch (e) { setError(e instanceof Error ? e.message : '修正指示を取得できません。'); return null; }
  }, [projectId, authenticated]);
  useEffect(() => { setContext(null); void reload(); }, [reload]);
  return { context, error, reload };
}

type ButtonProps = { projectId: string; fileId: string; fileName: string; mimeType?: string | null; url?: string | null; editable?: boolean; batchId?: string; storagePath?: string };
export function ReviewAnnotationButton({ projectId, fileId, fileName, mimeType, url, editable = false, batchId, storagePath }: ButtonProps) {
  const [view, setView] = useState<{ context: ReviewContext; batch: ReviewBatch; url: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  if (!annotationsEnabled || !annotationImage(fileName, mimeType)) return null;
  async function open() {
    if (loading) return; setLoading(true); setError('');
    try {
      const context = await annotationRequest<ReviewContext>(projectId);
      const linked = context.members.filter(x => x.file_id === fileId).map(x => x.batch_id);
      const batch = batchId ? context.batches.find(b => b.id === batchId && linked.includes(b.id)) : context.batches.find(b => linked.includes(b.id));
      if (!batch) throw new Error('このファイルは確認対象に設定されていません。');
      // Obtain a fresh signed URL for the original image. No canvas conversion or overwrite.
      const path = storagePath ?? context.files.find(f => f.id === fileId)?.storage_path;
      let imageUrl = url;
      if (path) {
        const { data, error } = await getSupabaseBrowserClient().storage.from('project-files').createSignedUrl(path, 3600);
        if (error || !data) throw new Error('画像を開けません。再読み込みしてください。'); imageUrl = data.signedUrl;
      }
      if (!imageUrl) throw new Error('画像を開けません。');
      setView({ context, batch, url: imageUrl });
    } catch (e) { setError(e instanceof Error ? e.message : '修正指示を開けません。'); }
    finally { setLoading(false); }
  }
  return <>
    <button type="button" onClick={open} disabled={loading} style={{ display: 'inline-flex', width: 'auto', flex: '0 0 auto', padding: '6px 12px', marginRight: 10, background: '#fff7ed', color: '#9a3412', border: '1px solid #fdba74', borderRadius: 7, whiteSpace: 'nowrap', cursor: 'pointer' }}>{loading ? '読み込み中…' : editable ? '修正指示モード' : '画像の修正指示を見る'}</button>
    {error && <span role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{error}</span>}
    {view && <ProjectImageAnnotations projectId={projectId} batchId={view.batch.id} file={{ id: fileId, file_name: fileName }} url={view.url}
      editable={editable && view.batch.state === 'open'} saved={view.context.annotations.find(a => a.batch_id === view.batch.id && a.file_id === fileId)} onClose={() => setView(null)} />}
  </>;
}
export function ReviewHistoryAnnotations({ context, projectId, messageId }: { context: ReviewContext | null; projectId: string; messageId: string }) {
  if (!annotationsEnabled || !context) return null;
  const batches = context.batches.filter(b => b.message_id === messageId); if (!batches.length) return null;
  return <>{batches.map(batch => {
    const annotations = context.annotations.filter(a => a.batch_id === batch.id && (a.document.pins.length || a.document.strokes.length));
    return <div key={batch.id} style={{ marginTop: 8 }}>
      <small>{batch.illustration_label ? `${batch.illustration_label} 第${batch.illustration_revision}稿` : `第${batch.round_number}回`}の確認結果（保存済み・閲覧専用）</small>
      {annotations.map(a => { const f = context.files.find(f => f.id === a.file_id); return f ? <div key={f.id} style={{ marginTop: 6 }}><span>{f.file_name}：{a.document.pins.length}件のコメント・{a.document.strokes.length}本の赤線 </span><ReviewAnnotationButton projectId={projectId} batchId={batch.id} fileId={f.id} fileName={f.file_name} mimeType={f.mime_type} storagePath={f.storage_path} /></div> : <p key={a.file_id}>対象画像を取得できません。</p>; })}
      {!annotations.length && <span> ／ 画像の修正指示なし</span>}
    </div>;
  })}</>;
}
export function ReviewTargetPicker({ files, selected, onChange }: { files: Pick<ReviewFile, 'id' | 'file_name'>[]; selected: string[]; onChange: (ids: string[]) => void }) {
  if (!annotationsEnabled) return null;
  return <fieldset style={{ margin: '12px 0', border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}><legend>今回お客様に確認してもらうファイル</legend>
    <p style={{ marginTop: 0 }}>今回の稿だけを選択してください。過去の修正指示は別の確認履歴に保持されます。</p>
    {!files.length && <p>先に確認用ファイルをアップロードしてください。</p>}
    {files.map(f => <label key={f.id} style={{ display: 'block', marginBottom: 6 }}><input type="checkbox" checked={selected.includes(f.id)} onChange={e => onChange(e.target.checked ? [...selected, f.id] : selected.filter(id => id !== f.id))} /> {f.file_name}</label>)}
  </fieldset>;
}
