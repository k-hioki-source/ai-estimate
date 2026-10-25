'use client';

import { useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabase/client';

const FILE_ID = '2b3abd29-fd48-416c-8a9d-64882e4798d4';
const FILE_NAME = 'csw_recovery_stage_edb579f7-fc50-4406-a161-d5b810e1ffc4.txt';
const FINALIZE_ATTEMPT_KEY = 'csworks:fixture-finalize:' + FILE_ID;
const CONFIRMATION = 'テストデータ1件のみ';
type FixtureResponse = { ok?: boolean; readOnly?: boolean; fixtureOnly?: boolean; fileId?: string };
type StateCheck = FixtureResponse & { state: string; jobStatus: string | null; storagePresent: boolean; contentMatches: boolean; requiresManualReview: boolean; checks: Record<string, boolean>; error?: string };
type ExecutionStatus = { ok: boolean; readOnly: boolean; storageExecutionEnabled: boolean; finalizationEnabled: boolean; error?: string };
type Audit = FixtureResponse & { ok?: boolean; readOnly?: boolean; readyForManualReview?: boolean; readyForManualFinalization?: boolean; checks?: Record<string, boolean>; error?: string };
export default function RecoveryFixtureTestPanel({ preview = false }: { preview?: boolean }) {
  const finalizeLock = useRef(false);
  const [finalizeAttempted, setFinalizeAttempted] = useState(true);
  const [finalizeResult, setFinalizeResult] = useState('');
  const [finalizeError, setFinalizeError] = useState('');
  useEffect(() => {
    try { setFinalizeAttempted(localStorage.getItem(FINALIZE_ATTEMPT_KEY) !== null); }
    catch { setFinalizeError('再送防止記録を利用できないため、実行できません。'); }
  }, []);
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
  function finalizationConditions(a: Audit | null, state: StateCheck | null, status: ExecutionStatus | null) {
    return a?.ok === true && a.readOnly === true && a.fixtureOnly === true && a.fileId === FILE_ID &&
      a.readyForManualFinalization === true && a.checks?.storageAbsent === true &&
      Object.values(a.checks ?? {}).every(value => value === true) &&
      state?.ok === true && state.readOnly === true && state.fixtureOnly === true && state.fileId === FILE_ID &&
      state.state === 'storage_removed' && state.jobStatus === 'storage_removed' &&
      state.storagePresent === false && state.requiresManualReview === false &&
      Object.keys(state.checks ?? {}).length > 0 && Object.values(state.checks).every(value => value === true) &&
      status?.ok === true && status.readOnly === true &&
      status.storageExecutionEnabled === false && status.finalizationEnabled === true;
  }
  const canFinalize = preview && phase === 'after' && confirmText === CONFIRMATION &&
    finalizationConditions(audit, stateCheck, executionStatus) && !finalizeAttempted;

  async function executeFixtureFinalization() {
    if (busy || finalizeLock.current || !canFinalize) return;
    if (!window.confirm('固定テストファイル1件のDB記録・ジョブを最終整理します。Storage削除済みであることを確認してください。実行後は再実行できません。続行しますか？')) return;
    finalizeLock.current = true;
    setBusy(true); setFinalizeError(''); setFinalizeResult('');
    let submitted = false;
    try {
      if (localStorage.getItem(FINALIZE_ATTEMPT_KEY) !== null) {
        setFinalizeAttempted(true);
        throw new Error('実行履歴があります。再実行せず状態を診断してください。');
      }
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('ログインし直してください。');
      const headers = { Authorization: 'Bearer ' + token };
      // Read-only, admin-authenticated checks immediately before the mutation.
      const read = async (url: string, method: string) => {
        const response = await fetch(url, { method, headers, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || result.ok !== true) throw new Error(result.error ?? '実行直前の照合に失敗しました。');
        return result;
      };
      const status = await read('/api/cs-works/file-retention/recovery-stage-execution-status', 'GET') as ExecutionStatus;
      const state = await read('/api/cs-works/file-retention/recovery-stage-state', 'POST') as StateCheck;
      const after = await read('/api/cs-works/file-retention/recovery-stage-finalize', 'POST') as Audit;
      if (!finalizationConditions(after, state, status)) throw new Error('実行直前の安全条件が一致しません。');
      // Persist before sending: a lost response must never enable another submission.
      localStorage.setItem(FINALIZE_ATTEMPT_KEY, 'submitted');
      submitted = true;
      setFinalizeAttempted(true);
      const response = await fetch('/api/cs-works/file-retention/recovery-stage-finalize-execute', {
        method: 'POST', cache: 'no-store',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: FILE_ID, confirmation: 'FINALIZE_EXACT_RECOVERY_TEST_FIXTURE' }),
      });
      const result = await response.json() as { ok?: boolean; fixtureOnly?: boolean; finalized?: boolean; error?: string };
      if (!response.ok || result.ok !== true || result.fixtureOnly !== true || result.finalized !== true) {
        throw new Error(result.error ?? 'DB最終整理の完了を確認できません。');
      }
      setFinalizeResult('固定テストファイルのDB最終整理が完了しました。再実行はできません。');
    } catch (e) {
      setFinalizeError((e instanceof Error ? e.message : '実行結果を確認できません。') +
        (submitted ? ' 再実行は禁止です。DB記録・ジョブと状態診断を確認してください。' : ' 整理APIは送信していません。安全条件を再照合してください。'));
    } finally {
      setAudit(null); setStateCheck(null); setExecutionStatus(null); setConfirmText('');
      setBusy(false); finalizeLock.current = false;
    }
  }
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
    <p>対象は固定されたテストファイル1件のみ。実行には各段階の照合と実行ロックの確認が必要です。</p>
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
      <p>※フラグの確認だけでは実行されません。実行ボタンと最終確認が必要です。</p>
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
      確認用入力（「テストデータ1件のみ」と完全一致）
      <input style={{ display: 'block', maxWidth: '100%', width: 330, padding: 8, marginTop: 4 }}
        disabled={busy} value={confirmText} onChange={e => setConfirmText(e.target.value)}
        placeholder="テストデータ1件のみ" />
    </label>
    <p>{confirmText === 'テストデータ1件のみ' && passed
      ? '確認入力と照合は一致しています。実行フラグと状態診断も確認してください。'
      : '確認文字列と照合結果が揃うまで実行できません。'}</p>
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
    {preview && <div style={{ marginTop: 12, padding: 12, border: '1px solid #dc2626', borderRadius: 8 }}>
      <strong>Preview専用・固定テストファイル1件のDB最終整理</strong>
      <p>② 削除後照合 → ③ 状態診断 → ④ 実行ロック確認 → 確認入力の順に確認してください。</p>
      <p>Storage削除済み・削除後照合OK、Storage削除フラグ無効、DB最終整理フラグ有効が必要です。実行時にも管理者認証と安全条件を再確認します。</p>
      <p>安全条件：{canFinalize ? '一致' : '未完了または実行済み'}</p>
      <button type="button" disabled={busy || !canFinalize} onClick={() => void executeFixtureFinalization()}>
        {busy && finalizeLock.current ? 'DB最終整理を確認・実行中…' : '固定テストファイルのDB最終整理を実行'}
      </button>
      {finalizeResult && <p role="status">{finalizeResult}</p>}
      {finalizeError && <p role="alert">{finalizeError}</p>}
      {finalizeAttempted && <p role="status">再実行禁止：実行履歴がある場合は、再読み込み後もこのブラウザから再送できません。結果不明・失敗時はDB記録・ジョブと状態診断を確認してください。</p>}
    </div>}
    <p>※本番ファイルの削除機能やVercelの実行ロックは変更しません。</p>
  </section>;
}
