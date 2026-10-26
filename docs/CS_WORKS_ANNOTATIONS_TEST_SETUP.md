# 画像赤入れ：専用検証環境のセットアップ

対象は新規作成した `cs-works-test` のみ。
- Supabase URL: https://jjiebuuasaimaqemhiua.supabase.co
- project ref: jjiebuuasaimaqemhiua
- Vercel: ai-estimate-rwxr のPreview
- Gitブランチ: feature/image-annotations-20261026

本番データはコピーしない。DBパスワード/APIキーをチャット・Gitへ保存しない。
これは確認・修正画面を試すための限定した検証用スキーマであり、本番DB全体の複製ではない。

## 1. 空の検証DBを初期化

`docs/sql/csworks-annotations-test-setup.sql` を **cs-works-test** のSQL Editorで1回だけ実行する。
プロジェクト名とURLのproject refが上記と一致していることを画面で確認する。
SQLは実行中のSupabase project refを自動検出できないため、この画面確認は必要。

SQLには、publicのテーブル・Authユーザー・Storageバケットが既に存在する場合に停止するガードがある。
現在のデータ入り本番で実行しても、先頭のチェックで停止する設計。失敗時はDROP/DELETEで強行せず、結果を確認する。
1トランザクションでテスト用基本テーブル・権限・private project-filesバケット・提供された既存RPC・赤入れSQLを作る。
既存データやユーザーを消す操作は含まない。

成功時の結果:
```
project_ref: jjiebuuasaimaqemhiua
result: TEST_SETUP_READY
```

## 2. テストユーザーを作成

検証プロジェクトのAuthenticationから、以下のユーザーをパスワード付きで作成し、確認済みとする。
招待メール送信・本番の顧客アカウントコピーは使わない。パスワードは手元で管理する。

| メール | 用途 |
|---|---|
| csworks-admin@example.com | 検証用管理者 |
| csworks-customer@example.com | 検証用A社顧客 |
| csworks-other@example.com | 別のB社顧客 |

これらは予約済みexample.comドメインの架空アドレス。メール受信を前提にしない。
Authユーザー追加トリガーが一般顧客のプロフィールを作成する。ユーザーメタデータで管理者権限は付与しない。

## 3. テスト案件と管理者権限を設定

`docs/sql/csworks-annotations-test-seed.sql` を検証DBで実行する。
このSQLは専用環境マーカーと3人の確認済みテストアカウントを検証する。
検証用管理者だけをadminへ変更し、A社/B社の架空案件を作成する。

- A社案件: c5100000-0000-4000-8000-000000000001 / TEST-ANNOTATION-A
- B社案件: c5100000-0000-4000-8000-000000000002 / TEST-ANNOTATION-B

作成済み案件のステータスや赤入れは再実行で初期化しない。履歴を消して再試験するSQLは含めない。

## 4. Vercelは対象Previewブランチだけに設定

Settings → Environment Variablesで **Previewかつfeature/image-annotations-20261026限定** の値を追加する。
All Environmentsの値やProduction設定は編集しない。他のPreviewブランチにも適用しない。
公式仕様ではブランチ指定の値が同名の通常Preview値を上書きする。
https://vercel.com/docs/environment-variables#preview-environment-variables

| 変数 | この検証ブランチの値 |
|---|---|
| RESEND_API_KEY | re_test_disabled_for_annotation_validation（無効なテスト値。実メール送信をさせない） |
| OPENAI_API_KEY | sk_test_disabled_for_annotation_validation（無効なテスト値。AI見積りは試験しない） |
| NEXT_PUBLIC_SUPABASE_URL | https://jjiebuuasaimaqemhiua.supabase.co |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | cs-works-testのPublishable Key |
| SUPABASE_SERVICE_ROLE_KEY | cs-works-testのサーバー専用service_roleキー |
| NEXT_PUBLIC_CSWORKS_IMAGE_ANNOTATIONS | true（他の設定を済ませてから最後に追加） |

キーはSupabase→Vercelへ直接コピーする。チャットやGitへ貼らない。
全設定の対象がPreview＋このブランチであることを確認して、**Previewだけ**再デプロイする。
本番ドメインの変更、ProductionへのPromote、mainへのマージは行わない。

この段階は画像・確認処理の検証。メールは無効キーのため送信失敗表示となる。保存/修正依頼/承認のDB結果と区別する。
実メールの確認は別のテスト送信先と承認を用意して行う。メール配信成功を今回の結果に含めない。

## 5. 既存画面での検証

テスト画像のみを使用する。実案件・実顧客ファイルはアップロードしない。
1. Previewへ検証用管理者でログインし、/admin/projects/c5100000-0000-4000-8000-000000000001 を開く。
2. 確認用PNG/JPGをアップロードし、チェックを確認して既存のお客様確認へ進める操作を行う。
3. 別ブラウザのA社顧客で /mypage/projects/c5100000-0000-4000-8000-000000000001 を開く。
4. プレビューから赤入れ、保存、再表示、ズーム、既存修正依頼を確認。
5. 管理者で04の履歴から同じ赤入れを確認。顧客は送信後の内容を編集できないことを確認。
6. 修正版をアップロードして次の確認へ進め、過去稿の指示と分離されることを確認。
7. 赤入れのない確認回で承認し、以後編集できないことを確認。
8. B社顧客でA社の案件・赤入れ・Storageへのアクセスが拒否されることを確認。
9. 同じ非機密テスト画像で通常プレビュー・ダウンロード・共有の発行/解除を確認する。

本番の請求・入金、AI見積り、Google Calendar、保管管理の再現はこの検証スキーマの対象外。
project_orders/deliveries/invoicesと問い合わせ/予約は画面読み込み用の空の閲覧専用テーブルだけを用意する。
本番のFK/CHECK/RLS全体の複製ではないため、本番適用前には差分確認を別途行う。

## 作成とローカル検証

SQLの生成元はscripts/fixtures/csworks-annotation-test-{base,access}.sqlと、提供された列・既存関数のfixture、新規赤入れmigration。
`node scripts/build-image-annotations-test-setup.cjs` で再生成する。
`node scripts/test-image-annotations-test-setup.cjs` の16項目が成功。
空DBセットアップ・既存データがある場合の拒否・Authプロフィール生成・テスト案件作成・所有者/他社のRLS・Storageポリシー・原子的な修正依頼を、ローカルPGliteで検証した。
実Supabase Auth/Storage、Vercelとの結合確認はユーザー実行後に行う。セットアップSQLはまだ外部DBへ適用していない。
参考: https://supabase.com/docs/guides/auth/managing-user-data
参考: https://supabase.com/docs/guides/storage/security/access-control
