'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';

type DeletionLog = { id: string; project_id: string; file_id: string; outcome: 'deleted' | 'failed' | 'skipped'; detail: string | null; created_at: string };
type DeletionPlan = { ok: boolean; dryRun: boolean; deletionEnabled: boolean; inspectedProjects: number; readyFiles: number; blockedFiles: number; heldProjects: number; truncated: boolean; projects: { projectId: string; projectCode: string; state: string; readyFiles: number; blockedFiles: number; details: string[]; candidates: { id: string; name: string; type: string }[] }[] };
type Row = {
  projectId: string; projectCode: string; completedAt: string; deletionDueAt: string;
  state: 'warning' | 'overdue'; fileCount: number; held: boolean;
  files: { id: string; name: string; type: string }[];
};
const date = (s: string) => new Date(s).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
export default function FileRetentionAdminPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [deletionLogs, setDeletionLogs] = useState<DeletionLog[]>([]);
  const [deletionPlan, setDeletionPlan] = useState<DeletionPlan | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightResults, setPreflightResults] = useState<Record<string, { eligible: boolean; reasons: string[]; error?: string }>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(false);
  async function token() {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    return data.session?.access_token ?? null;
  }
  async function load() {
    setLoading(true); setError(''); setListLoaded(false); setRows([]);
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
      setListLoaded(true);
    } catch (e) { setError(e instanceof Error ? e.message : '取得に失敗しました。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function setHold(row: Row, held: boolean) {
    if (!held && !window.confirm('保留を解除しますか？保管見直しの確認対象に戻ります。自動削除は行いません。')) return;
    setSaving(row.projectId); setError('');
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const response = await fetch('/api/cs-works/file-retention/hold', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access },
        body: JSON.stringify({ projectId: row.projectId, held }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '保存できませんでした。');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : '保存できませんでした。'); }
    finally { setSaving(null); }
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
  async function runDeletionPlan() {
    setPlanning(true); setError(''); setDeletionPlan(null); setSelectedCandidates([]); setReviewOpen(false); setPreflightResults({});
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
  async function checkSelectedCandidates() {
    setReviewOpen(true);
    setPreflightResults({});
    setPreflightBusy(true);
    try {
      const access = await token();
      if (!access) throw new Error('ログインし直してください。');
      const results: Record<string, { eligible: boolean; reasons: string[]; error?: string }> = {};
      for (const fileId of selectedCandidates) {
        try {
          const response = await fetch('/api/cs-works/file-retention/manual-preflight', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId }),
            cache: 'no-store',
          });
          const data = await response.json();
          results[fileId] = response.ok ? { eligible: data.eligible === true, reasons: data.reasons ?? [] } :
            { eligible: false, reasons: [data.error ?? '事前確認に失敗しました。'] };
        } catch {
          results[fileId] = { eligible: false, reasons: ['通信エラーのため確認できません。'] };
        }
      }
      setPreflightResults(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : '事前確認に失敗しました。');
    } finally {
      setPreflightBusy(false);
    }
  }
  return <main style={{ maxWidth: 1080, margin: '32px auto', padding: '0 20px', color: '#172554' }}>
    <Link href="/admin">← 管理者トップへ戻る</Link>
    <h1 style={{ marginTop: 24 }}>ファイル保管期限の確認</h1>
    <p>案件完了から30日後を保管見直し日とし、7日前から対象を表示します。30日後に必ず削除するものではありません。</p>
    <div style={{ background: '#eff6ff', padding: 16, borderRadius: 12, margin: '16px 0' }}>
      <strong>対象の確認・保留設定ができます。サイト内での期限後削除・自動削除・定期通知は無効です。</strong>
      <p style={{ marginBottom: 0 }}>対象は確認用・修正用・納品ファイルです。顧客の支給資料は対象外です。30日経過後、管理者確認のうえ削除する場合があります。保留中の案件は削除せず、実際の削除は管理者がSupabaseで個別に行います。</p>
    </div>
    <button type="button" onClick={() => void load()} disabled={loading} style={{ width: 'auto', padding: '8px 14px', border: '1px solid #bfdbfe', background: '#fff', borderRadius: 8 }}>一覧を更新</button>
      <p>削除前には対象・バックアップ・共有リンク・StorageとDBの対応を確認してください。サイトから削除は実行できません。</p>
    <button type="button" onClick={() => void runDeletionPlan()} disabled={planning}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #fcd34d', background: '#fef3c7', borderRadius: 8, fontWeight: 700 }}>
      {planning ? '照合中…' : '30日経過ファイルの削除対象を照合（削除なし）'}
    </button>
    <button type="button" onClick={() => void loadDeletionLogs()} disabled={logsLoading}
      style={{ width: 'auto', marginLeft: 10, marginTop: 8, padding: '8px 14px', border: '1px solid #94a3b8', background: '#f8fafc', borderRadius: 8, fontWeight: 700 }}>
      {logsLoading ? '履歴を取得中…' : '削除履歴を確認'}
    </button>
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
    {deletionPlan && <section role="status" style={{ marginTop: 16, padding: 16, borderRadius: 12, border: '1px solid #fcd34d', background: '#fffbeb' }}>
      <strong>削除対象の照合完了（実際の削除はしていません）</strong>
      <p>調査案件：{deletionPlan.inspectedProjects}件 ／ Storage照合済み：{deletionPlan.readyFiles}ファイル ／ 要確認：{deletionPlan.blockedFiles}ファイル ／ 保留案件：{deletionPlan.heldProjects}件</p>
      {deletionPlan.truncated && <p style={{ color: '#b45309' }}>200案件の上限に達しました。全件確認には追加対応が必要です。</p>}
      {deletionPlan.projects.length > 0 && <details><summary>案件別の照合結果</summary><ul>{deletionPlan.projects.map((item, index) =>
        <li key={index}>{item.projectCode}：{item.state}（照合済み {item.readyFiles}件、要確認 {item.blockedFiles}件）
          {item.details.length > 0 && <ul>{item.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
        </li>
      )}</ul></details>}
      {deletionPlan.projects.some(p => (p.candidates ?? []).length > 0) && <div style={{ marginTop: 16, padding: 12, background: '#fff', borderRadius: 8 }}>
        <strong>削除候補ファイルの選択（確認のみ）</strong>
        <p>対象を選択して内容を確認できます。現在は削除を実行できません。</p>
        {deletionPlan.projects.map(project => (project.candidates ?? []).length > 0 && <div key={project.projectId}>
          <p><strong>{project.projectCode}</strong></p>
          {(project.candidates ?? []).map(file => <label key={file.id} style={{ display: 'block', margin: '8px 0' }}>
            <input type="checkbox" checked={selectedCandidates.includes(file.id)} onChange={event => {
              setReviewOpen(false); setPreflightResults({});
              setSelectedCandidates(prev => event.target.checked ? [...prev, file.id] : prev.filter(id => id !== file.id));
            }} /> {file.name}（{file.type}）
          </label>)}
        </div>)}
        <button type="button" disabled={selectedCandidates.length === 0 || preflightBusy} onClick={() => void checkSelectedCandidates()}>
          選択した{selectedCandidates.length}件を確認
        </button>
        {reviewOpen && <div style={{ marginTop: 12, padding: 12, border: '1px solid #fcd34d', borderRadius: 8 }}>
          <strong>Supabaseで個別対応するための確認（サイト内では削除しません）</strong>
          <ul>{deletionPlan.projects.flatMap(p => (p.candidates ?? []).filter(f => selectedCandidates.includes(f.id)).map(f => <li key={f.id}>
            {p.projectCode}：{f.name}
            {preflightBusy ? ' — サーバー確認中…' :
              preflightResults[f.id] ? (preflightResults[f.id].eligible ? ' — 事前確認OK（削除は未許可）' :
                ' — 要確認：' + preflightResults[f.id].reasons.join('／')) : ' — 未確認'}
          </li>))}</ul>
          <p>現在は確認のみです。削除操作は行われません。</p>
        </div>}
      </div>}
    </section>}
    <p style={{ fontSize: 12, color: '#64748b', marginTop: 16 }}>運用メモ：30日経過後は管理者確認のうえSupabaseで個別対応します。手作業の削除はこの画面の履歴へ自動記録されません。別途作業記録を残してください。</p>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    {loading ? <p>読み込み中…</p> : !listLoaded ? <p>一覧を取得できていません。「一覧を更新」から再確認してください。</p> : rows.length === 0 ? <p>現在、保管見直しの対象ファイルはありません。</p> :
      <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
        {rows.map(row => <section key={row.projectId} style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <Link href={'/admin/projects/' + row.projectId}><strong>{row.projectCode}</strong></Link>
              <p style={{ margin: '8px 0' }}>完了日：{date(row.completedAt)} ／ 保管見直し日：{date(row.deletionDueAt)} ／ 対象：{row.fileCount}件</p>
              <strong style={{ color: row.held ? '#1d4ed8' : row.state === 'overdue' ? '#b91c1c' : '#92400e' }}>
                {row.held ? '削除保留中' : row.state === 'overdue' ? '保管見直し日を経過' : '保管見直し7日前の確認対象'}
              </strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 240 }}>
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
