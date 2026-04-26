'use client';

import { useMemo, useState } from 'react';

type ApiResponse = {
  input: {
    requestFormalQuote: boolean;
  };
  vision: {
    subjectType: string;
    complexityScore: number;
    partDensity: number;
    occlusion: number;
    lineDifficulty: number;
    realismRequirement: number;
    structureComplexity: number;
    confidence: number;
    reason: string;
  };
  estimate: {
  total: number;
  subtotal: number;
  deliveryDays: string;
  basePrice: number;
  hourlyRate: number;
  estimatedHours: number;
  adjustedHours: number;
  quantity: number;
};
  error?: string;
};

function starText(score: number) {
  const count = Math.max(1, Math.min(5, Math.round(score / 20)));
  return '★'.repeat(count) + '☆'.repeat(5 - count);
}

function difficultyLabel(score: number) {
  if (score <= 35) return 'やさしめ';
  if (score <= 65) return '標準からやや複雑';
  return '高難度';
}

export default function EstimateForm() {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const difficultyStars = useMemo(
    () => (result ? starText(result.vision.complexityScore) : ''),
    [result]
  );

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const json = (await res.json()) as ApiResponse;
      if (!res.ok) {
        throw new Error(json.error || '送信に失敗しました。');
      }
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '不明なエラーです。');
    } finally {
      setLoading(false);
    }
  }

  return (
  <div className="stackLarge">

    {/* ヘッダー（ロゴ） */}
    <div className="header">
      <a href="https://www.create-support.co.jp/" className="logoLink">
        <img src="https://www.create-support.co.jp/public/titlelogo.png" alt="クリエイトサポート" />
      </a>

      <a
        href="https://www.create-support.co.jp/"
        className="backLink"
      >
        会社サイトへ戻る →
      </a>
    </div>

    {/* ヒーロー */}
    <section className="hero card">
        <div className="heroContent">
          <div className="heroText">
            <div className="eyebrow">AI概算見積り</div>
            <h1 className="heroTitle">
              イラスト制作の概算見積りをその場で確認できます
            </h1>
            <p className="heroLead">
              参考画像と条件を入力するだけで、AIが案件の複雑さを判定し、概算金額を表示します。
              取扱説明書・パーツカタログ・機械イラストに対応しています。
            </p>
            <div className="heroPoints">
              <div className="miniPoint">その場で金額の目安がわかる</div>
              <div className="miniPoint">画像を見て複雑さを数値化</div>
              <div className="miniPoint">正式見積りにもつなげやすい</div>
            </div>
          </div>

          <div className="heroImageWrap">
            <img
              src="https://www.create-support.co.jp/public/hydraulic.png"
              alt="油圧シリンダーのテクニカルイラスト"
              className="heroImage"
            />
          </div>
        </div>
      </section>

      <section className="card stackLarge">
        <div className="sectionHeading">
          <div>
            <div className="eyebrow">入力フォーム</div>
            <h2 className="sectionTitle">参考画像と条件を入力してください</h2>
          </div>
          <p className="muted compactText">
            概算のため、ざっくりした情報でも問題ありません。内容確認後に正式なお見積りをご案内できます。
          </p>
        </div>

        <form
          className="stack"
          action={async (formData) => {
            await handleSubmit(formData);
          }}
        >
          <div className="grid grid-2">
            <div>
              <label htmlFor="companyName">会社名</label>
              <input id="companyName" name="companyName" placeholder="株式会社◯◯" />
            </div>
            <div>
              <label htmlFor="customerName">ご担当者名</label>
              <input id="customerName" name="customerName" placeholder="山田 太郎" required />
            </div>
            <div>
              <label htmlFor="email">メールアドレス</label>
              <input id="email" type="email" name="email" placeholder="sample@example.com" required />
            </div>
            <div>
              <label htmlFor="quantity">点数</label>
              <input id="quantity" name="quantity" type="number" min="1" defaultValue="1" required />
            </div>
            <div>
              <label htmlFor="usage">用途（必須）</label>
              <select id="usage" name="usage" defaultValue="manual">
                <option value="manual">取扱説明書</option>
                <option value="parts">パーツカタログ</option>
                <option value="sales">販促用（リアルイラスト）</option>
              </select>
            </div>
            <div>
              <label htmlFor="style">表現（必須）</label>
              <select id="style" name="style" defaultValue="line">
                <option value="line">白黒線画</option>
                <option value="color">カラー</option>
                <option value="real">リアルタッチ</option>
              </select>
            </div>
            <div>
              <label htmlFor="size">サイズ感</label>
              <select id="size" name="size" defaultValue="medium">
                <option value="small">小</option>
                <option value="medium">中</option>
                <option value="large">大</option>
              </select>
            </div>
            <div>
              <label htmlFor="rush">納期</label>
              <select id="rush" name="rush" defaultValue="normal">
                <option value="normal">通常</option>
                <option value="rush">特急</option>
              </select>
            </div>
            <div className="gridSpan2">
              <label htmlFor="image">参考画像</label>
              <input
                id="image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    setPreview(null);
                    return;
                  }
                  setPreview(URL.createObjectURL(file));
                }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="notes">備考</label>
            <textarea
              id="notes"
              name="notes"
              placeholder="用途、希望納期、著作権譲渡の有無、修正回数、参考情報など"
            />
          </div>

          <label className="checkRow">
            <input type="checkbox" name="requestFormalQuote" value="yes" />
            <span>概算確認後、そのまま正式見積りも希望する</span>
          </label>

          {preview ? <img src={preview} alt="preview" className="preview" /> : null}

          <button type="submit" disabled={loading} className="primaryButton">
            {loading ? 'AIが解析中...' : '概算金額を表示する'}
          </button>
        </form>

        <div className="trustBox">
          <h3 className="trustTitle">対応実績</h3>
          <ul className="trustList">
            <li>自動車・バイク・重機の取扱説明書イラスト</li>
            <li>パーツカタログ用の分解図・構成図</li>
            <li>機械部品や設備のリアルイラスト</li>
          </ul>
        </div>
      </section>

      {error ? <div className="errorBox">エラー: {error}</div> : null}

            {result ? (
        <section className="stackLarge">
          <div className="resultHero card">
            <div className="badgeRow">
              <div className="badge">概算見積り結果</div>
              <div className="scorePill">難易度 {difficultyStars}</div>
            </div>

            <div className="resultTopGrid">
              <div>
                <p className="resultAmountLabel">概算金額</p>
                <h2 className="resultAmount">
                  {result.estimate.total.toLocaleString()}円
                </h2>
                <p className="muted">納期目安: {result.estimate.deliveryDays}</p>
              </div>

              <div className="summaryCard">
                <div className="summaryItem">
                  <span>対象</span>
                  <strong>{result.vision.subjectType}</strong>
                </div>
                <div className="summaryItem">
  <span>難易度スコア</span>
  <strong>{result.vision.complexityScore}</strong>
</div>
                <div className="summaryItem">
                  <span>難易度</span>
                  <strong>{difficultyLabel(result.vision.complexityScore)}</strong>
                </div>
              </div>
            </div>

            <p className="noticeText">
              ※この金額は参考画像と入力条件から算出した概算です。正式なお見積りは、内容確認後にご案内いたします。
            </p>
          </div>

          <div className="grid grid-2">
            <div className="resultBox">
              <div className="badge">AI判定</div>
              <ul className="list cleanList">
                <li><span>部品密度</span><strong>{result.vision.partDensity}</strong></li>
                <li><span>線の難しさ</span><strong>{result.vision.lineDifficulty}</strong></li>
                <li><span>構造難度</span><strong>{result.vision.structureComplexity}</strong></li>
                <li><span>信頼度</span><strong>{result.vision.confidence}</strong></li>
              </ul>
              <p className="footerNote">判定理由: {result.vision.reason}</p>
            </div>

            <div className="resultBox">
              <div className="badge">計算内訳</div>
              <ul className="list cleanList">
               <li>
  <span>想定制作時間</span>
  <strong>{result.estimate.estimatedHours}時間</strong>
</li>
<li>
  <span>作業内容</span>
  <strong>{result.vision.subjectType}</strong>
</li>
                <li>
                  <span>制作単価</span>
                  <strong>{result.estimate.hourlyRate.toLocaleString()}円 / 時間</strong>
                </li>
                <li>
                  <span>1点あたり</span>
                  <strong>{result.estimate.subtotal.toLocaleString()}円</strong>
                </li>
                <li>
                  <span>点数</span>
                  <strong>{result.estimate.quantity}</strong>
                </li>
              </ul>
            </div>
          </div>

          <div className="ctaCard card">
            <div>
              <div className="eyebrow">次のアクション</div>
              <h3 className="ctaTitle">この内容で正式見積りをご希望の場合</h3>
              <p className="muted compactText">
                入力内容はすでに送信されています。内容確認後、通常1営業日以内を目安にご案内できます。
              </p>
            </div>

            <div className="ctaActions">
              <div className="ctaButtonLike">
                {result.input.requestFormalQuote
                  ? '正式見積り希望として受付済みです'
                  : '概算確認のみで送信されています'}
              </div>
              <p className="footerNote">
                正式見積り希望にチェックを入れて送信した場合は、参考画像も管理者宛に送信されます。
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <footer className="footer">
        <div className="footerInner">
          <div className="footerBrand">
            <a href="https://www.create-support.co.jp/" className="footerLogo">
              クリエイトサポート
            </a>
            <p className="footerDesc">
              テクニカルイラスト・取扱説明書・パーツカタログ制作
            </p>
          </div>

          <ul className="footerLinks">
            <li><a href="https://www.create-support.co.jp/">ホーム</a></li>
            <li><a href="https://www.create-support.co.jp/technicalillustration/">テクニカルイラストについて</a></li>
            <li><a href="https://www.create-support.co.jp/sample-page/">制作事例</a></li>
            <li><a href="https://www.create-support.co.jp/topics/">ブログ</a></li>
            <li><a href="https://www.create-support.co.jp/company/">会社概要</a></li>
            <li><a href="https://www.create-support.co.jp/contact/">お問い合わせ</a></li>
            <li><a href="https://www.create-support.co.jp/techlineworks-technical-illustration-download/">イラスト素材販売</a></li>
          </ul>

          <div className="footerCopy">
            © Create Support Co., Ltd.
          </div>
        </div>
      </footer>
    </div>
  );
}
