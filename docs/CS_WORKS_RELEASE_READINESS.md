# CS Works 招待機能・本番適用準備

2026-11-01。結論：主要な手動受入は一区切り。本番適用は未実施。承認済みの本番DB読み取り照合と、ユーザー提示画面による設定確認を実施した。設定変更・mainマージ・本番デプロイ・メール送信は実行していない。以下の初期残件は末尾の確認結果で更新する。

## 対象差分

PR #5 https://github.com/k-hioki-source/ai-estimate/pull/5
本番基準 main d7373450006275d99b2b899e2edbe98fd9659d6e → Preview f196d884441e68350fbc5b54068d2c954e02db18（27ファイル、831追加/43削除）。
ローカル7bdd761はGitHubコミットf196d884と同一tree 4b8897d09daa125807b2ae5771983bfa7d8a84c4。API経由で公開したためcommit SHAのみ異なる。
Vercel ai-estimate-rwxr のデプロイ成功。GitHubに連携された他の6プロジェクトは失敗しており、この成功と混同しない。
PRはDraft。取得時mergeable=false。main/headの履歴上は直系の差分のため、これだけで競合と断定しない。公開時にGitHubのマージ可否・保護ルール・チェックの対象を確認する。

変更は管理者受付、本人確認付き招待承諾、見積り・資料の移行、アクセス保護、顧客資料の未確認通知、メッセージ強調。
承諾後は既存案件へ移行。ただし共通の既読・旧レビュー・旧発注・Storage削除も変更しているため、通常ラインに乗った事実だけで共通機能の安全性を保証しない。必要な回帰確認はこの変更箇所へ限定する。

## 確認できたこと

- 既存顧客：準備済み見積り付き招待→承諾→税抜9,000円/3時間の提示→発注。
- 新規顧客：Auth確認済み登録→招待承諾→見積りなし案件→管理者が3,000円/1時間を提示→顧客発注。
- 招待承諾と発注が別操作であること。
- 双方向メッセージ、顧客追加資料の管理者表示・プレビュー。
- 「新着・要対応」の資料通知、顧客メッセージ欄の強調表示。
- ローカル合成試験122項目の既存実行記録、実テストDBで模擬認証クレームを使った12項目（rollback）。実ログイン試験と区別する。
- 最新UIのTypeScript・ダミーキーでのNext.jsビルド、資料確認テーブルの管理者INSERT/SELECTと顧客拒否（rollback）。

通常工程の制作→修正→承認→納品→請求を、ユーザーに最初から再度手動実行してもらう予定はない。

## 公開前の残件（優先順）

1. **本番DB読み取り照合**：preflightで実RLS/権限/トリガー/RPC定義、旧方式の提示中見積り、保存先不整合を確認する。現在未実施。hardeningは旧提示中見積りに新しい管理者証跡を要求する。対象がある場合、管理者の条件確認・再提示計画なしに適用しない。件数・対象を確認するまで影響なしとは言えない。
2. **受付資料用Storage権限**：招待migration自体に未承諾受付のStorage INSERT/SELECT policyが含まれていない。テストでは専用互換SQLに追加済み。本番の既存管理者policyが対応するか調べ、必要なら本番定義に合わせた追加migrationを作る。テスト互換SQL全体の流用は禁止。bucket非公開と実50MB上限も確認（テストbucket個別上限はNULL）。
3. **変更した共通経路の限定回帰**：hardening適用とフラグ切替の不一致で既読・旧レビューが失敗しうる。旧レビューと現行レビューの接続、未承諾資料非公開、独立接続での同時承諾/編集競合を専用テスト環境で確認。全工程の手動再試験は不要。
4. **認証と招待実配送**：テストではlocalhostへ戻る初期設定不備があった。ユーザーが設定変更し登録・承諾成功。ただし変更後に新しく発行した確認メールの戻り先を通した再確認は未完了。本番Site URLと/invite許可、メール確認必須、Resend検証済み送信元を照合。招待はcaptureのみでsendの配送・失敗履歴は実環境未確認。承認された1宛先への限定配送で確認する。
5. **GitHub/Vercel**：PRのマージ可能状態とProduction対象を確認。複数Vercel連携の失敗を対象rwxrの成功と分ける。本番キー・URLはPreviewからコピーしない。

