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
テストDBの請求書依頼関数が不足し、専用の互換関数を補完して確認した。本番関数の実定義との照合は未完了。納品書そのものの2点明細/税込9900円は、ユーザーから明示確認を得ていないため、請求書確認と混同しない。
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

本番メタデータの受領、3段階の本番用SQLの確定/適用、PRマージ、Productionフラグ設定、有効化後確認。
現在は本番メタデータの提供待ち。これは再承認待ちではなく、互換性検証に必要な情報の取得待ち。
