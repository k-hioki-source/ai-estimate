'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

const FILE_ID = '2b3abd29-fd48-416c-8a9d-64882e4798d4';
const FILE_NAME = 'csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
type StateCheck = { state: string; jobStatus: string | null; storagePresent: boolean; contentMatches: boolean; requiresManualReview: boolean; checks: Record<string, boolean>; error?: string };
type ExecutionStatus = { ok: boolean; readOnly: boolean; storageExecutionEnabled: boolean; finalizationEnabled: boolean; error?: string };
type Audit = { ok?: boolean; readOnly?: boolean; readyForManualReview?: boolean; readyForManualFinalization?: boolean; checks?: Record<string, boolean>; error?: string };
export default function RecoveryFixtureTestPanel() {
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [stateCheck, setStateCheck] = useState<StateCheck | null>(null);
  const [phase, setPhase] = useState<'before' | 'after'>('before');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [simulation, setSimulation] = useState('');
  const [executionResult, setExecutionResult] = useState('');
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus | null>(null);
  const passed = !!audit && Object.values(audit.checks ?? {}).length > 0 &&
    Object.values(audit.checks ?? {}).every(Boolean);
  const readyForStorage = phase === 'before' && passed && audit?.readyForManualReview === true &&
    stateCheck?.state === 'before_deletion' && confirmText === 'テストデータ1件のみ';
  const readyForFinalize = phase === 'after' && passed && audit?.readyForManualFinalization === true &&
    stateCheck?.state === 'storage_removed' && confirmText === 'テストデータ1件のみ';
  async function inspectExecutionLock() {
    setBusy(true); setExecutionStatus(null); setError('');
    try {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      const access = data.session?.access_token;
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/recovery-stage-execution-status', {
        headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const result = (await response.json()) as ExecutionStatus;
      if (!response.ok) throw new Error(result.error ?? '実行ロックを確認できません。');
      setExecutionStatus(result);
    } catch (e) { setError(e instanceof Error ? e.message : '実行ロックを確認できません。'); }
    finally { setBusy(false); }
  }
  const storageGateChecks = {
    audit: phase === 'before' && passed && audit?.readyForManualReview === true,
    recoveryState: stateCheck?.state === 'before_deletion',
    confirmation: confirmText === 'テストデータ1件のみ',
    lockChecked: executionStatus?.ok === true && executionStatus.readOnly === true,
    executionLocked: executionStatus?.storageExecutionEnabled === false,
  };
  const storageGatePassed = Object.values(storageGateChecks).every(Boolean);
  function simulate(action: 'storage' | 'finalize') {
    const allowed = action === 'storage' ? readyForStorage : readyForFinalize;
    if (!allowed) { setSimulation('安全条件が揃っていません。変更していません。'); return; }
    const label = action === 'storage' ? 'Storage削除' : 'DB・ジョブ最終整理';
    if (!window.confirm('【模擬確認】' + label + ' の確認画面です。実際の削除は行いません。')) return;
    setSimulation(label + ' の確認手順を検証しました。APIは呼び出していません。');
  }
  async function executeFixtureStorageDeletion() {
    if (!readyForStorage || !storageGateChecks.lockChecked || !executionStatus?.storageExecutionEnabled) {
      setError('実行前条件が揃っていません。再照合してください。');
      return;
    }
    if (!window.confirm('固定テストファイル1件のStorageを実際に削除します。続行しますか？')) return;
    setBusy(true); setError(''); setExecutionResult('');
    try {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/recovery-stage-execute', {
        method: 'POST', cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: FILE_ID, confirmation: 'DELETE_EXACT_RECOVERY_TEST_FIXTURE' }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; jobStatus?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? '削除結果を確認できません。再実行せず状態を診断してください。');
      setExecutionResult('テスト用Storage削除APIが完了しました。ジョブ：' + result.jobStatus + '。次に復旧状態を診断してください。');
      setAudit(null); setStateCheck(null); setExecutionStatus(null); setConfirmText('');
    } catch (e) {
      setError((e instanceof Error ? e.message : '実行エラー') + ' 再実行せず、状態診断を行ってください。');
      setAudit(null); setStateCheck(null); setExecutionStatus(null);
    } finally { setBusy(false); }
  }
  async function inspectState() {
    setBusy(true); setStateCheck(null); setError(''); setSimulation('');
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
    setBusy(true); setAudit(null); setStateCheck(null); setError(''); setPhase(next); setConfirmText(''); setSimulation('');
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
    <button type="button" disabled={busy} onClick={() => void inspectExecutionLock()}>④ 実行ロックの状態を確認（変更なし）</button>
    {executionStatus && <div role="status" style={{ marginTop: 12, padding: 12, border: '1px solid #94a3b8', borderRadius: 8 }}>
      <strong>実行ロック確認結果（読み取り専用）</strong>
      <p>Storage削除：{executionStatus.storageExecutionEnabled ? '有効（要注意）' : '無効・ロック中'} ／ DB最終整理：{executionStatus.finalizationEnabled ? '有効（要注意）' : '無効・ロック中'}</p>
      <p>※ロックが有効でも、ここから実削除APIを呼び出すことはありません。</p>
    </div>}
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
    <p>Storage削除の事前条件：{readyForStorage ? '一致' : '未完了'} ／ DB最終整理の事前条件：{readyForFinalize ? '一致' : '未完了'}</p>
    <button type="button" disabled={busy || !readyForStorage} onClick={() => simulate('storage')}>Storage削除の確認を模擬（実削除なし）</button>
    <button type="button" disabled={busy || !readyForFinalize} style={{ marginLeft: 8 }} onClick={() => simulate('finalize')}>DB・ジョブ整理の確認を模擬（実削除なし）</button>
    {simulation && <p role="status">{simulation}</p>}
    <p>※模擬ボタンは削除APIを呼び出しません。実行ロックも解除しません。</p>
    <div style={{ marginTop: 12, padding: 12, border: '1px solid #cbd5e1', borderRadius: 8 }}>
      <strong>Storage実行前ゲート検証（読み取り専用）</strong>
      <p>事前照合：{storageGateChecks.audit ? 'OK' : '未完了'} ／ 状態診断：{storageGateChecks.recoveryState ? 'OK' : '未完了'} ／ 確認入力：{storageGateChecks.confirmation ? 'OK' : '未完了'}</p>
      <p>実行ロック照合：{storageGateChecks.lockChecked ? 'OK' : '未完了'} ／ ロック保持：{storageGateChecks.executionLocked ? 'OK' : '未確認または解除中'}</p>
      <strong>{storageGatePassed ? '安全なロック状態で確認手順が完了しました（削除不可）' : '安全確認が未完了です（削除不可）'}</strong>
      <p>この表示は条件判定だけを行い、削除APIには接続していません。</p>
    </div>

    <div style={{ marginTop: 12, padding: 12, border: '1px solid #dc2626', borderRadius: 8 }}>
      <strong>Preview専用・固定テストファイル1件の実削除</strong>
      <p>Storageのみ削除します。DBのファイル記録とジョブは残ります。実行後は再実行せず状態を診断してください。</p>
      <button type="button" disabled={busy || !readyForStorage || !storageGateChecks.lockChecked || executionStatus?.storageExecutionEnabled !== true}
        onClick={() => void executeFixtureStorageDeletion()}>固定テストファイルのStorage削除を実行</button>
      {executionResult && <p role="status">{executionResult}</p>}
    </div>
    <p>※本番ファイルの削除機能やVercelの実行ロックは変更しません。</p>
  </section>;
}
