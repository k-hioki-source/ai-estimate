# 複数枚対応：本番反映準備

2026-10-27。ユーザーが「実装しましょう」と本番反映の進行を承認。
この承認後に準備を開始したが、本番DB適用・mainマージ・Productionデプロイ・フラグ有効化はまだ行っていない。

## 現在の候補と確認済み範囲

- GitHub: `k-hioki-source/ai-estimate` / Draft PR #3 / `feature/formal-quote-items-20261026`。
- 実装候補: `859d86afe010e64ebbee32b085228eb2df65523a`（この後の確認SQL/記録コミットはアプリを変更しない）。
- 比較したmain: `fe62df8bc32ef2f9091f98f1755ce0513de4f512`。2026-10-27照合で候補が7コミット先、main側の独自変更なし。
- 対象Vercel: **ai-estimate-rwxr / create-support**。本番URL: `https://estimate.create-support.co.jp/`。
- 本番Supabase: **cs-works / tnswnyegvepundtepfqn**。テストDB **cs-works-test / jjiebuuasaimaqemhiua** と区別する。

ユーザーが専用テストDB/Previewで、正式見積り・発注、点ごとの承認/修正・第2稿・全点承認、過去履歴の固定、納品ファイルの突合せ・納品、顧客ZIP、請求書発行依頼・請求書の2点明細/税込9900円、入金確認・完了まで確認済み。
テストDBの請求書依頼関数が不足し、専用の互換関数を補完して確認した。本番関数は後段のメタデータで照合し、実定義による回帰検証も完了。納品書そのものの2点明細/税込9900円は、ユーザーから明示確認を得ていないため、請求書確認と混同しない。
実際の通知メール送信はテスト用の無効キーで抑止していたため、配送の受け入れ確認には含めない。ZIPはブラウザー生成、合計200MBまで。

## 最初に必要な本番メタデータ

`docs/sql/csworks-multi-illustration-production-preflight.sql` を本番cs-worksのSQL Editorで実行し、結果CSVを受領する。
SELECTだけで、顧客行・秘密キーを取得せず、DBを変更しない。請求書依頼を含む既存の発注/納品/請求関数の本文・戻り値・権限、テーブル/制約/トリガー/RLS、Storageポリシー、追加機能の未適用/適用状況を返す。
前回の正式見積り確認SQLは request_project_invoice の本文を拾えていなかったため、今回は関数名を明示する。
受領後、既存関数が新しい案件状態ガードと両立するか、`.single()`で1行を受け取れるか、請求依頼時の副作用を維持できるかを検証する。互換実装を本番へ代用して上書きしない。

## 反映順序

1. 上記メタデータを照合する。既存定義との差異があれば候補と検証fixtureを更新して必要な回帰検証を行う。
2. 次の**3つだけ**を一つのトランザクションへまとめた本番用SQLを用意する。すでに本番公開済みの画像赤入れmigrationを再適用しない。対象環境・未適用・前提定義のガードを付ける。
   - `supabase/migrations/20261026140000_formal_quote_items.sql`
   - `supabase/migrations/20261027010000_illustration_workflow.sql`
   - `supabase/migrations/20261027020000_illustration_delivery.sql`
3. 本番cs-worksで追加SQLを適用し、テーブル・関数・権限・既存案件が維持されていることを読み取りで確認する。既存案件の自動変換・テスト行の作成・顧客データのコピーは行わない。
4. 反映直前のmainと候補SHAを再確認し、Draft PRをレビュー可能へ変更してmainへマージ。対象VercelのProduction Readyを確認する。
5. **Productionだけ**に次のConfigをまとめて追加し、Productionを再デプロイする。これらはNext.jsのビルド時フラグなので、保存だけで完了しない。
   - `NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES=true`
   - `NEXT_PUBLIC_CSWORKS_ILLUSTRATION_WORKFLOW=true`
   - `NEXT_PUBLIC_CSWORKS_ILLUSTRATION_DELIVERY=true`
