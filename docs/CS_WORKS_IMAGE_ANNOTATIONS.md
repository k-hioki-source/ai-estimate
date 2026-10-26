# 画像の修正指示・赤入れ：第1段階

2026-10-26。開発ブランチ `feature/image-annotations-20261026`。
基点mainは `919453b0b8a04e57bd6fc82a47e0a53c10b28a48`。
本番のプレビュー・共有・ダウンロードは既に公開・ユーザー確認済み。今回の赤入れは未公開。

## 実装と利用手順

既存の確認工程、案件ステータス、04の確認履歴を使用する。
1. 管理者は確認用ファイルをアップロードし、今回確認を依頼するファイルにチェックして、既存の「お客様確認へ進める」を押す。新規アップロードはチェック済みになる。
2. 顧客は確認用PNG/JPEGの「修正指示モード」を開く。通常プレビュー内からも開ける。
3. コメントピン・赤ペン・取り消し・選択線削除・全線削除・コメント編集/削除・拡縮を使う。
4. 「下書き保存」で保存する。保存だけでは案件状態は変わらずメールも送信しない。
5. 案件画面の既存「修正を依頼する」で、既存のテキストコメントと画像修正指示を一緒に送信する。
6. 既存の04確認履歴にファイルごとの修正指示閲覧ボタンが表示される。管理者・顧客とも送信後は閲覧専用。

元画像、共有トークン、ダウンロード、PDFプレビューを維持する。PDF/GIF/WebPの赤入れは提供しない。画像判定はPNG/JPEG MIME（MIMEなしの場合は拡張子）で行う。
公開共有リンクに修正指示を公開しない。管理者は閲覧のみ。顧客はprojects.user_idが自分の案件の現在の確認回だけ編集できる。部署・会社名ではなく既存の案件所有権を再利用する。

## データと既存ワークフローの接続

- `project_review_batches`: 案件の確認回。状態open / revision_request / approval / closed、既存project_messagesへの参照、再送キー。
- `project_review_batch_files`: 確認回と対象ファイルIDを固定。過去のファイルを今回の確認対象へ自動混入させない。
- `project_file_annotations`: 確認回＋ファイルIDで一意。バージョン、作成者、JSON文書、確定日時。
- JSONはschemaVersion=1、pins（id、number、x、y、comment）、strokes（id、points）。x/yは0〜1の画像内座標。画像とSVGは同じ寸法で描画し、表示倍率・スクロール位置から座標を逆算する。
- 保存は楽観ロック。全変更操作はproject→確認回→赤入れの順でロックする。
- `csworks_start_review` は管理者権限を検証して選択ファイルを固定し、既存customer_reviewへ進める。既存のreview_requested通知を画面側から送信する。
- `csworks_save_annotations` は所有者・現在状態・対象ファイル種別・確認回・保存バージョン・JSON容量/座標/件数を検証する。
- `csworks_submit_review` は既存履歴insert＋既存request_project_revision/approve_project呼び出し＋赤入れ確定を1トランザクションにまとめる。既存関数本文は置き換えない。
- 案件状態変更トリガーで、旧画面・既存RPC経由でも確認回を閉じる。再度customer_reviewになっても過去の赤入れを再編集させない。
- 旧画面からの状態遷移は、まだ確認回に含まれていないreview/revisionファイルだけを対象にする。既存画面から送られた履歴は新しい確認回への自動関連付けを保証しない（新画面の原子的送信を利用する）。
- 送信はrequest_idで重複防止。応答不明の再試行は既存履歴を返す。再試行時のメール重複送信は避けるが、メール送信済みか不明な場合は管理者へ確認する。永続通知キューは今回追加しない。
- 承認時に赤入れの下書きがある場合は拒否し、空にして保存するよう案内する。未保存内容がある場合も送信を止める。
- 顧客の新規テーブル直接INSERT/UPDATE/DELETEは許可せず、検証付きRPCだけを許可。RLSで所有者または管理者のSELECTのみ許可。
- 匿名・service_roleに新規テーブルの書き込みや操作RPCを許可しない。APIはユーザーJWTを使い、サービスキーを使用しない。
- 100ピン、200ストローク、1線2000点/合計20000点、コメント2000文字、文書2MB以内。APIとDB両方で検証。
- 読み出しは最大100確認回。PostgRESTの件数制限で一部しか取得できない場合はエラーにし、不完全な履歴を表示しない。
- 将来の案件メッセージ連携はmessage_idで拡張可能。画像へのコメントごとに案件メッセージを増やすことはしない。

