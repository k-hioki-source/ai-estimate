# 正式見積り明細：第1段階の実装・検証記録

2026-10-26 / 開発ブランチ `feature/formal-quote-items-20261026`。
**本番未反映、DB未適用、機能は既定無効。イラスト別制作・承認の第2段階は未実装。**

## 合意した業務フローと今回の範囲

AI概算は代表1点の価格×点数という入り口。現在のAI計算は変更しない。
正式見積りは管理者が1行=1イラストとして個別に作成し、金額/点数を概算へ同期しない。
この段階では正式明細・下書き保存・提示版の保存・採用版を指定した発注・帳票明細までを実装。
発注後の明細から制作対象を生成し、点ごとの確認/修正/承認へ接続するのは次段階。
したがって、このブランチは専用DB/Previewで見積り～発注の受け入れ試験を行う候補であり、全体機能の本番公開候補ではない。

## 実装

- 正式見積り前の管理者画面で「イラストごとの明細で見積もる」を明示選択。従来案件を自動変換しない。
- 各点の番号・名前・制作内容/備考・税抜金額・工数、案件全体の納期を登録。
- 最大200点、整数円、工数は小数第2位まで。税抜合計上限18億円（既存int4税込額の範囲内）。
- 下書きは管理者だけ閲覧可能。編集版番号で競合検出。失敗しても画面の入力値を保持する。
- 提示済み明細は上書きせず改訂。番号/名称/金額/工数/納期/案件名/制作内容/顧客宛先をその時点で保存。
- 顧客は表示した提示版IDで発注。古い版や二重発注はDBで拒否。同じ操作IDの再送は結果を再利用する。
- 既存 `order_project(uuid)` を同じユーザーのトランザクション内で呼び、ORD採番・顧客スナップショット・10%切り捨て税計算は維持。
- 既存納品/請求関数も変更せず、帳票作成トリガーで採用見積版を紐付け、金額・税・工数・納期の一致を検証する。
- 見積書/発注書/納品書/請求書に固定明細を表示。旧見積書は `quote?quoteId=<対象ID>` で閲覧。明細取得中/失敗時は画面の印刷ボタンを無効にする。
- 新方式の案件で、従来RPCやprojects直接更新から見積額/納期変更・発注を迂回できないようDBトリガーで検証。
- 新テーブルは認証済みSELECTのみ。書き込みはユーザーJWTを使う検証付きRPCだけ許可。APIはservice_roleキーを使用しない。
- 既存通知基盤を継続利用。確定済み操作の再送で通知を重ねない。メール送信自体はDBトランザクション外であり、失敗時の自動再送/配送保証は本変更に含まない。

## DBと適用対象の区別

追加migration: `supabase/migrations/20261026140000_formal_quote_items.sql`。
新規project_quotes/project_quote_items、projectsと3帳票へのformal_quote_id、権限/検証付きRPCと整合性トリガーを追加する。
旧画像赤入れmigrationは書き換えていない。既存レコードの更新/補完/削除は含めない。
本番の関数定義はユーザー提供のメタデータCSVと照合済み。ただし、このmigrationを本番へ適用する操作は承認・実施していない。
テストfixtureはテーブル列・制約・RLSと提供された既存関数を利用し、架空のユーザー/案件だけを生成する。銀行初期値は架空値へ置換している。

## 実行したローカル検証

- TypeScriptチェック：成功。
- Next.jsビルド：新機能フラグON/OFFで成功（Resend/OpenAIは無効なテスト値）。
- `scripts/test-formal-quotes-api.cjs`：19項目成功。実APIハンドラー、認証クライアントはモック。
- `scripts/test-formal-quotes-db.cjs`：37項目成功。PGlite上で提供された既存関数と追加migrationを実行。下書き非公開、別顧客拒否、旧版拒否、再送、税/帳票、宛先固定、従来赤入れとの併存を検証。
- `scripts/test-formal-quotes-browser.cjs`：10項目成功。実React部品、ローカルの架空認証/API。下書き保存/再表示、2点の個別価格、提示、競合時の入力保持、390px幅、確定後閲覧専用、明細取得失敗、フラグOFFを確認。日本語フォントを使う画像も目視確認。
- `scripts/test-formal-quotes-test-setup.cjs`：7項目成功。以前の検証DB構成からのアップグレード、ガード、従来テスト案件維持、発注を検証。
- 既存画像赤入れAPI 17項目、DB 31項目、共有モック16項目、保管機能の公開範囲ガード：成功。
- 実Supabase/Vercelでの受け入れ、実通知メール、全ページを通した操作、実複数端末の競合は未確認。ローカル試験を実環境RLSの保証とみなさない。

