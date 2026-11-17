# 本番反映の状況（2026-11-17）

## 完了
- バナーを含む実装と自動テスト：PR #17。GitHub Actions 44003046962 成功。
- PR #17をmainへ統合済み（2c2f2ad227a36e701e1638281083612ec6963f70）。Vercel ai-estimate-rwxr / ai-estimate-qieqのデプロイ成功。
- Vercelの会社アカウント・create-supportチームの接続を復旧。NEXT_PUBLIC_CSWORKS_TRIAL_COUPON=trueをProductionに設定。
- 再デプロイ dpl_HWFcKEbTACF5BVx8rkv69bhLmYXS がREADY、独自ドメインへの割当成功。
- 公開APIの active=false を確認後、DBを有効化。active=trueとブラウザーでのバナー・案内文・FAQ・説明文の表示を確認。
- 本番DBへ first_order_trial_coupon を適用済み。
- 本番の既存処理で、認証確認→付与→正式見積り→0円発注→実際のイラスト明細生成→消費→別案件の再計算→旧価格の発注拒否→2回目発注→月次RPCを確認。
- 上記確認は1トランザクション内で実施し、全件ロールバック。確認後の付与数・メールキューは0件。
- 既存正式見積りAPIが公開環境で401を返すことを確認（既存機能は有効）。

## 現在の設定
- 新規付与：有効（trial_coupon_settings.enabled=true）。開始：2026-11-17 15:13:32 JST。
- 上限・期限：すべてNULL（制限なし）。
- 登録完了メール実配信：未確認。
- 本番の実ファイルを用いた納品・請求までの画面通し確認：未実施。隔離DBの0円納品・請求書拒否テストは成功。

## 残作業
- 登録完了メールの実配信と、実ファイルを使った納品・請求までの画面通し確認。
- 新規登録・正式見積り・初回発注・0円納品・月次CSVの本番画面を通した確認（DBと隔離環境の自動テストは成功済み）。

メールの実配信は未確認だが、ProductionにRESEND_API_KEY・FROM_EMAIL・SUPABASE_SERVICE_ROLE_KEYの設定が存在することを値を取得せず確認した。既存会員への遡及付与はしていない。

## DB変更と復旧
本番へ追加したもの：設定・付与履歴・メールキューの3テーブル、正式見積りの値引き情報、案件の0円納品区分、登録/発注/納品の関連トリガーとRPC。
既存の csworks_save_quote / csworks_order_quote / deliver_project を更新。

反映前の関数定義から作成した復旧案：
docs/sql/first-order-trial-coupon-rollback.sql
復旧案は未実行で、付与履歴が1件でもあれば停止する。付与済みの権利や確定書類は消さない。
本番データが発生した後は、権利と履歴を保持する修正を検討する。