## DB適用前に必要な確認（未実施）

`docs/sql/csworks-annotations-preflight.sql` は定義・メタデータだけを読むSELECT。
既存2RPC本文はユーザー提供CSVで確認済み。project_messagesの型/デフォルトとprojectsトリガーは追加CSVで照合済み。未提供の制約/RLSと専用検証DBでの結合試験は残る。
SQLは `supabase/migrations/20261026_image_annotations.sql` に草案を保存。実DBには適用していない。
特に既存RPCが別のメッセージを追加しないか、必須引数・返却・追加副作用、sendertypeデフォルト、トリガーとの干渉を確認する。異なる場合は草案を修正してから再検証する。

過去稿と参照関係の保持のためファイル・案件・メッセージのFKはON DELETE RESTRICT。手動保管整理でこれらを消す場合は参照と保存方針を先に確認する。無断のCASCADE削除を追加しない。
既存のcustomer_review案件は無断でバックフィルしない。検証環境で、管理者が今回の確認対象を選び「確認対象を設定して確認依頼を再送」を実行する。進行中案件への適用は個別に判断する。

## 有効化と検証環境

初期状態は無効。`NEXT_PUBLIC_CSWORKS_IMAGE_ANNOTATIONS=true` を設定してビルドした環境だけ表示/API受付する。
無効時は新規APIが404を返し、新規DBに接続せず従来の修正依頼・承認を維持する。
有効時にDB設定がない場合は503で停止し、従来の送信処理へ自動フォールバックしない。

現行Previewは本番と同じSupabaseを利用する。既存Previewでこのフラグを有効にして実データを更新しない。
専用の検証用Supabaseを用意し、読み取り専用の事前確認→SQLレビュー→明示承認後の適用→架空ユーザー・案件で試験する。
Vercelの本番環境、main、Production、本番DB設定は変更しない。

## 検証結果

- ローカルPostgreSQL互換PGlite: 31項目成功。所有権・RLS・管理者閲覧・確定後ロック・別稿分離・保存競合・原子的な失敗時ロールバック・再送。
- 実APIハンドラー＋認証モック: 17項目成功。認証、入力検証、実サイズ制限、機能無効、競合/権限エラー、DB不在、座標変換等。
- 実Reactコンポーネントをlocalhostで動かすブラウザ試験: 14項目成功。ピン・描画・取り消し・選択削除・保存・再表示・ズーム後の位置・未保存破棄確認・保存競合・閲覧専用・既存プレビュー/ダウンロード・狭幅画面。
- 既存共有モック16件成功。既存保管公開範囲ガード成功。
- 機能無効時の本番ビルド成功（仮OpenAI/Resendキー、実外部サービス未接続）。機能有効時の本番ビルドも成功。

PGliteではユーザー提供の既存RPC定義を変更せず、ユーザー提供の列定義・初期値・更新日時トリガーを再現したローカルスキーマへ読み込んで検証。失敗注入はテスト用トリガーで行う。実Supabaseの既存テーブルトリガー/RLS/通知メールの実証ではない。
ブラウザ試験は実UI＋テスト用認証/保存サーバーであり、実Supabase Auth/Storage/Vercelを結合した試験ではない。
別ユーザー・端末同時操作や、本物のタッチ端末、実メールは未確認。

テスト専用依存は本番package.jsonに追加しない。実行方法:
```
npm install --prefix /tmp/csworks-annotation-test @electric-sql/pglite esbuild @sparticuz/chromium @fontsource/noto-sans-jp
node scripts/test-image-annotations-db.cjs
node scripts/test-image-annotations-api.cjs
CSWORKS_CHROMIUM_PATH=/path/to/chromium node scripts/test-image-annotations-browser.cjs
node scripts/test-file-sharing.cjs
node scripts/test-retention-release.cjs
```
テスト用Chromiumバイナリは環境側で準備。UI試験は外部通信を遮断し、localhostだけで実行する。

## 変更ファイル一覧

