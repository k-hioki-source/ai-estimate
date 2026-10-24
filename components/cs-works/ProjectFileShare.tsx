'use client';
import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

type Props = { fileId: string; projectId: string; fileType: string };
export default function ProjectFileShare({ fileId, projectId, fileType }: Props) {
  const [share, setShare] = useState<{ id: string; url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<{ id: string; expires_at: string }[]>([]);
  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/cs-works/file-shares?projectId=' + encodeURIComponent(projectId) + '&fileId=' + encodeURIComponent(fileId), { headers: { Authorization: 'Bearer ' + token } });
      if (res.ok && active) { const json = await res.json(); setExisting(json.shares ?? []); }
    }
    void load();
    return () => { active = false; };
  }, [projectId, fileId]);
  const [message, setMessage] = useState('');
  if (!['review', 'revision', 'delivery'].includes(fileType)) return null;
  async function action(method: 'POST' | 'DELETE') {
    setBusy(true); setMessage('');
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-shares', {
        method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(method === 'POST' ? { fileId, projectId } : { shareId: share?.id, projectId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '操作に失敗しました。');
      if (method === 'POST') { setShare(result); setExisting(current => [{ id: result.id, expires_at: result.expiresAt }, ...current]); }
      else { setExisting(current => current.filter(item => item.id !== (share?.id ?? ''))); setShare(null); setMessage('共有リンクを無効化しました。'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作に失敗しました。'); }
    finally { setBusy(false); }
  }
  async function revokeExisting(id: string) {
    setBusy(true); setMessage('');
    try {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('ログインし直してください。');
      const res = await fetch('/api/cs-works/file-shares', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ shareId: id, projectId }) });
      if (!res.ok) { const result = await res.json(); throw new Error(result.error || '無効化できません。'); }
      setExisting(current => current.filter(item => item.id !== id));
      if (share?.id === id) setShare(null);
      setMessage('共有リンクを無効化しました。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '無効化できません。'); }
    finally { setBusy(false); }
  }
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, maxWidth: '100%' }}>
      {!share ? (
        <button type="button" disabled={busy} onClick={() => void action('POST')}
          style={{ display: 'inline-flex', flex: '0 0 auto', width: 'auto', whiteSpace: 'nowrap', padding: '6px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#1d4ed8', cursor: 'pointer' }}>
          {busy ? '作成中…' : '7日間の共有リンクを発行'}
        </button>
      ) : (
        <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
          <span style={{ fontSize: 12 }}>有効期限：{new Date(share.expiresAt).toLocaleString('ja-JP')}</span>
          <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void navigator.clipboard.writeText(share.url).then(() => setMessage('リンクをコピーしました。')).catch(() => setMessage('コピーできませんでした。'))}
              style={{ width: 'auto', padding: '6px 10px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>リンクをコピー</button>
            <button type="button" disabled={busy} onClick={() => void action('DELETE')}
              style={{ width: 'auto', padding: '6px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer' }}>共有を無効化</button>
          </span>
        </span>
      )}
      {existing.filter(item => item.id !== share?.id).map(item => (
        <span key={item.id} style={{ fontSize: 12, display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          発行済み（{new Date(item.expires_at).toLocaleDateString('ja-JP')}まで）
          <button type="button" disabled={busy} onClick={() => void revokeExisting(item.id)} style={{ width: 'auto', padding: '4px 8px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff', color: '#b91c1c', cursor: 'pointer' }}>無効化</button>
        </span>
      ))}
      {message && <span role="status" style={{ fontSize: 12 }}>{message}</span>}
    </span>
  );
}
