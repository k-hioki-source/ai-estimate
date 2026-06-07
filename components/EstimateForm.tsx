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
  const [companyName, setCompanyName] = useState('');
const [customerName, setCustomerName] = useState('');
const [email, setEmail] = useState('');
  const [assistText, setAssistText] = useState('');
const [assistLoading, setAssistLoading] = useState(false);
const [assistReason, setAssistReason] = useState<string | null>(null);
  const [lastFormData, setLastFormData] = useState<FormData | null>(null);
const [formalSending, setFormalSending] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<'line' | 'color' | 'real'>('line');

  const difficultyStars = useMemo(
    () => (result ? starText(result.vision.complexityScore) : ''),
    [result]
  );

async function handleSubmit(formData: FormData) {
  setLoading(true);
  setLastFormData(formData);
  setError(null);
  setResult(null);

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      body: formData,
    });

    const text = await res.text();

    let json: ApiResponse;
    try {
      json = JSON.parse(text) as ApiResponse;
    } catch {
      throw new Error(
        text || 'サーバーから不正な応答が返されました。画像サイズや形式をご確認ください。'
      );
    }

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

async function handleSuggestForm() {
  if (!assistText.trim()) {
    setError('依頼内容を入力してください。');
    return;
  }

  setAssistLoading(true);
  setError(null);
  setAssistReason(null);

  try {
    const res = await fetch('/api/suggest-form', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: assistText }),
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error || 'フォーム提案に失敗しました。');
    }

    const sourceType = document.getElementById('sourceType') as HTMLSelectElement | null;
    const usage = document.getElementById('usage') as HTMLSelectElement | null;
    const style = document.querySelector(
      `input[name="style"][value="${json.style}"]`
    ) as HTMLInputElement | null;
    const notes = document.getElementById('notes') as HTMLTextAreaElement | null;

    if (sourceType) {
  sourceType.value = json.sourceType;
  sourceType.dispatchEvent(new Event('change', { bubbles: true }));
}

if (usage) {
  usage.value = json.usage;
  usage.dispatchEvent(new Event('change', { bubbles: true }));
}



   if (
  json.style === 'line' ||
  json.style === 'color' ||
  json.style === 'real'
) {
  setSelectedStyle(json.style);
}
 

if (notes) {
  notes.value = json.notes || '';
  notes.dispatchEvent(new Event('input', { bubbles: true }));
}

    setAssistReason(json.reason);
  } catch (e) {
    setError(e instanceof Error ? e.message : '不明なエラーです。');
  } finally {
    setAssistLoading(false);
  }
}

async function handleFormalQuoteRequest() {
  if (!lastFormData || !result) {
    setError('送信内容が見つかりません。もう一度概算見積りを実行してください。');
    return;
  }

  setFormalSending(true);
  setError(null);

  try {
    const formData = new FormData();

    lastFormData.forEach((value, key) => {
      formData.append(key, value);
    });

    formData.set('requestFormalQuote', 'yes');
    formData.set('fixedEstimateTotal', String(result.estimate.total));
    formData.set('fixedEstimatedHours', String(result.estimate.estimatedHours));
    formData.set('fixedDifficultyScore', String(result.vision.complexityScore));
    formData.set('fixedSubjectType', result.vision.subjectType);
    formData.set('fixedReason', result.vision.reason);

    const res = await fetch('/api/formal-quote', {
      method: 'POST',
      body: formData,
    });

    const text = await res.text();

    let json: { ok?: boolean; error?: string; message?: string };
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(text || '正式見積り依頼の送信に失敗しました。');
    }

    if (!res.ok) {
      throw new Error(json.error || '正式見積り依頼の送信に失敗しました。');
    }

    setResult({
      ...result,
      input: {
        ...result.input,
        requestFormalQuote: true,
      },
    });
  } catch (e) {
    setError(e instanceof Error ? e.message : '不明なエラーです。');
  } finally {
    setFormalSending(false);
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
  onSubmit={async (e) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await handleSubmit(formData);
  }}
>

          <div className="assistBox">
  <div className="assistHead">
    <div>
      <div className="eyebrow">入力に迷った方へ</div>
      <h3 className="assistTitle">依頼内容を文章で入力すると、AIエージェントが選択項目を提案します</h3>
    </div>
  </div>

  <textarea
    className="assistTextarea"
    value={assistText}
    onChange={(e) => setAssistText(e.target.value)}
    placeholder="例：図面と写真があります。パーツカタログ用の分解図を白黒線画で作りたいです。"
  />

  <button
    type="button"
    className="secondaryButton"
    onClick={handleSuggestForm}
    disabled={assistLoading}
  >
    {assistLoading ? 'AIが提案中...' : 'AIエージェントにフォーム入力を提案してもらう'}
  </button>

  {assistReason ? (
    <p className="assistReason">
      AI提案理由：{assistReason}
    </p>
  ) : null}
</div>
          
          <div className="grid grid-2">
            <div>
              <label htmlFor="companyName">会社名</label>
             <input
  id="companyName"
  name="companyName"
  placeholder="株式会社◯◯"
  value={companyName}
  onChange={(e) => setCompanyName(e.target.value)}