## 本番の設定候補（値の照合前・未設定）

| 設定 | 本番で必要な内容 |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | 本番 tnswnyegvepundtepfqn のURL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 同じ本番プロジェクトの公開キー |
| SUPABASE_SERVICE_ROLE_KEY | 同じ本番プロジェクトのサーバー専用秘密鍵 |
| NEXT_PUBLIC_CSWORKS_ACCESS_HARDENING | true（SQLと対応コードを揃える） |
| NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES | true（既存設定とDB前提を照合） |
| NEXT_PUBLIC_CSWORKS_INVITATIONS | 準備完了後true |
| CSWORKS_INVITATIONS_ENABLED | 準備完了後true |
| CSWORKS_INVITATIONS_MAIL_MODE | 限定検証時capture、実配送承認後send |
| CSWORKS_APP_ORIGIN | https://estimate.create-support.co.jp |
| RESEND_API_KEY | 本番有効キー。disabled-for-testをコピーしない |
| FROM_EMAIL | Resendで確認済みの送信元 |
| NOTIFY_TO_EMAIL | 通常の管理者通知先を照合 |
| Supabase Auth | 本番Site URL、https://estimate.create-support.co.jp/invite の許可、メール確認必須 |

NEXT_PUBLIC変数は変更後のビルドが必要。招待MAIL_MODE=captureは通常の発注・メッセージメールを止めない。

## 適用順と停止方法

1. 読み取り照合の結果を保存し、上記残件を解消。既存DBの復旧手段と移行対象を確認。
2. 本番変更の具体的対象を提示し承認を得る。
3. 旧クライアントが残る影響を含め切替時間を調整。単純にSQLだけ先に適用して長時間放置しない。
4. 前提schema確認後、hardening SQL → 招待SQL → 必要なら本番用Storage差分 → 資料確認SQLの順で適用。
5. 対応アプリ・本番フラグを揃えてProductionへ反映。管理者ログイン・既読・受付保存を限定確認後、承認宛先へ招待。
6. 異常時は招待UI/APIの2フラグを無効化し再ビルド。承諾済み案件は保持。hardeningだけfalseに戻さない。DB DROP・顧客データ削除による巻戻しは行わない。

SQLファイルはCREATE/関数renameを含むため無条件で再実行しない。テストDBはmigration履歴とファイルtimestampが異なり、資料確認SQLはexecute_sql適用のみ。適用済み実体を照合してから履歴を整える。

## 今回の範囲外

監査H-02/H-05/H-06全体と既存notify API全体のM-02は未解消。機能テスト成功を全システムのセキュリティ確認完了とは表現しない。

## 本番DB読み取り確認結果（2026-11-01、ユーザー承認後）

対象 tnswnyegvepundtepfqn。全照会はBEGIN READ ONLY / ROLLBACK。業務データ・設定の変更なし。

| 確認 | 結果 |
| --- | --- |
| 旧方式の提示中見積り（formal_quote_id NULL / quote_presented） | 0件。現時点で再提示対象なし。適用直前に再照会する |
| project_filesの案件UUIDとの不一致・不正パス | 0件 |
| project-files bucket | 非公開、52,428,800 bytes（50MiB）上限 |
| estimate-images bucket | 非公開、10MiB、JPEG/PNG/WebP |
| 招待前資料の管理者Storage INSERT/SELECT | 既存policyがbucketとis_admin()で許可。projects行の存在を要求しないため追加policy不要 |
| 顧客Storage SELECT | 案件所有者に限定。未承諾受付のproject行は未作成のため、この経路では読めない |
| 納品ファイル・Storage保護 | RESTRICTIVE policyを確認。既存保護を保持する |
| projects/messages/files/profiles RLS | 全て有効 |
| 管理者権限 | profiles.roleを参照。一般ユーザーのrole変更防止トリガーあり |
| 既存見積り・発注RPC | 対象シグネチャと定義を確認。新方式発注からorder_project呼び出しあり |
| 新規受付・招待・資料確認・旧見積証跡テーブル | 未作成（本番未適用と整合） |

