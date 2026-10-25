'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

const FILE_ID = '2b3abd29-fd48-416c-8a9d-64882e4798d4';
const FILE_NAME = 'csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
type StateCheck = { state: string; jobStatus: string | null; storagePresent: boolean; contentMatches: boolean; requiresManualReview: boolean; checks: Record<string, boolean>; error?: string };
type Audit = { ok?: boolean; readOnly?: boolean; readyForManualReview?: boolean; readyForManualFinalization?: boolean; checks?: Record<string, boolean>; error?: string };
export default function RecoveryFixtureTestPanel() {
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [stateCheck, setStateCheck] = useState<StateCheck | null>(null);
  const [phase, setPhase] = useState<'before' | 'after'>('before');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const passed = !!audit && Object.values(audit.checks ?? {}).length > 0 &&
    Object.values(audit.checks ?? {}).every(Boolean);
  async function inspectState() {
    setBusy(true); setStateCheck(null); setError('');
    try {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      const access = data.session?.access_token;
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/recovery-stage-state', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const result = (await response.json()) as StateCheck;
      if (!response.ok) throw new Error(result.error ?? '状態照合に失敗しました。');
      setStateCheck(result);
    } catch (e) { setError(e instanceof Error ? e.message : '状態照合に失敗しました。'); }
    finally { setBusy(false); }
  }
  async function check(next: 'before' | 'after') {
    setBusy(true); setAudit(null); setError(''); setPhase(next); setConfirmText('');
    try {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      const access = data.session?.access_token;
      if (!access) throw new Error('ログインし直してください。');
      const url = next === 'before'
        ? '/api/cs-works/file-retention/recovery-stage-cleanup'
        : '/api/cs-works/file-retention/recovery-stage-finalize';
      const response = await fetch(url, {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const result = (await response.json()) as Audit;
      if (!response.ok) throw new Error(result.error ?? '照合に失敗しました。');
      setAudit(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '照合に失敗しました。');
    } finally { setBusy(false); }
  }
  return <section style={{ marginTop: 16, padding: 16, border: '1px solid #94a3b8', borderRadius: 10 }}>
    <strong>復旧テスト専用・段階的削除確認</strong>
    <p>対象は固定されたテストファイル1件のみ。現在は照合専用で、削除ボタンは有効化していません。</p>
    <p style={{ overflowWrap: 'anywhere' }}>対象：{FILE_NAME}<br />ID：{FILE_ID}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" disabled={busy} onClick={() => void check('before')}>
        {busy && phase === 'before' ? '照合中…' : '① Storage削除前の再照合（変更なし）'}
      </button>
      <button type="button" disabled={busy} onClick={() => void check('after')}>
        {busy && phase === 'after' ? '照合中…' : '② Storage削除後の復旧照合（変更なし）'}
      </button>
    </div>
    <button type="button" disabled={busy} onClick={() => void inspectState()}>③ 中断・復旧状態を診断（変更なし）</button>
    {stateCheck && <div role="status" style={{ marginTop: 12 }}>
      <strong>状態：{stateCheck.state === 'before_deletion' ? '削除前・正常' : stateCheck.state === 'storage_removed' ? 'Storage削除済み・最終整理待ち' : stateCheck.state === 'interrupted_after_storage' ? '中断検出・手動復旧が必要' : '要確認・操作停止'}</strong>
      <p>ジョブ：{stateCheck.jobStatus ?? 'なし'} ／ Storage：{stateCheck.storagePresent ? '存在' : '不存在'} ／ 手動確認：{stateCheck.requiresManualReview ? '必要' : '通常状態'}</p>
      <p>この診断ではファイルやジョブを変更しません。</p>
    </div>}
    {error && <p role="alert">{error}</p>}
    {audit && <div role="status" style={{ marginTop: 12 }}>
      <strong>{passed ? '照合一致（削除許可ではありません）' : '不一致：操作を中止してください'}</strong>
      <p>照合段階：{phase === 'before' ? 'Storage削除前' : 'Storage削除後'}</p>
      <ul>{Object.entries(audit.checks ?? {}).map(([key, value]) =>
        <li key={key}>{key}：{value ? 'OK' : '要確認'}</li>)}</ul>
    </div>}
    <label style={{ display: 'block', marginTop: 12 }}>
      確認用入力（実行機能には接続していません）
      <input style={{ display: 'block', maxWidth: '100%', width: 330, padding: 8, marginTop: 4 }}
        value={confirmText} onChange={e => setConfirmText(e.target.value)}
        placeholder="テストデータ1件のみ" />
    </label>
    <p>{confirmText === 'テストデータ1件のみ' && passed
      ? '確認入力と照合は一致しています。実削除はまだ無効です。'
      : '実行前の確認用UIです。実削除はできません。'}</p>
    <button type="button" disabled>Storage削除を実行（未有効化）</button>
    <button type="button" disabled style={{ marginLeft: 8 }}>DB・ジョブ最終整理（未有効化）</button>
    <p>※本番ファイルの削除機能やVercelの実行ロックは変更しません。</p>
  </section>;
}
