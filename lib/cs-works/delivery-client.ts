import { getSupabaseBrowserClient } from '../supabase/client';
import { deliveryArchiveEntries, safeZipName, type DeliveryManifest } from './delivery';
export async function deliveryRequest<T>(projectId: string, body?: Record<string, unknown>): Promise<T> {
 const { data } = await getSupabaseBrowserClient().auth.getSession(); if (!data.session) throw Error('ログインが必要です。');
 const r = await fetch('/api/cs-works/delivery' + (body ? '' : '?projectId=' + encodeURIComponent(projectId)), { method: body ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: 'Bearer ' + data.session.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify({ ...body, projectId }) } : {}) });
 const result = await r.json().catch(() => ({})); if (!r.ok) throw Error(result.error || '納品一覧を取得できません。'); return result;
}
export const MAX_ZIP_BYTES = 200 * 1024 * 1024;
// The ZIP is assembled locally; final file bytes never pass through the Next.js API.
export async function buildDeliveryZip(m: DeliveryManifest, signal: AbortSignal, progress: (done: number, total: number) => void) {
 if (!m.published || !m.assets.length || m.assets.length > 1000) throw Error('納品済みのファイルがありません。');
 if (m.assets.reduce((n, a) => n + Number(a.file.file_size), 0) > MAX_ZIP_BYTES) throw Error('一括ダウンロードは合計200MBまでです。ファイルを個別にダウンロードしてください。');
 const { Zip, ZipPassThrough } = await import('fflate'); const chunks: BlobPart[] = []; let zipError: Error | null = null; let finished = false;
 const zip = new Zip((error, data, final) => { if (error) zipError = error; else { chunks.push(data.slice().buffer); finished = final; } });
 let totalBytes = 0, count = 0;
 try {
  for (const { asset, name } of deliveryArchiveEntries(m)) {
   signal.throwIfAborted();
   const signed = await getSupabaseBrowserClient().storage.from('project-files').createSignedUrl(asset.file.storage_path, 600, { download: asset.file.file_name });
   if (signed.error || !signed.data) throw Error('ダウンロード権限を確認できません。画面を更新して再試行してください。');
   const response = await fetch(signed.data.signedUrl, { signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
   if (!response.ok || !response.body) throw Error(`${asset.file.file_name} を取得できませんでした。一括ダウンロードをやり直してください。`);
   const input = new ZipPassThrough(name); zip.add(input); const reader = response.body.getReader(); let bytes = 0;
   try { while (true) { const { value, done } = await reader.read(); if (done) break; bytes += value.byteLength; totalBytes += value.byteLength; if (totalBytes > MAX_ZIP_BYTES || bytes > 52428800) throw Error('ダウンロードの容量上限を超えました。個別にダウンロードしてください。'); input.push(value); if (zipError) throw zipError; } } finally { await reader.cancel().catch(() => {}); }
   if (bytes !== Number(asset.file.file_size)) throw Error(`${asset.file.file_name} のサイズが一致しません。管理者へお問い合わせください。`);
   input.push(new Uint8Array(0), true); progress(++count, m.assets.length);
  }
  signal.throwIfAborted(); zip.end(); if (zipError) throw zipError; if (!finished) throw Error('ZIPを作成できませんでした。');
  return { blob: new Blob(chunks, { type: 'application/zip' }), name: safeZipName(m.project.project_code) + '_納品ファイル.zip' };
 } catch (e) { zip.terminate(); throw e; }
}