/>
            </div>
            <div>
              <label htmlFor="customerName">ご担当者名（必須）</label>
             <input
  id="customerName"
  name="customerName"
  placeholder="山田 太郎"
  required
  value={customerName}
  onChange={(e) => setCustomerName(e.target.value)}
/>
            </div>
            <div>
              <label htmlFor="email">メールアドレス（必須）</label>
              <input
  id="email"
  type="email"
  name="email"
  placeholder="sample@example.com"
  required
  value={email}
  onChange={(e) => setEmail(e.target.value)}
/>
            </div>
            <div>
              <label htmlFor="quantity">点数</label>
              <input id="quantity" name="quantity" type="number" min="1" defaultValue="1" required />
            </div>

            <div>
  <label htmlFor="sourceType">制作方法／資料</label>
  <select id="sourceType" name="sourceType" defaultValue="photo_trace">
    <option value="photo_trace">写真・画像トレース</option>
    <option value="reference_drawing">写真・図面・資料から作図</option>
    <option value="cad_conversion">XVL・3DCADから作成</option>
  </select>
</div>
            
            <div>
              <label htmlFor="usage">用途（必須）</label>
              <select id="usage" name="usage" defaultValue="manual">
                <option value="manual">取扱説明書</option>
                <option value="parts">パーツカタログ</option>
                <option value="sales">販促用（リアルイラスト）</option>
              </select>
            </div>
            <div className="gridSpan2">
  <label>イラスト表現（必須）</label>

  <div className="styleGrid">

    {/* 白黒線画 */}
    <label className="styleCard">
      <input
  type="radio"
  name="style"
  value="line"
  checked={selectedStyle === 'line'}
  onChange={() => setSelectedStyle('line')}
/>

      <img
        src="/samples/line.jpg"
        alt="白黒線画"
      />

      <div className="styleBody">
        <strong>白黒線画</strong>

        <span>
          取扱説明書・パーツカタログ向け
        </span>
      </div>
    </label>

    {/* カラー */}
    <label className="styleCard">
      <input
  type="radio"
  name="style"
  value="color"
  checked={selectedStyle === 'color'}
  onChange={() => setSelectedStyle('color')}
/>

      <img
        src="/samples/color.jpg"
        alt="カラーイラスト"
      />

      <div className="styleBody">
        <strong>カラーイラスト</strong>

        <span>
          製品説明・WEB・プレゼン資料向け
        </span>
      </div>
    </label>

    {/* リアル */}
    <label className="styleCard">
      <input
  type="radio"
  name="style"
  value="real"
  checked={selectedStyle === 'real'}
  onChange={() => setSelectedStyle('real')}
/>

      <img
        src="/samples/real.jpg"
        alt="リアルイラスト"
      />

      <div className="styleBody">
        <strong>リアルイラスト</strong>

        <span>
          販促・広告・メインビジュアル向け
        </span>
      </div>
    </label>

  </div>
</div>
            <div>
              <label htmlFor="size">サイズ感</label>
              <select id="size" name="size" defaultValue="small">
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

      // ★追加：4MB制限（ここが重要）
      if (file.size > 4 * 1024 * 1024) {
        alert('画像サイズが大きすぎます（4MB以下にしてください）');
        e.target.value = '';
        setPreview(null);
        return;
      }

      setPreview(URL.createObjectURL(file));
    }}
  />
<p className="uploadNotice">
    <em>※アップロードいただいた画像・図面データは、お見積り算出の目的にのみ使用いたします。<br />
    AIの学習データとして利用されることはありません。<br />
    また、データは一定時間後に自動削除されますので、安心してご利用ください。</em>
  </p>
              
</div>
          </div>

          <div>
            <label htmlFor="notes">イラストの内容・制作条件</label>
            <textarea
              id="notes"
              name="notes"
              placeholder="例：
・分解図
・部品点数20点
・支給：写真、2D図面、組図
・AI納品希望
・WEB掲載用
・リアルタッチ希望"
            />
          </div>

          <label className="checkRow">
            <input type="checkbox" name="requestFormalQuote" value="yes" />
            <span>概算確認後、そのまま正式見積りも希望する</span>
          </label>

          {preview ? <img src={preview} alt="preview" className="preview" /> : null}

          <button type="submit" disabled={loading} className="primaryButton">
            {loading ? 'AIが画像を解析しています...' : '概算金額を表示する'}
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
{loading && (
  <div className="loadingCard">

    <div className="loadingSpinner" />

    <h3>AIが概算見積りを計算中です</h3>

    <ul className="loadingSteps">
      <li>画像を解析しています...</li>
      <li>構造の複雑さを判定しています...</li>
      <li>制作工数を計算しています...</li>
      <li>概算金額を算出しています...</li>
    </ul>

    <p className="loadingNote">
      通常5〜15秒ほどで完了します
    </p>

  </div>
)}
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
              {result.input.requestFormalQuote ? (
  <div className="ctaButtonLike">
    正式見積り希望として受付済みです
  </div>
) : (
  <button
    type="button"
    className="primaryButton"
    onClick={handleFormalQuoteRequest}
    disabled={formalSending}
  >
    {formalSending ? '正式見積り依頼を送信中...' : 'この内容で正式見積りを依頼する'}
  </button>
)}
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
