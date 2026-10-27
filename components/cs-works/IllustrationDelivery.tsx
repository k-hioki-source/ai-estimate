'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { deliveryReady, illustrationDeliveryEnabled, type DeliveryManifest, type DeliveryAsset } from '../../lib/cs-works/delivery';
import { buildDeliveryZip, deliveryRequest } from '../../lib/cs-works/delivery-client';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';
import ProjectFilePreview from './ProjectFilePreview';
import ProjectFileShare from './ProjectFileShare';
const button = { padding: '11px 16px', border: '1px solid #93b4fb', borderRadius: 9, background: '#fff', color: '#1e40af', fontWeight: 700, cursor: 'pointer' };
const primary = { ...button, background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8' };
export default function IllustrationDelivery({ projectId, status, isAdmin = false, delivering = false, onDeliver }: { projectId: string; status: string; isAdmin?: boolean; delivering?: boolean; onDeliver?: () => void }) {
 const [manifest, setManifest] = useState<DeliveryManifest | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState('');
 const [urls, setUrls] = useState<Record<string, string>>({});
 const [files, setFiles] = useState<Record<string, File[]>>({});
 const pending = useRef(new Map<File, { id: string; uploaded: boolean; target: string }>()), inputs = useRef<Record<string, HTMLInputElement | null>>({}), abort = useRef<AbortController | null>(null);
 const reload = useCallback(async () => { const m = await deliveryRequest<DeliveryManifest>(projectId); setManifest(m); return m; }, [projectId]);
 useEffect(() => { let active = true; setManifest(null); setError(''); setFiles({}); pending.current.clear(); if (illustrationDeliveryEnabled) deliveryRequest<DeliveryManifest>(projectId).then(m => { if (active) setManifest(m); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; abort.current?.abort(); }; }, [projectId, status]);
 useEffect(() => {
  if (!manifest?.assets.length) { setUrls({}); return; }
  let active = true;
  getSupabaseBrowserClient().storage.from('project-files').createSignedUrls(manifest.assets.map(a => a.file.storage_path), 600).then(r => { if (active && !r.error && r.data) setUrls(Object.fromEntries(r.data.filter(x => x.signedUrl).map(x => [x.path!, x.signedUrl!]))); }).catch(() => {});
  return () => { active = false; };
 }, [manifest]);
 if (!illustrationDeliveryEnabled) return <p>イラスト別の最終納品は準備中です。設定が完了するまで納品を確定できません。</p>;
 async function upload(target: string) {
  if (busy || !manifest || manifest.published) return;
  const chosen = files[target] || []; if (!chosen.length) return;
  if (chosen.some(f => f.size < 1 || f.size > 52428800 || f.name.length > 255 || /[\x00-\x1f\x7f]/.test(f.name))) { setError('各50MB以下のファイルを選択してください。'); return; }
  setBusy(target); setError(''); setNotice(''); let registered = 0;
  try {
   for (const file of chosen) {
    let p = pending.current.get(file); if (!p || p.target !== target) { p = { id: crypto.randomUUID(), uploaded: false, target }; pending.current.set(file, p); }
    const path = `${projectId}/delivery-final/${p.id}`, mime = file.type || 'application/octet-stream';
    if (!p.uploaded) { const r = await getSupabaseBrowserClient().storage.from('project-files').upload(path, file, { contentType: mime, upsert: false }); if (r.error) throw Error('アップロードできませんでした。同じ選択のまま再試行してください。'); p.uploaded = true; }
    await deliveryRequest(projectId, { action: 'attach', illustrationId: target === 'common' ? null : target, requestId: p.id, name: file.name, path, mime, size: file.size }); registered++;
   }
   setFiles(x => ({ ...x, [target]: [] })); chosen.forEach(f => pending.current.delete(f)); if (inputs.current[target]) inputs.current[target]!.value = '';
   setNotice('納品ファイルを登録しました。納品確定まではお客様に表示されません。');
  } catch (e) { setError((e as Error).message + (registered ? ' 登録済みのファイルは保持されています。残りを再試行できます。' : '')); }
  finally { try { await reload(); } catch { setError('一覧の更新に失敗しました。「納品一覧を再取得」を押してください。'); } setBusy(''); }
 }
 async function remove(asset: DeliveryAsset) {
  if (busy || !window.confirm('このファイルを納品一覧から外しますか？元ファイルは削除しません。')) return;
  setBusy(asset.file.id); setError(''); setNotice('');
  try { await deliveryRequest(projectId, { action: 'remove', fileId: asset.file.id }); await reload(); setNotice('納品一覧から外しました。'); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
 }
 async function download(asset: DeliveryAsset) {
  if (busy) return; setBusy(asset.file.id); setError('');
  try { const r = await getSupabaseBrowserClient().storage.from('project-files').createSignedUrl(asset.file.storage_path, 600, { download: asset.file.file_name }); if (r.error || !r.data) throw Error('ファイルを取得できません。'); const a = document.createElement('a'); a.href = r.data.signedUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.download = asset.file.file_name; a.click(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
 }
 async function downloadAll() {
  if (busy) return; setBusy('zip'); setError(''); setNotice(''); const controller = new AbortController(); abort.current = controller;
  try {
   const latest = await deliveryRequest<DeliveryManifest>(projectId); setManifest(latest);
   const result = await buildDeliveryZip(latest, controller.signal, (done, total) => setNotice(`ZIP作成中 ${done} / ${total}ファイル`));
   const url = URL.createObjectURL(result.blob), a = document.createElement('a'); a.href = url; a.download = result.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); setNotice('全ファイルを含むZIPを作成しました。ダウンロードをご確認ください。');
  } catch (e) { if (controller.signal.aborted) setNotice('一括ダウンロードを中止しました。'); else setError((e as Error).message); } finally { abort.current = null; setBusy(''); }
 }
 const editable = isAdmin && status === 'approved' && manifest && !manifest.published;
 function group(target: string, title: string) {
  const assets = manifest!.assets.filter(a => (a.illustration_id || 'common') === target);
  return <article key={target} style={{ minWidth: 0, border: `2px solid ${assets.length ? '#86cda0' : '#cbd5e1'}`, borderRadius: 12, padding: 16, background: '#fff' }}>
   <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}><strong style={{ fontSize: 17, overflowWrap: 'anywhere' }}>{title}</strong><span style={{ color: assets.length ? '#166534' : '#92400e', fontWeight: 700 }}>{assets.length ? `${assets.length}ファイル登録済み` : target === 'common' ? '任意' : '未登録'}</span></div>
   {assets.map(a => <div key={a.file.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', borderTop: '1px solid #e2e8f0', padding: '12px 0', overflowWrap: 'anywhere' }}><span style={{ minWidth: 0, flex: '1 1 180px' }}>{a.file.file_name} <small>（{(a.file.file_size / 1048576).toFixed(2)}MB）</small></span><span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', minWidth: 0 }}>{urls[a.file.storage_path] ? <ProjectFilePreview url={urls[a.file.storage_path]} fileName={a.file.file_name} mimeType={a.file.mime_type} projectId={projectId} fileId={a.file.id} fileType="delivery" /> : <button type="button" style={button} disabled={!!busy} onClick={() => download(a)}>ダウンロード</button>}{manifest!.published && <ProjectFileShare projectId={projectId} fileId={a.file.id} fileType="delivery" />}</span>{editable && <button style={button} disabled={!!busy} onClick={() => remove(a)}>一覧から外す</button>}</div>)}
   {editable && <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10 }}><input type="file" multiple aria-label={`${title}の納品ファイル`} style={{ maxWidth: '100%', minWidth: 0 }} ref={node => { inputs.current[target] = node; }} disabled={!!busy} onChange={e => setFiles(x => ({ ...x, [target]: Array.from(e.target.files || []) }))}/><button style={button} disabled={!!busy || !files[target]?.length} onClick={() => upload(target)}>{busy === target ? '登録中…' : '納品ファイルを登録'}</button></div>}
  </article>;
 }
 const done = manifest?.items.filter(i => manifest.assets.some(a => a.illustration_id === i.id)).length || 0;
 return <div style={{ border: '2px solid #86cda0', background: '#f0fdf4', borderRadius: 16, padding: 'clamp(12px, 3vw, 22px)' }}>
  <h4 style={{ margin: '0 0 10px', fontSize: 21, color: '#166534' }}>イラスト別の最終納品</h4>
  {!manifest ? <p role={error ? 'alert' : 'status'}>{error || '納品一覧を読み込み中…'}</p> : !isAdmin && !manifest.published ? <p>全点の最終ファイルを準備しています。納品後、個別・一括でダウンロードできます。</p> : <>
   {isAdmin && !manifest.published && !editable && <p>全イラストの承認後に、最終納品ファイルを登録できます。</p>}
   <p style={{ fontWeight: 700, lineHeight: 1.8 }}>{manifest.items.length ? <>全{manifest.items.length}点 ／ 納品ファイル登録済み{done}点 ／ 未登録{manifest.items.length - done}点</> : '従来方式の納品ファイル（案件共通）'}</p>
   {editable && <p>各イラストに最終データを登録してください（1ファイル50MBまで・複数選択可）。共通ZIPなどは「案件共通」に登録できます。全点にファイルがそろうと納品できます。</p>}
   {manifest.published && manifest.assets.length > 0 && <div style={{ margin: '16px 0' }}><button style={primary} disabled={!!busy} onClick={downloadAll}>納品ファイルを一括ダウンロード（ZIP）</button><p style={{ fontSize: 13, color: '#475569' }}>イラストごとのフォルダーにまとめます。合計200MBまで。作成中は画面を閉じないでください。</p></div>}
   <div style={{ display: 'grid', gap: 18 }}>{manifest.items.map(i => group(i.id, `${i.number} ${i.name}`))}{(editable || manifest.assets.some(a => !a.illustration_id)) && group('common', '案件共通')}</div>
   {editable && <button style={{ ...primary, marginTop: 20 }} disabled={!!busy || delivering || !deliveryReady(manifest)} onClick={onDeliver}>{delivering ? '納品処理中…' : '全点を確認してお客様へ納品する'}</button>}
   {editable && !deliveryReady(manifest) && <p style={{ color: '#92400e', fontWeight: 700 }}>未登録のイラストがあります。全点のファイルを登録してください。</p>}
  </>}
  {error && manifest && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}{notice && <p role="status" style={{ overflowWrap: 'anywhere' }}>{notice}</p>}
  {busy === 'zip' ? <button style={button} onClick={() => abort.current?.abort()}>ZIP作成を中止</button> : <button style={{ ...button, marginTop: 14 }} disabled={!!busy || delivering} onClick={() => { setError(''); reload().catch(e => setError(e.message)); }}>納品一覧を再取得</button>}
 </div>;
}
