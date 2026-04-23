# AI概算見積りデモ（簡易版）

参考画像と条件を受け取り、OpenAIで画像の複雑さを評価し、自社ルールで概算金額を計算する Next.js デモです。

## できること
- 参考画像アップロード
- 条件入力（サイズ、仕上がり、点数、納期）
- AIによる複雑さ判定
- 概算金額の表示
- 管理者へのメール通知

## 前提
- Node.js 20 以上
- OpenAI API キー
- Resend API キー

## セットアップ
```bash
npm install
cp .env.example .env.local
```

`.env.local` を編集して以下を設定してください。

```env
OPENAI_API_KEY=your_openai_api_key
RESEND_API_KEY=your_resend_api_key
NOTIFY_TO_EMAIL=you@example.com
FROM_EMAIL=Estimate Bot <onboarding@resend.dev>
```

## 起動
```bash
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

## 注意
- 今回は簡易版です。DB保存、管理画面、スパム対策、認証は未実装です。
- 金額は AI が直接決めず、`lib/pricing.ts` のルールで計算します。
- 実運用では Cloudflare Turnstile などの bot 対策追加を推奨します。

## 調整ポイント
- `lib/pricing.ts`
  - 日置さん基準の料金表に変更
- `lib/openai.ts`
  - JSON項目や判定ルールの調整
- `lib/email.ts`
  - 通知メール文面の変更