前掲残件1・2のうち、提示中見積り、保存先整合、Storage権限とbucket上限は確認できた。テスト専用の互換SQLを本番へ適用する必要はない。

注意：読み取りによる定義照合であり、本番上で権限偽装・アップロード・発注・migrationの試行はしていない。全RPC・全権限の完全監査ではない。
既存4テーブルでanon/authenticatedにTRUNCATE/REFERENCES/TRIGGER権限が残っている。不要権限の整理候補として記録するが、RESTから直ちに実行可能という結論ではない。今回変更していない。

残る作業：共通経路の限定回帰・独立接続競合テスト、本番Auth戻り先/メール確認設定、Vercel本番環境変数、招待の限定実配送、公開時のGitHub/Vercelチェック確認。本番変更の承認はまだ得ていない。

## 限定回帰の再実行（2026-11-01）

- ローカルPGlite DB試験40項目成功（既存37＋追加3）、API試験10項目成功。実ネットワーク・メール送信なし。
- 追加3項目：旧方式案件の他顧客による修正拒否と本人修正の状態/履歴保存、旧方式承認と再実行拒否、顧客既読RPCで他顧客案件を更新できず本人のみ更新可能。
- 旧方式試験データはレビューbatchが存在しない既存案件を合成。通常の現行ステータス更新ではbatchを生成するため、それを旧方式として試すと正しく拒否されることも確認した。
- 独立接続の同時承諾/編集競合試験は未実施。SQL上は受付→招待のロック順、ロック後の版/失効/承諾状態の再読込みを確認。逐次試験の成功を同時実行の実証とは扱わない。
- 現在のSupabase接続ツールにはAuth設定取得APIがなく、Vercel環境変数の取得ツールもない。DB照会だけでは本番Site URL/Redirect URLs/メール確認必須や送信元設定を検証できない。管理画面での確認が必要。

## 管理画面・公開状態の追加確認（2026-11-01）

ユーザー提供の画面で以下を確認。秘密鍵の値は取得・記録していない。

- 本番Auth Site URL: https://estimate.create-support.co.jp
- Redirect URLs: https://estimate.create-support.co.jp/**
- Allow new users to sign up / Confirm email はON。匿名サインインはOFF。
- FROM_EMAIL: CS Works｜株式会社クリエイトサポート <k-hioki@create-support.co.jp>
- FROM_EMAIL / RESEND_API_KEY はAll Environmentsに登録。キーの有効性は未検証。
- Resend Domains の create-support.co.jp はVerified。ドメイン変更不要。
- GitHub PR #5を再取得しmergeable=true、draft=true、head=f196d884、base=d737345を確認。以前のmergeable=falseは現状ではない。
- Vercel ai-estimate-rwxrの当該Previewチェックはsuccess。他6プロジェクトのfailureは残る。

次の設定照合はVercelのProductionを対象にCSWORKS関連フラグ・APP_ORIGIN・本番用SUPABASE_SERVICE_ROLE_KEYの登録有無。Preview限定値を本番確認と混同しない。値の変更・実配送・マージは未実施。独立接続競合試験と復旧手段確認も未完了のため、公開準備完了とはまだ扱わない。

## Production変数の追加照合（2026-11-02 JST）

