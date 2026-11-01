# 管理者起点の受付案件・顧客招待

実装元: main `d7373450006275d99b2b899e2edbe98fd9659d6e`。本番反映・実メール送信は未承認・未実施。2026-11-01、明示承認後に専用テストDBへ適用（下記追記）。

## 挙動

管理画面→「新規案件登録・顧客招待」→受付案件保存→明細見積り・資料準備→招待→本人登録/ログイン→明示承諾→既存案件へ移行→別操作で正式発注。

- 会社名・担当者・メール・案件名・依頼内容・制作区分・希望納期を管理者だけが登録。
- 見積りは省略可。準備した明細は承諾後に既存の版管理見積りとして提示。合計はDBで再計算。
- 見積り入力部品を既存画面と共通化。既存の税率・丸め・200明細制限を維持。
- `project_intakes`に準備中情報を格納。見積りはこの行のJSON明細として保存し、承諾時に既存project_quotes/itemsへ一括移行。受付段階の過去明細版の表示はなく、編集で版番号を進めて旧招待を失効させる。
- 資料は予約案件UUID配下へアップロード。受付専用メタデータは管理者だけが操作。承諾前はprojects/project_filesに行がなく、既存Storage所有者判定・共有APIでは顧客に公開されない。ファイル登録でも版を進めて既存招待を失効させる。
- 添付は最大30件/各50MB。UI/DBメタデータ検証に加え、**検証・本番bucketの実サイズ上限を確認する**。管理者アップロードの応答不明時に自動削除しない。孤立ファイルの自動掃除は実装しない。
- 承諾はAuthの現在の確認済みメールと照合。プロフィールemail、フォームのuser_id、未署名Cookieを本人証明にしない。認証アカウントの事前作成・管理者によるパスワード設定なし。
- 既存プロフィールの値は保持。空の会社名・担当者名・メールだけ補完。
- 招待32バイト乱数、SHA-256保存、7日期限、一度だけ消費。GETやメールスキャナは消費しない。期限・失効・使用済み・別メールは拒否。
- 送信は1案件60秒間隔、管理者30件/時、宛先5件/日。承諾失敗はユーザー20回/15分。メールアドレスにGmail独自のドット除去等は行わない。
- 受付行ロックと同一トランザクションで案件・正式見積り・添付情報・承諾記録を確定。編集/失効/再送も受付行をロック。
- メールはprocessing/captured/sent/failed/unknownを記録。sentはプロバイダー受付であり、到達/開封ではない。processing/unknownは勝手に自動再送しない。再送は新トークンで旧リンク失効。
- 招待はURL fragmentで受け取り、sessionStorageへ移してURLを消去。期限付きで保持、成功時削除。別タブで認証確認したら元の招待リンクから再開可能。returnToは固定許可先のみ。
- 招待・管理者受付ページではGAを読み込まない。初回HTMLのbeforeInteractive処理でもfragmentを先に除去。トークン・本文をサーバーログに出さない。

## H-01/H-03/H-04

`20261101000000_project_access_hardening.sql`:

- 直接INSERTの初期状態・所有者・見積金額・見積ID・期限・受注日時を保護。他人のAI見積りとの紐付けを拒否。
- 直接UPDATEによる案件ID/所有者/コード/元見積りの変更を拒否。
- 旧order_projectは管理者が提示した金額等の証跡との一致を要求。既存の新方式発注RPCからの呼び出しは維持。
- 一般メッセージの送信者を認証主体から設定。直接のシステム/承認/修正依頼投稿と本文UPDATEを拒否。既読は専用RPC。旧レビューUI用にも状態変更と履歴保存を一括処理するRPCを用意し、新しい点別確認の迂回は拒否。
- project_filesの保存先を案件UUIDに限定。削除APIとStorage削除ポリシーでも対応・所有者・状態を検証。

H-02（Google OAuth）、H-05（画像解析パス）、既存公開AI/APIのH-06全体はこのPRで修正していない。招待は独立した本人確認と利用制限を持つ。既存notify API全体のM-02修正も含まない。

## 設定と有効化

既定は無効。すべて**専用検証環境のみ**に設定する。環境変数の実値をリポジトリへ保存しない。

