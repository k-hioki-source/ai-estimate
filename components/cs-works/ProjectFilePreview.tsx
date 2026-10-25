'use client';

import { useEffect, useState } from 'react';

type Props = {
  url?: string | null;
  fileName: string;
  mimeType?: string | null;
};

function previewKind(fileName: string, mimeType?: string | null): 'image' | 'pdf' | null {
  const type = (mimeType ?? '').trim().toLowerCase().split(';')[0];
  const name = fileName.trim().toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') || /(?:\.|[-_])(png|jpe?g|gif|webp)$/.test(name)) return 'image';
  return null;
}

export default function ProjectFilePreview({ url, fileName, mimeType }: Props) {
  const [open, setOpen] = useState(false);
  const kind = previewKind(fileName, mimeType);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!url) return null;
  if (!kind) return <span style={{ fontSize: 12, color: '#64748b' }}>プレビュー非対応（ファイルを開く・ダウンロードをご利用ください）</span>;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', flex: '0 0 auto', width: 'auto', alignItems: 'center', justifyContent: 'center', marginRight: 10, padding: '6px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#1e40af', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
      >
        プレビュー
      </button>
      {open && (
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,.82)', display: 'flex', flexDirection: 'column', padding: 16 }}
        >
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'flex-end', gap: 12, color: '#fff', paddingBottom: 12, width: '100%' }}>
            <strong style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</strong>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#bfdbfe', flex: '0 0 auto', width: 'auto', whiteSpace: 'nowrap', display: 'inline-flex' }}>別タブで開く</a>
            <button type="button" onClick={() => setOpen(false)} aria-label="プレビューを閉じる" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', width: 'auto', minWidth: 'unset', whiteSpace: 'nowrap', border: 0, borderRadius: 6, padding: '8px 12px', background: '#fff', cursor: 'pointer' }}>閉じる ×</button>
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={fileName} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', background: '#fff' }} />
            ) : (
              <iframe src={url} title={fileName} style={{ width: '100%', height: '100%', border: 0, borderRadius: 8, background: '#fff' }} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
