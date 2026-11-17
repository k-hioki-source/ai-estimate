# 初回お試しクーポン 実装・検証報告

## 状態
PR #17 の専用ブランチに実装。本番へのマージ・DB適用・有効化は未実施。
GitHub ActionsでNext.jsビルド、型チェック、計算テスト、隔離PostgreSQLでのDB回帰・同時実行テストを実行。
実際のSupabaseテスト環境は接続タイムアウトのため検証できず、Illustrator等の既存制作フローを含む実運用全体とResendの実配信は別途確認が必要。
クーポン用画面・APIは NEXT_PUBLIC_CSWORKS_TRIAL_COUPON=true になるまで無効。公開バッジ・登録案内・説明・FAQは、さらにDBの付与設定が有効かつ付与可能な場合だけ表示し、準備中の誤案内を防ぐ。

## 最終CI結果
コード検証対象コミット: 28073bc969dc9247094796c0cd90b2ad60013050
GitHub Actions: https://github.com/k-hioki-source/ai-estimate/actions/runs/43994404976
- buildジョブ成功：計算12件、型チェック、本番ビルド、Chromium画面スモーク。
- databaseジョブ成功：付与/適用/消込/0円納品/請求抑止/月次出力/権限/設定の回帰、複数接続での同時実行。

## 確定ルール
- 会社名はNFKC、英字小文字化、空白除去、株式会社/有限会社/合同会社と略記の吸収で同一判定。
- 付与はメール確認による登録完了時。既存会員への遡及付与はしない。管理者は対象外。
- 会社名は登録フォームで収集し、初回登録のプロフィールへ保存。権限・認証にはuser_metadataを使わない。
- 会員・会社キーの両方に一意制約。過去のCS Works発注履歴も会員/会社名で照合。
- 正式見積りは税抜3,000円以上。初回クーポンをデフォルト適用予定として表示。
- 先に発注が確定した案件で消費し、取消・返却・分割・繰越はなし。
- 同時発注は設定行/会員行のロックで直列化し、適用は1件のみ。
- 他案件の未発注見積りは値引きを外して再計算。画面の旧金額/版での発注は409になり、更新額を確認して再操作する。
- 初回クーポンを優先。現状他割引の入力はなく、負の制作明細は既存DBとAPIで拒否。計算関数も他割引併用を拒否。
- 税抜値引後に10%課税、端数は既存処理に合わせて切捨て。
- 全額適用は「クーポン適用・0円納品」。納品後は完了にし、請求書のINSERT/UPDATEをDBで拒否。
- 月次：登録完了月の新規会員数、付与月、発注確定月の利用数（全額/一部）、納品月の値引後税抜売上。継続売上は別集計。
- 利用会員ごとの2回目発注の有無と、その会員群の集計時点の再発注数を表示。
- 上限数と有効期限はDBパラメータ。初期値はすべてNULL（制限なし）。

## 仕様対応
| 仕様 | 実装 |
| --- | --- |
| 1 自動付与 | 認証完了トリガー、会員/会社の一意制約、発注履歴除外 |
| 2 表示 | 登録完了メール送信キュー、認証後の送信、既存日次Cronで再試行、マイページ通知 |
| 3 自動適用 | DB正式見積り保存時の自動値引き、見積/請求等の共通明細へ負のクーポン行 |
| 3 初回消費 | 金額/版の確認付き発注RPC、DBロック、リトライの冪等性 |
| 3 0円処理 | 納品時自動完了、明細・顧客/管理者画面・納品メールの0円表示、請求書抑止 |
| 4 記録 | 正式見積りのgross_subtotal/coupon_discount_amount/coupon_application、付与/消費履歴 |
| 4 集計 | 管理者 /admin/coupons、月次CSV、利用会員の再発注有無 |
| 5 設定 | trial_coupon_settingsのgrant_limit/redemption_limit/expires_at |
| サイト | ヒーロー下、登録案内、説明、FAQの指定文言 |