| 設定 | 検証値 |
|---|---|
| NEXT_PUBLIC_CSWORKS_ACCESS_HARDENING | true |
| NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES | true（既存機能） |
| NEXT_PUBLIC_CSWORKS_INVITATIONS | true |
| CSWORKS_INVITATIONS_ENABLED | true |
| CSWORKS_INVITATIONS_MAIL_MODE | capture |
| CSWORKS_APP_ORIGIN | 信頼する検証サイトのoriginのみ。末尾パス/資格情報不可 |
| Supabase URL / publishable / service role | 専用検証DBのもの |

招待APIはhardeningとformal quotesのフラグも要求する。captureはメールを送らず、管理者だけに一度だけテストリンクを返す。実メール送信の別途承認前に`send`へ変更しない。sendはRESEND_API_KEY/FROM_EMAILを必要とする。

実メールを使うSupabase標準signUpも「実送信」に含む。未承認のテストではローカルAuthメール捕捉またはモックを使う。既存顧客はログイン経路を使用し、アカウント有無を公開APIで列挙しない。

## 導入手順・公開ゲート

1. `docs/sql/csworks-invitations-preflight.sql`を読み取り専用で実行し、実RLS・RPC・トリガー・Storageの定義を保存済みfixtureと比較する。差分があればSQLをそのまま適用しない。Authのメール確認有効化、redirect allowlist（検証origin + /invite）、bucket非公開、サイズ上限も確認する。
2. 専用の空DBに既存正式見積り・赤入れ・点別制作・納品の定義を構築する。**本番データはコピーしない**。
3. SQLを順に適用: `20261101000000_project_access_hardening.sql` → `20261101010000_admin_project_invitations.sql`。
4. 上記検証フラグを設定して検証ビルド。旧画面の既読/旧レビューはhardening=falseでは従来経路を維持するため、**hardening SQLと対応フラグを揃える**。不一致は既読や旧レビューを失敗させる。
5. 管理者・既存顧客A/B・新規登録顧客・未確認メールを使い下記受入試験を実施。実サービスのAuth/Storage/Supabase結合試験の完了前に公開しない。
6. 本番反映には別途承認が必要。旧方式の提示中見積りは導入前の必須確認事項。自動で信用してバックフィルしない。対象がある場合は管理者が条件を確認・再提示して証跡を作る移行計画が必要で、それが完了するまで旧発注が拒否される。**この影響を未解決のまま本番適用しない。**
7. 既存の不正な保存先行も事前に調査。自動修正・削除しない。

停止時は招待のUI/APIフラグを無効にする。承諾済み案件は既存機能で継続できる。hardening SQL適用後にhardeningフラグだけ戻さない。DBのDROP・データ削除による巻戻しは行わない。

## 検証

- `scripts/test-project-invitations-db.cjs`: in-process PostgreSQL/PGlite、合成ユーザー・合成案件。RLS、トークンの失効/期限/再利用、別メール、プロフィール偽装、見積り改変、権限拒否、承諾のロールバック、承諾前資料非公開、発注→点別赤入れ→修正→承認→最終納品。
- `scripts/test-project-invitations-api.cjs`: 実Route Handlerと合成クライアント。無効時の停止、管理者認証、サイズ制限、捕捉時の外部送信ゼロ、DBにはハッシュのみ、承諾入力への金額/所有者混入拒否。
- `scripts/test-project-invitations-browser.cjs`: 実Reactページ＋合成Auth/API。管理者登録・明細・捕捉表示、モバイル、signup/loginの戻り先、明示承諾とエラー表示。実Supabase Authの結合試験ではない。
- 既存formal quote DB/API/browserを回帰確認。ビルドには未設定キーを参照する既存ルートがあるため、ローカル限定のダミーキーで実施する（ネットワーク呼出しなし）。

テスト専用依存はリポジトリ外へinstallし、CSWORKS_PGLITE_PATH / CSWORKS_INVITATION_TEST_DEPS / CSWORKS_CHROMIUM_PATHで指定できる。アプリ依存・lockfileは変更しない。