| ファイル | 役割 |
|---|---|
| app/mypage/projects/[id]/page.tsx | 確認対象と赤入れ、既存修正依頼・承認への接続 |
| app/admin/projects/[id]/page.tsx | 確認対象選択、既存履歴からの閲覧 |
| components/cs-works/ProjectFilePreview.tsx | プレビュー内外の入口、既存機能維持 |
| components/cs-works/ProjectImageAnnotations.tsx | 画像上のピン・線・編集・拡縮・保存 |
| components/cs-works/ProjectReviewAnnotations.tsx | 確認回取得、閲覧ボタン、履歴・対象選択 |
| app/api/cs-works/image-annotations/route.ts | 認証、入力検証、取得・保存・確認結果送信 |
| lib/cs-works/image-annotations.ts | 文書型、画像判定、座標・入力検証 |
| lib/cs-works/image-annotations-client.ts | 認証付きAPI通信、未保存管理 |
| supabase/migrations/20261026_image_annotations.sql | 新規テーブル、RLS、トリガー、既存RPC連携の草案 |
| docs/sql/csworks-annotations-schema-check.sql | テーブル・トリガー・RLSを1つの結果で確認 |
| scripts/fixtures/csworks-existing-review-schema.sql | 提供された列定義・初期値・トリガーのローカル検証用再現 |
| scripts/fixtures/csworks-existing-review-functions.sql | ユーザー提供の既存RPC定義（ローカル検証専用） |
| docs/sql/csworks-annotations-preflight.sql | 既存実DB定義の読み取り専用確認 |
| scripts/test-image-annotations-db.cjs | 架空DBでの権限・ワークフロー検証 |
| scripts/test-image-annotations-api.cjs | API・入力・座標検証 |
| scripts/test-image-annotations-browser.cjs | 実UIのローカルブラウザ検証 |
| docs/CS_WORKS_HANDOFF.md | 最新の公開状態・開発状況 |
| docs/CS_WORKS_IMAGE_ANNOTATIONS.md | 本書：設計・運用・試験・未確認事項 |

既存の共有API・通知API・package.json・vercel.jsonは変更していない。
対象Vercel ai-estimate-rwxrで開発ブランチのPreviewビルド成功を確認済み。実DB未設定のため、赤入れ機能は無効のまま維持する。

## 既存RPC定義の照合（2026-10-26）
ユーザー提供CSVのapprove_project(uuid)とrequest_project_revision(uuid)は、いずれも単一のprojects行を返すSECURITY DEFINER関数。所有者とcustomer_reviewを検証し、approved/revisionへ変更する。修正依頼関数はupdated_atも更新する。関数内にメッセージ追加・メール送信はない。
追加SQLのPERFORM呼び出し・同一トランザクション化・既存履歴1件追加と整合する。既存RPC本文の変更は不要。
定義はscripts/fixtures/csworks-existing-review-functions.sqlに検証用として保存。これは適用用migrationではない。列・初期値・既存トリガーは後続の追加CSVで照合済み。未提供の制約/RLSと専用検証DBでの結合試験は残る。

次の読み取り確認にはdocs/sql/csworks-annotations-schema-check.sqlを使用する。複数SELECTの最後だけがCSV化されることを避け、1つの結果にまとめている。

## 列定義・トリガーの照合（2026-10-26）
追加CSVは35列とprojects_set_updated_atトリガー1件。ファイル・履歴・案件IDはuuid、status/message_type/sender_typeはtextで一致。project_messages.sender_typeはNOT NULL・既定値systemであるため、追加RPCから保存する修正依頼/承認メッセージはsender_type=customerを明示するよう修正した。既存メッセージの更新はしない。
既存projects_set_updated_atはBEFORE UPDATEでupdated_at=now()を設定する。新規AFTER UPDATEトリガーと役割は競合しない。提供された列・既定値・トリガーを再現し、提供された実RPC定義を用いてDB試験31項目が成功。承認・修正依頼の送信者がcustomerで保存されることも検証。
実DBのFK/CHECK/インデックス/RLSは当該CSVに含まれない。これらをすべて再現したとは主張しない。専用検証DBでのAuth/Storage/通知を含む結合試験は引き続き未実施。本番DB変更なし。
