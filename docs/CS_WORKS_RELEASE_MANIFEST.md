# 公開候補ファイルの選別表

2026-10-26。main=4eda907、入力候補=db70dd0。この選別に基づきrelease/csworks-preview-manual-retention-20261026をmain基点で作成。公開承認前の候補である。

## mainへ持ち込む候補（アプリ15ファイル）
- `app/admin/page.tsx`
- `app/admin/projects/[id]/page.tsx`
- `app/mypage/projects/[id]/page.tsx`
- `components/cs-works/ProjectFilePreview.tsx`
- `components/cs-works/ProjectFileShare.tsx`
- `app/api/cs-works/file-share/[token]/route.ts`
- `app/api/cs-works/file-shares/route.ts`
- `app/admin/file-retention/page.tsx`
- `app/api/cs-works/file-retention/preview/route.ts`
- `app/api/cs-works/file-retention/hold/route.ts`
- `app/api/cs-works/file-retention/deletion-plan/route.ts`
- `app/api/cs-works/file-retention/manual-preflight/route.ts`
- `app/api/cs-works/file-retention/deletion-logs/route.ts`
- `package.json`
- `package-lock.json`

## 候補作成時に必要な調整
- 保管画面にはisTestPage分岐と過去のテスト用ハンドラーが残る。今回の公開候補では通常画面で使う一覧・保留・照合・履歴だけを残し、テスト用UI/通信/型を除去済み。整理後の画面は222行。Previewは再確認が必要。
- 管理者トップのレイアウト変更は保管導線追加に伴う折り返し対応。不要な他画面変更は含まれていない。
- public共有APIはproject_file_shares、保管はprojects/project_files/project_file_retention_holds/project_file_retention_deletion_logs、個別照合はproject_file_retention_jobsにも依存する。
- vercel.jsonはmainと同一。支払期限Cronを維持し、保管Cronを追加しない。
- 新規候補のファイルに未解決の旧テストコンポーネント参照や旧API呼び出しがないことを静的確認する。

## 一括で持ち込まない差分
以下は履歴としてレビュー用ブランチに残す。migrationは自動適用しない。共有/保留/履歴の実DB制約を確認してから必要な定義だけを別途判断する。
- `app/admin/file-retention/tests/page.tsx`
- `app/api/cs-works/file-retention/claim-test/route.ts`
- `app/api/cs-works/file-retention/cron/route.ts`
- `app/api/cs-works/file-retention/deletion-cron/route.ts`
- `app/api/cs-works/file-retention/fixture-test/route.ts`
- `app/api/cs-works/file-retention/jobs/route.ts`
- `app/api/cs-works/file-retention/linkage-lifecycle-test/route.ts`
- `app/api/cs-works/file-retention/linkage-test/route.ts`
- `app/api/cs-works/file-retention/recovery-fixture-cleanup/route.ts`
- `app/api/cs-works/file-retention/recovery-fixture/route.ts`
- `app/api/cs-works/file-retention/recovery-stage-cleanup/route.ts`
- `app/api/cs-works/file-retention/recovery-stage-execute/route.ts`
- `app/api/cs-works/file-retention/recovery-stage-execution-status/route.ts`
- `app/api/cs-works/file-retention/recovery-stage-finalize-execute/route.ts`
- `app/api/cs-works/file-retention/recovery-stage-finalize/route.ts`
- `app/api/cs-works/file-retention/recovery-stage-state/route.ts`
- `app/api/cs-works/file-retention/recovery-stage/route.ts`
- `app/api/cs-works/file-retention/recovery-state-test/route.ts`
- `app/api/cs-works/file-retention/reference-check/route.ts`
- `app/api/cs-works/file-retention/storage-probe-cleanup/route.ts`
- `app/api/cs-works/file-retention/storage-probe/route.ts`
- `app/api/cs-works/file-retention/storage-test/route.ts`
- `app/api/cs-works/file-retention/test-email/route.ts`
- `app/api/cs-works/file-retention/test/route.ts`
- `components/cs-works/RecoveryFixtureTestPanel.tsx`
- `lib/cs-works/retention-fixtures.ts`
- `supabase/migrations/20261024_project_file_retention_deletion_logs.sql`
- `supabase/migrations/20261024_project_file_retention_holds.sql`
- `supabase/migrations/20261024_project_file_retention_jobs.sql`
- `supabase/migrations/20261024_project_file_retention_notifications.sql`
- `supabase/migrations/20261024_project_file_shares.sql`
- `supabase/migrations/20261025_recovery_fixture_execution_lock.sql`
- `supabase/migrations/20261025_recovery_fixture_finalization.sql`

## 検証と文書
- scripts/test-file-sharing.cjsを引き継ぎ16件成功。scripts/test-retention-release.cjsで公開用5ルートだけが存在し、保留以外の書き込み・削除・テストUI・保管Cronがないことを検査し成功。静的ガードは実DBの権限検証を代替しない。
- docs/CS_WORKS_HANDOFF.md、CS_WORKS_RELEASE_PLAN.md、csworks-manual-retention-policy.md、本書を候補へ引き継ぐ。過去の復旧テスト手順は公開作業の手順に使わない。
- SMTP/APIキー/テンプレート本文はGit差分に含まれない。キーをコミットしない。
- main基点の候補作成済み。候補と戻し先の検証状態はCS_WORKS_RELEASE_PLAN.md最新追記を参照。