## 変更画面とファイル
### 公開・登録・マイページ
- components/EstimateForm.tsx
- components/cs-works/TrialCoupon.tsx
- components/cs-works/TrialCouponAccount.tsx
- app/signup/page.tsx
- app/mypage/page.tsx
- app/layout.tsx

### 正式見積り・発注・納品・請求書
- components/cs-works/FormalQuoteEditor.tsx
- components/cs-works/FormalQuoteDetails.tsx（見積書/発注書/納品書/請求書で共有）
- app/mypage/projects/[id]/page.tsx
- app/admin/projects/[id]/page.tsx
- app/api/cs-works/formal-quotes/route.ts
- app/api/cs-works/notify/route.ts
- lib/cs-works/formal-quotes.ts
- lib/email.ts

### クーポン・集計・DB・検証
- app/admin/page.tsx
- app/admin/coupons/page.tsx
- app/api/cs-works/trial-coupon/route.ts
- app/api/cs-works/payment-reminder/route.ts
- lib/cs-works/trial-coupon.mjs / trial-coupon.d.mts / trial-coupon-client.ts / trial-coupon-mail.ts
- docs/sql/first-order-trial-coupon.sql（レビュー用の一括トランザクションSQL）
- scripts/trial-coupon.test.mjs
- scripts/trial-coupon-fixture.sql
- scripts/trial-coupon.test.sql
- scripts/trial-coupon-concurrency.mjs
- scripts/trial-coupon-ui-smoke.mjs
- .github/workflows/trial-coupon.yml

## 検証
- 計算12件：3,000円までの0円下限、10,000円→7,700円、不正入力、他割引の拒否等。
- DB：未認証には付与しない、確認後1枚、会社重複/再処理/既存会員/発注済みの除外。
- DB：上限・期限パラメータ、メールキューの重複取得抑止。
- DB：自動適用、0円発注、利用確定、残り見積りの値引解除、旧価格の発注拒否、再利用拒否、冪等性。
- DB：0円納品で自動完了、請求書発行拒否、顧客の他会員参照/付与変更/管理者集計へのアクセス拒否。
- DB：全額/一部利用、税抜初回売上、継続売上、再発注有無の月次出力。
- 別接続による実同時実行：同一会社の認証完了2件で付与1枚、案件2件の発注で割引1件、敗者は金額確認後に通常金額で発注。
- 型チェック・本番ビルド。
- Chromiumの公開ページ確認と未認証API拒否のスモークテストをCIに追加。
- 既存料金/軽微な修正/NDAに関する元の行10件が変更後にも残ることを差分確認。

隔離DBでは既存のイラスト明細生成処理をスタブ化。実SupabaseのAuth/Storage/メール配信・全制作フローのE2Eテストではない。
登録完了メールは認証後に画面へ戻った時点でキューを送信し、失敗/未訪問時は既存日次Cronで再試行する。

## 本番反映手順
1. 機能フラグを無効のまま、稼働DBの既存関数との差分とこのSQLを確認。
2. 到達可能なSupabaseテスト環境でSQLを適用し、既存制作/納品/請求フローと登録メール実配信を確認。
3. 本番へSQLを適用（設定enabledは初期false）。このSQLは既存の同名オブジェクトがない初回適用用。
4. PRをマージし、Vercelに NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES=true と NEXT_PUBLIC_CSWORKS_TRIAL_COUPON=true を設定して再デプロイ。
5. 動作確認後、trial_coupon_settingsのenabled=true、starts_at=clock_timestamp()を設定。上限・期限はNULLを維持。
6. 公開画面の文言、登録完了→付与→正式見積り→発注、0円納品、管理者月次CSVを最終確認。

付与開始後に新規付与を止める場合はDBのenabled=falseを使い、既存クーポンの発注処理は維持する。機能フラグをオフに戻すと利用中の案件の発注を止めるため注意。
未使用クーポンがある状態でテーブルを削除しない。消費履歴と確定書類は保持する。

## 確認事項
会話で業務ルールはすべて確定済み。新しい仕様判断の質問なし。
未確認事項は実環境での接続/実配信/制作フロー通し確認と、本番への反映・有効化。