- ProductionのCSWORKS検索画面にはILLUSTRATION_DELIVERY / ILLUSTRATION_WORKFLOW / FORMAL_QUOTES / IMAGE_ANNOTATIONSの4項目が表示。値は伏せられているためtrueとは断定しない。
- 新規5項目（ACCESS_HARDENING、公開INVITATIONS、サーバーINVITATIONS_ENABLED、MAIL_MODE、APP_ORIGIN）は同画面に未表示。公開時に追加する対象として整理。
- SUPABASE_SERVICE_ROLE_KEYはProductionにSecretとして登録済み。キーのプロジェクト対応と有効性は未検証。キーの開示は求めない。
- ソース照合で招待UI/APIともACCESS_HARDENINGとFORMAL_QUOTESのtrueが必要と確認。既存FORMAL_QUOTESの値も公開時に確認する。
- 独立接続試験用のローカルPostgreSQL準備を試みたが、実行環境のOS権限制限によりインストール不可。試験を実施済みと扱わない。本番DBで代替試験は行わない。
- 本番DBのバックアップ日時・利用可能な復旧手段は未確認。公開前に確認する。

## 手動バックアップと追加検証（2026-11-02 JST）

- Freeプラン継続。ユーザーのWindows端末でPostgreSQL 18.6 pg_dumpのcustom形式を書き出し成功。保存先 `C:\Users\日置勝己\CSWorks-Backup\20261102-011638\csworks.dump`、777,764 bytes（画面確認）。
- `pg_restore --file=NUL` の終了コード0をユーザーが報告。アーカイブ全体の読み取り確認であり、別DBへの復元試験は未実施。Storageのファイル本体、DBロールなどを含むサービス全体の復旧保証ではない。バックアップやパスワードは取得していない。
- PR #5再取得：draft/open、mergeable=true、head f196d884、base d737345。本番未反映。
- テストDB jjiebuuasaimaqemhiuaで合成受付2件を一時作成し、捕捉済み招待で試験。外部メール送信なし。別backend PID（652409/652414）で承諾成功→再承諾invalid_invitation、生成案件1件を確認。管理者編集後の招待もinvalid_invitation、生成案件0件。
- 並列ツール呼出しとロック待機の観測を試みたが、観測時の対象セッションなし。接続ツールの逐次実行の可能性を除外できず、独立接続での同時実行試験成功とは扱わない。
- 試験専用の受付2件・招待・生成案件1件をID指定で削除し残件0を確認。試験顧客の試行回数/window_startを元の値へ戻し、会社名・担当者・メールが維持されていることを確認。本番変更なし。

現時点の残件：実際の重なりを観測できる同時実行試験、ProductionのFORMAL_QUOTES実値とキー対応、公開時の設定・DB・アプリ切替、および承認宛先への限定招待配送。招待以降の通常工程の手動やり直しは不要。

## 本番反映判断用の更新（2026-11-02 JST）

- ユーザー提供画面でProductionのNEXT_PUBLIC_CSWORKS_FORMAL_QUOTES=trueを確認。変更不要。
- ローカルDBの独立接続検証は実行環境のユーザー切替権限制限（runuser: cannot set groups: Operation not permitted）により実行できない。権限回避は行わない。同時実行の実証は未完了のまま。
- 公開対象SQLは次の3本。既存本番Storage policyで受付資料に対応できるため、テスト専用互換SQLは適用しない。
  1. supabase/migrations/20261101000000_project_access_hardening.sql
  2. supabase/migrations/20261101010000_admin_project_invitations.sql
  3. supabase/migrations/20261101131548_project_material_receipts.sql
- 公開の判断では同時実行未検証を明示する。許可を得るまで本番SQL、mainマージ、Production設定変更を実施しない。限定公開を選ぶ場合も、まずMAIL_MODE=captureで管理者受付・権限・既読・資料確認を確認し、実配送は宛先と送信を別途明示して承認を得る。
- 切替前に旧方式の提示中見積り件数とPRのhead/baseを再照合する。ローカルの追加試験・記録はまだPRに反映していないため、マージ前にfeatureへ同期する。本番用キーは値を開示せずプロジェクト対応を管理画面で照合する。
