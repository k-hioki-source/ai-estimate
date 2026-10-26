# CS Works 公開前確認・反映手順

2026-10-26（日本時間）。本番反映は未承認・未実施。

## 対象を固定
- 本番対象: Vercel ai-estimate-rwxr / estimate.create-support.co.jp
- 現在のmain: 4eda90720a6dddac16f7726231e89058ac7f7824
- 操作確認済み公開候補: 84569d9f2160ae42c06bf8097bc2859e874d3c06
- ブランチ: release/csworks-preview-manual-retention-20261026
- 今回GitHubから再取得し、両SHAに変更なし。
- 対象Vercelの候補ビルドはsuccess。他の6 Vercelプロジェクトはfailureであり、全チェック成功ではない。今回の対象以外を公開しない。
- 差分は22ファイル（アプリ・依存15、文書・試験7）。一覧はCS_WORKS_RELEASE_MANIFEST.md。

## 公開内容
画像/PDFプレビュー、7日共有リンクと解除、保管見直し一覧・保留・読み取り専用照合・履歴。Next.js 15.5.28 / sharp 0.35.5。
保管用削除・復旧テストAPI、新規migration、自動削除・保管Cronは含まない。vercel.jsonはmainと同一。既存の顧客支給資料削除は既存機能として残る。

## 今回の候補で確認済み
- ユーザー: プレビュー・通常ダウンロード、保管一覧、保留保存・更新後保持・解除。
- ユーザー: 対象照合0件成功、過去のTEST ONLY履歴の表示。今回実削除は行っていない。
- ユーザー: 候補Previewで共有リンクの閲覧、解除後「共有リンクが無効か、有効期限が切れています。」を確認。
- ローカル: 共有モック16件、公開範囲ガード、型チェック、仮キーでビルド成功（前回実施）。今回コード変更なし。差分空白チェック成功。
- 環境: URL・Publishable KeyはAll Environments。Service Role KeyはProduction/Preview別登録だが値は同じとユーザー確認。Previewも本番と同じDBを使用する設定。秘密値は取得・記録していない。
- DB: estimate-images/project-filesともPrivate。関連8テーブルでRLS有効。
- DB: 提供CSVで所有案件の参照条件、管理者条件、Storageパス条件を確認。profiles.roleの一般利用者変更を拒否、挿入時customerに固定するトリガーの定義と有効状態Oを確認。
- DB: shares/holds/jobs/deletion_logsでanon/authenticatedのテーブル単位SELECT/INSERT/UPDATE/DELETEはfalse。service_roleにAPIが必要とする権限あり。共有token_hash UNIQUE、期限CHECK/型/NOT NULL、保留project_id PK、関連FK・使用列を確認。

## 確認の限界
- 本番ドメイン上でVercelログインなしの共有閲覧は公開後確認。本番の保護設定は未確認。保護設定を無断変更しない。
- 対象ありのStorage個別照合は未確認。これは削除許可を保証しない。対象が発生した際、手動削除前に確認し、実案件の日付をテスト用に変更しない。
- 他顧客で案件画面が非表示となる確認は以前のPreview。直接Storageアクセス拒否・role変更拒否の実リクエスト試験、is_admin関数本文の確認は未実施。メタデータ確認と区別する。
- 非対応形式すべての試験は未実施。共有無効化後も既発行の署名URLは最大60秒有効。保存済みファイルは回収不可。

## 承認後の反映手順
1. 反映直前にmainと候補SHAを再確認。変化した場合は再レビュー。
2. Vercelで現在の正常なProductionデプロイID・コミット・ドメインを記録。Gitのmain SHAだけで稼働版を断定しない。
3. 下記戻し先をPreviewで起動し、ログイン・案件表示・通常ダウンロードを確認。まだ実機確認済みではない。
4. ユーザーの明示承認後、確認済み候補だけをmainに反映。過去開発履歴の一括マージ、SQL一括適用はしない。
5. ai-estimate-rwxrのProductionが承認コードで成功したことを確認し、本番ログイン・案件表示・プレビューを確認。
6. テストファイルで共有リンク発行、Vercel/CS Works未ログインでの閲覧、解除後無効を確認。保管一覧も確認。
7. 問題があれば公開継続を止め、以下の切り戻しを判断する。

## 切り戻し
- 機能を戻しても依存更新を維持する候補をmain=4eda907から別途作成。package.json/package-lock.jsonだけ公開候補の内容とする。
- ローカルブランチ: rollback/dependencies-only-20261026。ビルド結果・SHAは末尾へ記録。
- Vercelへ未配置のコミットは即時Rollback先として選べない。事前にPreviewデプロイと正常動作確認が必要。
- 事前確認した戻し先をProductionへ反映する。旧Productionへの緊急Rollbackは依存更新も戻るため、恒久対応にしない。
- DB、Storage、共有レコード、保留設定、SMTP設定はアプリ切り戻しで元に戻らない。削除しない。
- 戻し先には新しい共有ルートがないため、新しい共有リンクは使えなくなる。既発行のStorage署名URLは有効期限まで残り得る。

## 現時点の次の一手
現在のProductionデプロイ情報を記録し、戻し先のPreview確認を完了してから、具体的な反映対象を提示して本番承認を得る。

## 戻し先のローカル検証結果
- SHA: 47f659db569de4819ae66b9da0387058d4f1b376
- mainとの差分はpackage.json/package-lock.jsonの2ファイルのみ。
- Next.js 15.5.28で本番ビルド成功（型検証含む）。Resend/OpenAIは仮キーで、外部サービス実動作は未検証。
- Preview実機確認は未完了。ビルド生成のnext-env.d.ts変更はコミット対象外。

## GitHub保存結果
戻し先リモートSHA: 5851045a35eda0ea73765d056041c02e977e7e1d。GitHub連携による順次更新でSHAは異なるが、2ファイルのblob SHAはローカル検証版と一致。
戻し先Preview: https://vercel.com/create-support/ai-estimate-rwxr/ETbNTBw9DJddNVMsQsyBEaSreUbn
main/Production変更なし。