6. 本番の管理者/顧客ログイン、従来案件の表示と帳票/共有、管理者の新方式選択欄、新APIの認証境界を確認する。実案件をテストのために発注・納品・入金処理しない。新方式の実案件利用は通常の受注操作として行う。

既存 `NEXT_PUBLIC_CSWORKS_IMAGE_ANNOTATIONS=true` は維持する。本番のSupabase URL/公開キー/service_role、Resend、OpenAIなど既存設定はそのままにする。**テストPreviewの9変数を本番へコピーしない。** Previewブランチのテスト接続先と無効メールキーは引き続きテスト専用。
Vercelが複数プロジェクトのCIを出すため、対象 ai-estimate-rwxr の結果を識別する。他プロジェクトの成功や全CI成功を未確認のまま断定しない。

## 復旧時の扱い

DBに作った見積り・稿・確認履歴・納品対応表は保持する。新テーブルのDROPや元に戻すための顧客データ更新を行わない。
有効化前なら新フラグをOFFのままにして従来案件を継続できる。新方式で発注・確認した後にフラグをOFFにすると当該案件の操作は利用不可となり、従来の案件単位操作へは切り替わらない。新方式データ作成後のアプリ切り戻しはこの影響を考慮し、原則として不具合修正を先へ適用する。
アプリの切り戻しだけでは追加SQLや環境変数は戻らない。既存正常デプロイのID/SHAを反映前に記録し、不要な設定変更を混ぜない。

## まだ行っていないこと

本番用SQLの実環境への適用、PRマージ、Productionフラグ設定、有効化後確認。
メタデータの受領・照合と本番用SQLの作成/ローカル検証は後段のとおり完了。

## 本番メタデータの照合完了（2026-10-27）

ユーザー提供の `Supabase Snippet Untitled query(8).csv`（353行、顧客行なし）を確認した。テストマーカーはなく、旧画像赤入れの3テーブルは存在し、見積り/点別制作/最終納品の新テーブルは未作成。
order_project、deliver_project、complete_project、confirm_project_payment、approve_project、request_project_revision、is_admin の本文は従来fixtureと一致した。
本番request_project_invoiceは `RETURNS projects` のSECURITY DEFINER・search_path=public、所有者=auth.uidをFOR UPDATEで取得し、deliveredからinvoice_requestedへ更新して1案件を返す。authenticatedだけに実行権限がある。テスト互換版とは異なり、再実行の冪等応答や新規メッセージ挿入は行わない。この既存動作を維持し、関数の置換はしない。
本番関数とproject-files用Storageポリシーのメタデータだけをfixtureへ追加。銀行初期値や顧客データは追加していない。

- `CSWORKS_PRODUCTION_INVOICE_FIXTURE=true node scripts/test-illustration-delivery-db.cjs`: 本番の依頼RPCを使って、新しい見積り→点別確認→納品→請求依頼→請求→入金まで63項目成功。再依頼拒否も本番定義どおり検証。
- `node scripts/test-multi-illustration-production-setup.cjs`: 本番用bundle10項目成功。確認中の赤入れと完了済み帳票を持つ架空の従来案件を配置し、データ維持・旧レビュー継続・旧納品の本人閲覧/別顧客拒否を検証。関数差異・テストDB・再実行の拒否も確認。

本番用SQL: `docs/sql/csworks-multi-illustration-production-setup.sql`。
生成元: `scripts/build-multi-illustration-production-setup.cjs`。先述の追加3migrationだけを1トランザクションに統合し、旧赤入れmigration・テスト用関数/行を含めない。
確認済み既存10関数の本文ハッシュ、既存の前提テーブル・赤入れ制約、新テーブル未適用、テストマーカー不在、請求依頼の権限を確認してから追加する。確認後に関数が変わっていれば停止し、再照合する。lock_timeout=5秒、statement_timeout=120秒。成功時は `MULTI_ILLUSTRATION_PRODUCTION_READY`。
SQLの実行先は本番cs-works / tnswnyegvepundtepfqn。すでに一部適用済みやガードで停止した場合は、削除やガード除去で進めず、結果を確認する。適用後のコード反映と3フラグのProduction有効化はまだ未実施。
