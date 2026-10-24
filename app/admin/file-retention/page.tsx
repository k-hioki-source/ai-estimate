'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type JobSummary = { totalDisplayed: number; claimed: number; storageRemoved: number; failed: number; recoveryNeeded: number; truncated: boolean; recoveryCandidates: { projectId: string; fileId: string; status: string; lastError: string | null }[] };
type RecoveryTest = { claimed: boolean; markedFailed: boolean; retryBlocked: boolean; storageRemovedState: boolean; recordDeleted: boolean; cleaned: boolean; storageOperations: number; existingFilesTouched: number };
type ClaimTest = { concurrentAttempts: number; successfulClaims: number; oneClaimOnly: boolean; cleanupOk: boolean; existingFilesTouched: number; storageFilesDeleted: number };
type ReferenceCheck = { scannedRows: number; missingPaths: number; duplicatePathCount: number; duplicateReferences: number; capped: boolean };
type DeletionLog = { id: string; project_id: string; file_id: string; outcome: 'deleted' | 'failed' | 'skipped'; detail: string | null; created_at: string };
type LifecycleResult = { ok: boolean; shareRevoked: boolean; storageRemoved: boolean; fileRowDeleted: boolean; shareCascadeVerified: boolean; auditLogged: boolean; existingFilesTouched: number };
type LinkageResult = { checkedShares: number; linkedShares: number; invalidShares: number; activeShares: number; truncated: boolean; issues: string[]; deletedFiles: number; changedRows: number };
type StorageTestResult = { ok: boolean; uploaded: boolean; verified: boolean; deleted: boolean; confirmedAbsent: boolean; realProjectsChanged: number; databaseRowsChanged: number };
type FixtureResult = { passed: boolean; fixtureOnly: boolean; realFilesChecked: number; deletedFiles: number; cases: { caseName: string; eligible: number; expected: number; passed: boolean }[] };
type DeletionPlan = { ok: boolean; dryRun: boolean; deletionEnabled: boolean; inspectedProjects: number; readyFiles: number; blockedFiles: number; heldProjects: number; truncated: boolean; projects: { projectCode: string; state: string; readyFiles: number; blockedFiles: number; details: string[] }[] };
type TestResult = { ok: boolean; dryRun: boolean; checkedProjects: number; warningProjects: number; overdueProjects: number; heldProjects: number; emailSent: number; deletedFiles: number; details: { projectCode: string; fileCount: number; dueAt: string; state: string }[] };
type Row = {
  projectId: string; projectCode: string; completedAt: string; deletionDueAt: string;
  state: 'warning' | 'overdue'; fileCount: number; held: boolean; holdReason: string | null;
  files: { id: string; name: string; type: string }[];
};
const date = (s: string) => new Date(s).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
export default function FileRetentionAdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [fixtureRunning, setFixtureRunning] = useState(false);
  const [storageTesting, setStorageTesting] = useState(false);
  const [linkageTesting, setLinkageTesting] = useState(false);
  const [lifecycleTesting, setLifecycleTesting] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobSummary, setJobSummary] = useState<JobSummary | null>(null);
  const [recoveryTesting, setRecoveryTesting] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<RecoveryTest | null>(null);
  const [claimTesting, setClaimTesting] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimTest | null>(null);
  const [referenceChecking, setReferenceChecking] = useState(false);
  const [referenceResult, setReferenceResult] = useState<ReferenceCheck | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [deletionLogs, setDeletionLogs] = useState<DeletionLog[]>([]);
  const [lifecycleResult, setLifecycleResult] = useState<LifecycleResult | null>(null);
  const [linkageResult, setLinkageResult] = useState<LinkageResult | null>(null);
  const [storageResult, setStorageResult] = useState<StorageTestResult | null>(null);
  const [fixtureResult, setFixtureResult] = useState<FixtureResult | null>(null);
  const [deletionPlan, setDeletionPlan] = useState<DeletionPlan | null>(null);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [emailResult, setEmailResult] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  async function token() {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    return data.session?.access_token ?? null;
  }
  async function load() {
    setLoading(true); setError('');
    try {
      const access = await token();
      if (!access) { router.replace('/login'); return; }
      const response = await fetch('/api/cs-works/file-retention/preview', {
        headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '取得に失敗しました。');
      const next = (data.projects ?? []) as Row[];
      setRows(next);
      setReasons(Object.fromEntries(next.map(r => [r.projectId, r.holdReason ?? ''])));
    } catch (e) { setError(e instanceof Error ? e.message : '取得に失敗しました。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function setHold(row: Row, held: boolean) {
    if (!held && !window.confirm('保留を解除しますか？将来の自動削除対象に戻ります（現在は削除機能は無効です）。')) return;
    setSaving(row.projectId); setError('');
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/hold', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access },
        body: JSON.stringify({ projectId: row.projectId, held, reason: reasons[row.projectId] ?? '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '保存できませんでした。');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : '保存できませんでした。'); }
    finally { setSaving(null); }
  }
  async function inspectJobs() {
    setJobLoading(true); setJobSummary(null); setError('');
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/jobs', {
        headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'ジョブ状態を確認できませんでした。');
      setJobSummary(data as JobSummary);
    } catch (e) { setError(e instanceof Error ? e.message : 'ジョブ状態を確認できませんでした。'); }
    finally { setJobLoading(false); }
  }
  async function runRecoveryTest() {
    if (!window.confirm('テスト案件内に一時的なDB記録を作り、失敗・復旧の状態遷移を検証します。Storageには一切アクセスしません。実行しますか？')) return;
    setRecoveryTesting(true); setRecoveryResult(null); setError('');
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/recovery-state-test', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '復旧状態テストに失敗しました。');
      setRecoveryResult(data as RecoveryTest);
    } catch (e) { setError(e instanceof Error ? e.message : '復旧状態テストに失敗しました。'); }
    finally { setRecoveryTesting(false); }
  }
  async function runClaimTest() {
    if (!window.confirm('専用テスト案件に一時的なDB記録を作り、2つのジョブ取得を同時実行します。実ファイルは削除しません。よろしいですか？')) return;
    setClaimTesting(true); setClaimResult(null); setError('');
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/claim-test', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'ジョブ重複防止テストに失敗しました。');
      setClaimResult(data as ClaimTest);
    } catch (e) { setError(e instanceof Error ? e.message : 'ジョブ重複防止テストに失敗しました。'); }
    finally { setClaimTesting(false); }
  }
  async function checkReferences() {
    setReferenceChecking(true); setReferenceResult(null); setError('');
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/reference-check', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '参照重複の確認に失敗しました。');
      setReferenceResult(data as ReferenceCheck);
    } catch (e) { setError(e instanceof Error ? e.message : '参照重複の確認に失敗しました。'); }
    finally { setReferenceChecking(false); }
  }
  async function loadDeletionLogs() {
    setLogsLoading(true); setError('');
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/deletion-logs', {
        headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '削除履歴の取得に失敗しました。');
      setDeletionLogs((data.rows ?? []) as DeletionLog[]);
      setLogsLoaded(true);
    } catch (e) { setLogsLoaded(false); setError(e instanceof Error ? e.message : '削除履歴の取得に失敗しました。'); }
    finally { setLogsLoading(false); }
  }
  async function runLifecycleTest() {
    if (!window.confirm('指定テスト案件に一時的な専用ファイルと共有記録を作り、それらだけを削除します。既存ファイルは削除しません。実行しますか？')) return;
    setLifecycleTesting(true); setError(''); setLifecycleResult(null);
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/linkage-lifecycle-test', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '連動削除テストに失敗しました。');
      setLifecycleResult(data as LifecycleResult);
      await loadDeletionLogs();
    } catch (e) { setError(e instanceof Error ? e.message : '連動削除テストに失敗しました。'); }
    finally { setLifecycleTesting(false); }
  }
  async function runLinkageTest() {
    setLinkageTesting(true); setError(''); setLinkageResult(null);
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/linkage-test', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '関連付けの確認に失敗しました。');
      setLinkageResult(data as LinkageResult);
    } catch (e) { setError(e instanceof Error ? e.message : '関連付けの確認に失敗しました。'); }
    finally { setLinkageTesting(false); }
  }
  async function runStorageTest() {
    if (!window.confirm('専用のテストファイルをStorageに一時作成し、そのテストファイルだけを削除します。既存案件には触れません。実行しますか？')) return;
    setStorageTesting(true); setError(''); setStorageResult(null);
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/storage-test', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Storageテストに失敗しました。');
      setStorageResult(data as StorageTestResult);
    } catch (e) { setError(e instanceof Error ? e.message : 'Storageテストに失敗しました。'); }
    finally { setStorageTesting(false); }
  }
  async function runFixtureTest() {
    setFixtureRunning(true); setError(''); setFixtureResult(null);
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/fixture-test', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '模擬テストに失敗しました。');
      setFixtureResult(data as FixtureResult);
    } catch (e) { setError(e instanceof Error ? e.message : '模擬テストに失敗しました。'); }
    finally { setFixtureRunning(false); }
  }
  async function runDeletionPlan() {
    setPlanning(true); setError(''); setDeletionPlan(null);
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/deletion-plan', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '削除対象の照合に失敗しました。');
      setDeletionPlan(data as DeletionPlan);
    } catch (e) { setError(e instanceof Error ? e.message : '削除対象の照合に失敗しました。'); }
    finally { setPlanning(false); }
  }
  async function sendTestEmail() {
    if (!window.confirm('管理者宛てに保管期限のテストメールを1通送信します。よろしいですか？')) return;
    setSendingTestEmail(true); setEmailResult(''); setError('');
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/test-email', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'テストメールを送信できませんでした。');
      setEmailResult('テストメールを送信しました。宛先：' + data.recipient);
    } catch (e) { setError(e instanceof Error ? e.message : 'テストメールを送信できませんでした。'); }
    finally { setSendingTestEmail(false); }
  }
  async function runTest() {
    setTesting(true); setError(''); setTestResult(null);
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/test', {
        method: 'POST', headers: { Authorization: 'Bearer ' + access }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'テスト実行に失敗しました。');
      setTestResult(data as TestResult);
    } catch (e) { setError(e instanceof Error ? e.message : 'テスト実行に失敗しました。'); }
    finally { setTesting(false); }
  }
  return <main style={{ maxWidth: 1080, margin: '32px auto', padding: '0 20px', color: '#172554' }}>
    <Link href="/admin">← 管理者トップへ戻る</Link>
    <h1 style={{ marginTop: 24 }}>ファイル保管期限の確認</h1>
    <p>案件完了から30日後を削除予定日とし、7日前から対象を表示します。</p>
    <div style={{ background: '#eff6ff', padding: 16, borderRadius: 12, margin: '16px 0' }}>
      <strong>現在は確認専用です。自動削除・定期通知は無効です。</strong>
      <p style={{ marginBottom: 0 }}>「保留」に設定した案件は、将来の自動削除処理から除外する予定です。現時点ではファイルの削除は行いません。</p>
    </div>
    <button type="button" onClick={() => void load()} disabled={loading} style={{ width: 'auto', padding: '8px 14px', border: '1px solid #bfdbfe', background: '#fff', borderRadius: 8 }}>一覧を更新</button>
    <button type="button" onClick={() => void runTest()} disabled={testing}
      style={{ width: 'auto', marginLeft: 10, padding: '8px 14px', border: '1px solid #93c5fd', background: '#dbeafe', borderRadius: 8, fontWeight: 700 }}>
      {testing ? 'テスト中…' : '保管期限チェックをテスト実行'}
    </button>
    <button type="button" onClick={() => void sendTestEmail()} disabled={sendingTestEmail}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #86efac', background: '#dcfce7', borderRadius: 8, fontWeight: 700 }}>
      {sendingTestEmail ? '送信中…' : '管理者へテストメール送信'}
    </button>
    <button type="button" onClick={() => void runDeletionPlan()} disabled={planning}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #fcd34d', background: '#fef3c7', borderRadius: 8, fontWeight: 700 }}>
      {planning ? '照合中…' : '30日経過ファイルの削除対象を照合（削除なし）'}
    </button>
    <button type="button" onClick={() => void runFixtureTest()} disabled={fixtureRunning}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #c4b5fd', background: '#ede9fe', borderRadius: 8, fontWeight: 700 }}>
      {fixtureRunning ? '模擬テスト中…' : '削除条件を5パターンで模擬テスト'}
    </button>
    <button type="button" onClick={() => void runStorageTest()} disabled={storageTesting}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #94a3b8', background: '#e2e8f0', borderRadius: 8, fontWeight: 700 }}>
      {storageTesting ? 'Storageテスト中…' : '専用テストファイルでStorage削除を検証'}
    </button>
    <button type="button" onClick={() => void runLinkageTest()} disabled={linkageTesting}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #7dd3fc', background: '#e0f2fe', borderRadius: 8, fontWeight: 700 }}>
      {linkageTesting ? '関連付け確認中…' : 'DB・共有リンクの関連付けを照合（変更なし）'}
    </button>
    <button type="button" onClick={() => void runLifecycleTest()} disabled={lifecycleTesting}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #fca5a5', background: '#fee2e2', borderRadius: 8, fontWeight: 700 }}>
      {lifecycleTesting ? '連動テスト中…' : '専用データで共有・Storage・DB連動削除をテスト'}
    </button>
    <button type="button" onClick={() => void loadDeletionLogs()} disabled={logsLoading}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #94a3b8', background: '#f8fafc', borderRadius: 8, fontWeight: 700 }}>
      {logsLoading ? '履歴を取得中…' : '削除履歴を確認'}
    </button>
    <button type="button" onClick={() => void checkReferences()} disabled={referenceChecking}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #93c5fd', background: '#eff6ff', borderRadius: 8, fontWeight: 700 }}>
      {referenceChecking ? '参照重複を確認中…' : 'Storageパスの重複参照を確認（変更なし）'}
    </button>
    <button type="button" onClick={() => void runClaimTest()} disabled={claimTesting}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #a5b4fc', background: '#eef2ff', borderRadius: 8, fontWeight: 700 }}>
      {claimTesting ? '重複防止テスト中…' : '削除ジョブの二重取得防止をテスト'}
    </button>
    <button type="button" onClick={() => void runRecoveryTest()} disabled={recoveryTesting}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #c4b5fd', background: '#f5f3ff', borderRadius: 8, fontWeight: 700 }}>
      {recoveryTesting ? '復旧状態テスト中…' : '削除失敗・復旧の状態遷移をテスト'}
    </button>
    <button type="button" onClick={() => void inspectJobs()} disabled={jobLoading}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #94a3b8', background: '#f8fafc', borderRadius: 8, fontWeight: 700 }}>
      {jobLoading ? 'ジョブ状態を確認中…' : '削除ジョブ・復旧待ちを確認（変更なし）'}
    </button>
    {jobSummary && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #cbd5e1' }}>
      <strong>削除ジョブの状態（読み取り専用）</strong>
      <p>表示件数：{jobSummary.totalDisplayed}件 ／ 処理取得中：{jobSummary.claimed}件 ／ Storage削除済み：{jobSummary.storageRemoved}件 ／ 失敗：{jobSummary.failed}件 ／ 復旧確認が必要：{jobSummary.recoveryNeeded}件</p>
      {jobSummary.truncated && <p>※最大100件まで表示しています。全件ではありません。</p>}
      {jobSummary.recoveryCandidates.map(item => <p key={item.fileId}>
        <Link href={'/admin/projects/' + item.projectId}>{item.projectId.slice(0, 8)}…</Link>
        {' / ファイルID：' + item.fileId.slice(0, 8) + '… / ' + item.status}
        {item.lastError ? ' / ' + item.lastError : ''}
      </p>)}
      <p>※この画面では復旧処理やファイル削除は行いません。</p>
    </section>}
    {recoveryResult && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#f5f3ff', border: '1px solid #c4b5fd' }}>
      <strong>削除失敗・復旧の状態遷移テスト成功</strong>
      <p>ジョブ取得：{recoveryResult.claimed ? '成功' : '失敗'} ／ 失敗状態の記録：{recoveryResult.markedFailed ? '成功' : '失敗'} ／ 二重取得の防止：{recoveryResult.retryBlocked ? '成功' : '失敗'}</p>
      <p>復旧状態への変更：{recoveryResult.storageRemovedState ? '成功' : '失敗'} ／ テストDB記録の削除：{recoveryResult.recordDeleted ? '成功' : '失敗'} ／ 後片付け：{recoveryResult.cleaned ? '成功' : '失敗'}</p>
      <p>※DB状態の模擬テストです。Storage削除や実際の障害復旧は検証していません。</p>
    </section>}
    {claimResult && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#eef2ff', border: '1px solid #a5b4fc' }}>
      <strong>ジョブ重複防止テスト成功</strong>
      <p>同時取得試行：{claimResult.concurrentAttempts}回 ／ 取得成功：{claimResult.successfulClaims}回 ／ 一意性確認：{claimResult.oneClaimOnly ? '成功' : '失敗'} ／ テストデータ後片付け：{claimResult.cleanupOk ? '成功' : '失敗'}</p>
      <p>既存ファイル操作：{claimResult.existingFilesTouched}件 ／ Storage削除：{claimResult.storageFilesDeleted}件 ／ 自動削除：無効</p>
    </section>}
    {referenceResult && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#eff6ff', border: '1px solid #93c5fd' }}>
      <strong>Storageパスの参照チェック完了</strong>
      <p>確認したDB記録：{referenceResult.scannedRows}件 ／ 重複パス：{referenceResult.duplicatePathCount}件 ／ 重複に関係する記録：{referenceResult.duplicateReferences}件 ／ パス未設定：{referenceResult.missingPaths}件</p>
      {referenceResult.capped && <p style={{ color: '#b45309' }}>1万件の調査上限に達しました。全件確認できていません。</p>}
      <p>※DB参照の読み取り専用検査です。ファイルの削除・変更は行いません。</p>
    </section>}
    {logsLoaded && <section style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #cbd5e1' }}>
      <strong>ファイル削除履歴（新しい順・最大50件）</strong>
      {deletionLogs.length === 0 ? <p>削除履歴はまだありません。自動削除は無効です。</p> :
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead><tr><th style={{ textAlign: 'left' }}>日時</th><th style={{ textAlign: 'left' }}>案件</th><th style={{ textAlign: 'left' }}>結果</th><th style={{ textAlign: 'left' }}>詳細</th></tr></thead>
          <tbody>{deletionLogs.map(log => <tr key={log.id}>
            <td style={{ padding: 8, borderTop: '1px solid #e2e8f0' }}>{new Date(log.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td>
            <td style={{ padding: 8, borderTop: '1px solid #e2e8f0' }}><Link href={'/admin/projects/' + log.project_id}>{log.project_id.slice(0, 8)}…</Link></td>
            <td style={{ padding: 8, borderTop: '1px solid #e2e8f0' }}>{log.detail?.startsWith('[TEST ONLY]') ? (log.outcome === 'deleted' ? 'テスト成功' : 'テスト失敗') : log.outcome === 'deleted' ? '削除済み' : log.outcome === 'failed' ? '失敗' : '対象外'}</td>
            <td style={{ padding: 8, borderTop: '1px solid #e2e8f0' }}>{log.detail || '—'}</td>
          </tr>)}</tbody>
        </table></div>}
      <p style={{ fontSize: 13 }}>※この画面は履歴の閲覧専用です。削除は実行しません。</p>
    </section>}
    {lifecycleResult && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#f0fdf4', border: '1px solid #86efac' }}>
      <strong>連動削除テスト成功（新規作成した専用データのみ）</strong>
      <p>共有リンク無効化：{lifecycleResult.shareRevoked ? '成功' : '失敗'} ／ Storage削除：{lifecycleResult.storageRemoved ? '成功' : '失敗'} ／ DB記録削除：{lifecycleResult.fileRowDeleted ? '成功' : '失敗'} ／ 共有履歴の連動削除：{lifecycleResult.shareCascadeVerified ? '成功' : '失敗'} ／ 削除履歴記録：{lifecycleResult.auditLogged ? '成功' : '失敗'}</p>
      <p>既存ファイルの操作：{lifecycleResult.existingFilesTouched}件 ／ 本番自動削除：無効</p>
    </section>}
    {linkageResult && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#f0f9ff', border: '1px solid #7dd3fc' }}>
      <strong>DB・共有リンクの関連付け照合完了</strong>
      <p>確認した共有リンク：{linkageResult.checkedShares}件 ／ 正常な関連付け：{linkageResult.linkedShares}件 ／ 要確認：{linkageResult.invalidShares}件 ／ 有効期間内・未失効：{linkageResult.activeShares}件</p>
      <p>削除ファイル：{linkageResult.deletedFiles}件 ／ DB変更：{linkageResult.changedRows}件</p>
      {linkageResult.truncated && <p>200件の照合上限に達しました。全件確認には追加対応が必要です。</p>}
      {linkageResult.issues.length > 0 && <ul>{linkageResult.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
      <p>※関連付けの読み取り専用チェックです。共有リンク無効化やDB連動削除の動作確認ではありません。</p>
    </section>}
    {storageResult && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#f0fdf4', border: '1px solid #86efac' }}>
      <strong>Storageテスト成功（専用ファイルのみ）</strong>
      <p>作成：{storageResult.uploaded ? '成功' : '失敗'} ／ 読取：{storageResult.verified ? '成功' : '失敗'} ／ 削除：{storageResult.deleted ? '成功' : '失敗'} ／ 削除後の不存在確認：{storageResult.confirmedAbsent ? '成功' : '失敗'}</p>
      <p>既存案件の変更：{storageResult.realProjectsChanged}件 ／ DBレコード変更：{storageResult.databaseRowsChanged}件</p>
      <p>※共有リンク・DB連動削除はこのテストの対象外です。</p>
    </section>}
    {fixtureResult && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#f5f3ff', border: '1px solid #c4b5fd' }}>
      <strong>{fixtureResult.passed ? '模擬テスト全件成功' : '模擬テストに失敗しました'}</strong>
      <p>架空データのみ使用／実案件への変更なし／削除ファイル：{fixtureResult.deletedFiles}件</p>
      <ul>{fixtureResult.cases.map((item, index) =>
        <li key={index}>{item.passed ? '✓' : '×'} {item.caseName}：候補 {item.eligible}件（期待値 {item.expected}件）</li>
      )}</ul>
      <p>※これは判定ルール単体の模擬テストです。実際のStorage照合・削除処理の検証ではありません。</p>
    </section>}
    {deletionPlan && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, border: '1px solid #fcd34d', background: '#fffbeb' }}>
      <strong>削除対象の照合完了（実際の削除はしていません）</strong>
      <p>調査案件：{deletionPlan.inspectedProjects}件 ／ Storage照合済み：{deletionPlan.readyFiles}ファイル ／ 要確認：{deletionPlan.blockedFiles}ファイル ／ 保留案件：{deletionPlan.heldProjects}件</p>
      {deletionPlan.truncated && <p style={{ color: '#b45309' }}>200案件の上限に達しました。全件確認には追加対応が必要です。</p>}
      {deletionPlan.projects.length > 0 && <details><summary>案件別の照合結果</summary><ul>{deletionPlan.projects.map((item, index) =>
        <li key={index}>{item.projectCode}：{item.state}（照合済み {item.readyFiles}件、要確認 {item.blockedFiles}件）
          {item.details.length > 0 && <ul>{item.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
        </li>
      )}</ul></details>}
    </section>}
    {emailResult && <p role="status" style={{ color: '#166534', fontWeight: 700 }}>{emailResult}</p>}
    {testResult && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
      <strong>テスト成功：実ファイルの削除・メール送信は行っていません。</strong>
      <p>対象案件：{testResult.checkedProjects}件 ／ 削除7日前：{testResult.warningProjects}件 ／ 期限超過：{testResult.overdueProjects}件 ／ 保留中：{testResult.heldProjects}件</p>
      <p>メール送信：{testResult.emailSent}件 ／ 削除ファイル：{testResult.deletedFiles}件</p>
      {testResult.details.length > 0 && <details><summary>対象案件の内訳</summary><ul>{testResult.details.map((item, index) =>
        <li key={index}>{item.projectCode}：{item.state}／{item.fileCount}ファイル／期限 {date(item.dueAt)}</li>
      )}</ul></details>}
    </section>}
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    {loading ? <p>読み込み中…</p> : rows.length === 0 ? <p>現在、削除予告の対象ファイルはありません。</p> :
      <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
        {rows.map(row => <section key={row.projectId} style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <Link href={'/admin/projects/' + row.projectId}><strong>{row.projectCode}</strong></Link>
              <p style={{ margin: '8px 0' }}>完了日：{date(row.completedAt)} ／ 削除予定日：{date(row.deletionDueAt)} ／ 対象：{row.fileCount}件</p>
              <strong style={{ color: row.held ? '#1d4ed8' : row.state === 'overdue' ? '#b91c1c' : '#92400e' }}>
                {row.held ? '削除保留中' : row.state === 'overdue' ? '削除予定日超過' : '削除7日前の確認対象'}
              </strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240 }}>
              <label htmlFor={'reason-' + row.projectId}>保留理由（任意）</label>
              <input id={'reason-' + row.projectId} value={reasons[row.projectId] ?? ''} maxLength={500}
                onChange={e => setReasons(prev => ({ ...prev, [row.projectId]: e.target.value }))}
                placeholder="例：顧客から再確認依頼あり" style={{ padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }} />
              <button type="button" disabled={saving === row.projectId} onClick={() => void setHold(row, !row.held)}
                style={{ width: 'auto', padding: '8px 12px', borderRadius: 8, border: '1px solid #93c5fd', background: '#eff6ff' }}>
                {saving === row.projectId ? '保存中…' : row.held ? '保留を解除' : 'この案件を削除保留'}
              </button>
            </div>
          </div>
          <details style={{ marginTop: 12 }}><summary>対象ファイルを表示（{row.fileCount}件）</summary>
            <ul>{row.files.map(f => <li key={f.id}>{f.name}（{f.type}）</li>)}</ul>
          </details>
        </section>)}
      </div>}
  </main>;
}
