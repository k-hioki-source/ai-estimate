'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

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
