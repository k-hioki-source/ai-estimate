import type { ReviewFile } from './image-annotations';
export const illustrationDeliveryEnabled = process.env.NEXT_PUBLIC_CSWORKS_ILLUSTRATION_DELIVERY === 'true';
export type DeliveryAsset = { illustration_id: string | null; file: ReviewFile & { file_size: number } };
export type DeliveryManifest = { project: { id: string; project_code: string; status: string }; published: boolean; items: { id: string; number: string; name: string; state: string }[]; assets: DeliveryAsset[] };
export function deliveryReady(m: DeliveryManifest) { return m.items.length > 0 && m.items.every(i => i.state === 'approved' && m.assets.some(a => a.illustration_id === i.id)); }
export function safeZipName(value: string) {
 let name = value.normalize('NFC').replace(/[\\/<>:"|?*\u0000-\u001f\u007f]/g, '_').replace(/^[. ]+|[. ]+$/g, '');
 if (!name) name = 'file';
 if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
 const bytes = (s: string) => new TextEncoder().encode(s).length;
 if (bytes(name) > 180) {
  const ext = name.match(/\.[a-z0-9]{1,12}$/i)?.[0] || ''; const stem = ext ? name.slice(0, -ext.length) : name;
  let short = ''; for (const char of stem) { if (bytes(short + char + ext) > 180) break; short += char; }
  name = short + ext;
 }
 return name;
}
export function deliveryArchiveEntries(m: DeliveryManifest) {
 const used = new Set<string>();
 return m.assets.map(a => {
  const item = m.items.find(i => i.id === a.illustration_id);
  const folder = item ? `${String(m.items.indexOf(item) + 1).padStart(3, '0')}_${safeZipName(item.number + ' ' + item.name)}` : '案件共通';
  const original = safeZipName(a.file.file_name); let name = folder + '/' + original, n = 1;
  while (used.has(name.toLowerCase())) { const dot = original.lastIndexOf('.'); const stem = dot > 0 ? original.slice(0, dot) : original; const ext = dot > 0 ? original.slice(dot) : ''; name = `${folder}/${stem} (${++n})${ext}`; }
  used.add(name.toLowerCase()); return { asset: a, name };
 });
}