残る実環境確認: 本物のAuth登録確認メールと別タブ復帰、Authの重複メール挙動、実Storageの署名URL/ファイルサイズ制限、独立DB接続の同時承諾・編集競合、Resend実配送・障害時照合、本番RLS差分。本番や実メールに触れずローカル試験だけでこれらを「検証済み」とはしない。

## 今回の実行結果（2026-11-01）

新規DB 37項目、新規API 10項目、新規ブラウザ9項目、既存正式見積りDB 37項目・API 19項目・ブラウザ10項目、計122項目が成功。TypeScript検査とNext.js本番形式ビルドも成功。ビルドは架空APIキーを使用し、本番サービスを呼び出していない。

外部Supabaseに接続する資格情報・設定の検証は行っていないため、実アカウントによるAuth/Storage結合試験と実DB同時実行試験は未完了。第3段階の実サービス受入完了を意味しない。GitHub mainのマージ、本番SQL適用、本番公開、実メール送信は実施していない。

## 実SupabaseテストDBへの適用（2026-11-01追記）

ユーザーの「進めて」によりテストDB変更を承認。対象はCreate Support配下のcs-works-test（jjiebuuasaimaqemhiua）のみ。本番cs-worksにはクエリ・変更を実行していない。

- 適用済み履歴: 20261101050124 project_access_hardening、20261101050138 admin_project_invitations、20261101050158 invitation_test_policy_compatibility。
- 既存テスト環境のcsworks_test_*ポリシーは開発fixtureと異なった。テスト専用SQL `docs/sql/csworks-invitations-test-policy-compatibility.sql` で既存DELETE条件へ案件状態・パス対応を追加し、未承諾受付資料の管理者SELECT/INSERTのみ許可した。納品のRESTRICTIVEポリシーは保持。これは本番用SQLではない。
- `docs/sql/csworks-invitations-test-acceptance.sql` を実DBで実行し12項目成功。既存3テストAuthユーザーのDBクレームをSET LOCAL ROLEで模擬したもの。Authログインやブラウザ結合試験ではない。
- 成功: 管理者登録、サーバー専用発行（captured）、顧客の受付/トークン閲覧拒否、別メール拒否、顧客作成拒否、期限切れ拒否、失効拒否、確認済み本人の承諾と固定金額/所有者、承諾のみでは未発注、再利用拒否、明示発注で税抜9000/税込9900円、他顧客の案件/見積り閲覧拒否。
- 検証トランザクションはROLLBACK。確認時の件数は案件4、発注1、Authユーザー3、受付0、招待0。既存アカウントのパスワードや確認状態は変更していない。
- Storage bucketは非公開、bucket個別file_size_limitはNULL。実Storageアップロード/署名URL/サイズ上限の検証は未実施。Auth設定・実ログイン・新規登録・独立接続競合も未検証。
- Advisors再確認済み。専用RPC経由の非公開テーブルについてRLSポリシー無しのINFOは意図した拒否設定。SECURITY DEFINER実行権のWARNは個別認可確認が必要であり、全警告解消とはしていない。既存rls_auto_enableのanon実行権警告と漏えいパスワード保護無効も残る。
- 次の実ブラウザ試験には、この開発ブランチとテストDBを接続した専用画面、サーバー側資格情報、既存テストログインが必要。手元に.env/資格情報はなく、Supabase接続ツールはAuth設定変更やテストユーザーログイン機能を提供していない。秘密鍵・パスワードをチャットへ貼り付けない。


## 実ブラウザ確認・公開準備の更新（2026-11-01夜）

上の「未実施」は各検証時点の記録。最新の確認範囲は `CS_WORKS_RELEASE_READINESS.md` を参照。
既存会員・新規会員の招待承諾、正式見積り提示と発注、双方向メッセージ、顧客資料共有・プレビューをユーザーが確認した。新規Auth確認メールは明示承認のうえ実送信。既存顧客の最初の発注通知も届いた（Previewの送信無効化反映前）。後続は無効化を反映し、発注成功・通知のみ失敗を確認。招待メールそのものはcaptureでありResend実配送は未確認。
資料通知とメッセージ強調はPreviewに反映しユーザー確認済み。本番反映・mainマージは未実施。
通常工程すべての手動再試験は行わず、今回変更した認証・権限・移行経路の残件を確認する。