## 専用テスト環境の次の手順

1. Supabaseで **cs-works-test / jjiebuuasaimaqemhiua** を開く。本番cs-worksを選ばない。
2. `docs/sql/csworks-formal-quotes-test-setup.sql` 全文をSQL Editorで実行する。
   - 既存の赤入れ専用テスト環境マーカー、3テストアカウント、空の帳票テーブルが必要。
   - 空の架空帳票テーブルへ不足列/制約/既存帳票関数を追加し、新migrationとTEST-QUOTE-A/Bを準備する。
   - 過去の赤入れテスト案件・画像は変更/削除しない。顧客データや本番設定はコピーしない。
   - ガードで止まった場合は、実行先と結果を確認する。ガード削除・テーブル削除・行削除で回避しない。
   - 正常時は `FORMAL_QUOTE_TEST_READY`。再実行不可。
3. Vercelのこの開発ブランチだけにPreview設定を用意する。
   - `NEXT_PUBLIC_SUPABASE_URL` = 専用テストURL。
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` = 専用テスト側のキー。秘密値を会話/ログへ出さない。
   - `RESEND_API_KEY` = `re_test_disabled_for_annotation_validation`。
   - `OPENAI_API_KEY` = `sk_test_disabled_for_annotation_validation`。
   - `NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES` = `true`。
   - 赤入れの回帰確認をする場合は `NEXT_PUBLIC_CSWORKS_IMAGE_ANNOTATIONS=true` もこのブランチだけ設定。
   - 以前の赤入れブランチに限定した上書き設定は、新ブランチへ自動で引き継がれない。Productionや通常Preview全体の設定は変更しない。
4. Previewを再デプロイしてReadyを確認。管理者でTEST-QUOTE-Aを開き、明細2〜3点を登録→下書き→提示。
5. `csworks-customer@example.com` で明細と帳票を確認→発注。管理者画面で受注後の明細固定と発注書を確認。
6. 別顧客 `csworks-other@example.com` でA案件の非表示を確認。別点数/改訂版の試験はB案件または別の架空案件で行う。発注済みをDBで戻さない。

下書き段階でブラウザを閉じる際は未保存警告が出る。画面内遷移を含む全離脱パターンの保護は未検証なので、別画面へ移る前に下書き保存する。

## 変更ファイル一覧

既存:
- app/admin/projects/[id]/page.tsx
- app/mypage/projects/[id]/page.tsx
- app/mypage/projects/[id]/quote/page.tsx
- app/mypage/projects/[id]/order/page.tsx
- app/mypage/projects/[id]/delivery/page.tsx
- app/mypage/projects/[id]/invoice/page.tsx
- lib/supabase/database.types.ts
- docs/CS_WORKS_HANDOFF.md

新規:
- app/api/cs-works/formal-quotes/route.ts
- components/cs-works/FormalQuoteEditor.tsx
- components/cs-works/FormalQuoteDetails.tsx
- lib/cs-works/formal-quotes.ts
- lib/cs-works/formal-quotes-client.ts
- supabase/migrations/20261026140000_formal_quote_items.sql
- scripts/fixtures/csworks-formal-quotes-existing.sql
- scripts/test-formal-quotes-api.cjs
- scripts/test-formal-quotes-db.cjs
- scripts/test-formal-quotes-browser.cjs
- scripts/build-formal-quote-test-setup.cjs
- scripts/test-formal-quotes-test-setup.cjs
- docs/sql/csworks-formal-quotes-test-setup.sql
- docs/CS_WORKS_FORMAL_QUOTE_ITEMS.md

package.json/package-lock.json/vercel.json、AI見積り計算、既存通知API/メール文面は変更していない。
