"use client";

import { useMemo, useState } from 'react';

type EstimateResult = {
  estimateId: string;
  analysis: {
    sceneSummary: string;
    hazardType: string;
    hazardSummary: string;
    illustrationPlan: string;
    peopleCount: number;
    objectComplexity: number;
    backgroundComplexity: number;
    reconstructionNeed: number;
    compositionChange: boolean;
    difficultyScore: number;
    confidence: number;
    confirmationPoints: string[];
  };
  estimate: {
    hourlyRate: number;
    hours: number;
    unitPrice: number;
    quantity: number;
    totalPrice: number;
    deliveryDays: string;
  };
  fixedStyle: {
    name: string;
    outputFormats: string[];
  };
  note: string;
};

const STYLE_IMAGE = '/samples/hiyari/style-reference.jpg';

export default function HiyariEstimateForm() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [illustrationRequest, setIllustrationRequest] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [formats, setFormats] = useState<string[]>(['AI', 'JPG', 'PNG']);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [error, setError] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const totalWithTax = useMemo(() => {
    if (!result) return 0;
    return Math.floor(result.estimate.totalPrice * 1.1);
  }, [result]);

  function toggleFormat(value: string) {
    setFormats((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
    );
  }

  async function runEstimate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setOrdered(false);

    if (!imageFile) {
      setError('ヒヤリハットの現場写真をアップロードしてください。');
      return;
    }

    if (!incidentDescription.trim()) {
      setError('ヒヤリハットの状況説明を入力してください。');
      return;
    }

    setLoading(true);

    try {
      const form = new FormData();
      form.set('image', imageFile);
      form.set('incidentDescription', incidentDescription);
      form.set('illustrationRequest', illustrationRequest);
      form.set('quantity', String(quantity));

      const response = await fetch('/api/hiyari/analyze', {
        method: 'POST',
        body: form,
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'AI見積りに失敗しました。');
      }

      setResult(json);
      setTimeout(() => {
        document.getElementById('hiyari-result')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }

  async function sendOrder() {
    if (!result || !imageFile) return;

    setError('');

    if (!companyName.trim() || !customerName.trim() || !email.trim()) {
      setError('会社名・ご担当者名・メールアドレスを入力してください。');
      return;
    }

    if (formats.length === 0) {
      setError('納品形式を1つ以上選択してください。');
      return;
    }

    setOrderLoading(true);

    try {
      const form = new FormData();
      form.set('image', imageFile);
      form.set('companyName', companyName);
      form.set('customerName', customerName);
      form.set('email', email);
      form.set('phone', phone);
      form.set('estimateId', result.estimateId);
      form.set('incidentDescription', incidentDescription);
      form.set('illustrationRequest', illustrationRequest);
      form.set('quantity', String(result.estimate.quantity));
      form.set('outputFormats', formats.join(','));
      form.set('unitPrice', String(result.estimate.unitPrice));
      form.set('totalPrice', String(result.estimate.totalPrice));
      form.set('deliveryDays', result.estimate.deliveryDays);
      form.set('hazardType', result.analysis.hazardType);
      form.set('hazardSummary', result.analysis.hazardSummary);
      form.set('illustrationPlan', result.analysis.illustrationPlan);

      const response = await fetch('/api/hiyari/order', {
        method: 'POST',
        body: form,
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || '発注申込みの送信に失敗しました。');
      }

      setOrdered(true);
      setTimeout(() => {
        document.getElementById('order-complete')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました。');
    } finally {
      setOrderLoading(false);
    }
  }

  return (
    <main className="hiyariPage">
      <header className="hiyariHeader">
        <a href="https://www.create-support.co.jp/" className="hiyariLogo">
          株式会社クリエイトサポート
        </a>
        <span>法人向け・請求書払い対応</span>
      </header>

      <section className="hiyariHero">
        <div>
          <div className="hiyariEyebrow">AI概算見積り</div>
          <h1>ヒヤリハットを<br />安全教育イラストに</h1>
          <p>
            工場・製造現場の写真と状況説明を入力すると、
            AIが固定タッチの安全教育イラスト制作費を概算します。
          </p>
          <div className="hiyariHeroPoints">
            <span>現場写真から見積り</span>
            <span>タッチ固定で分かりやすい</span>
            <span>そのまま発注申込み</span>
          </div>
        </div>

        <div className="hiyariStyleCard">
          <img src={STYLE_IMAGE} alt="安全教育イラストの固定タッチ見本" />
          <strong>制作タッチはこのイメージで固定</strong>
          <span>安全教育資料・KY活動・社内掲示・eラーニングなどに使用できます。</span>
        </div>
      </section>

      <section className="hiyariFlow">
        <div><b>1</b><span>現場写真と状況を入力</span></div>
        <div><b>2</b><span>AIが概算見積り</span></div>
        <div><b>3</b><span>発注申込み</span></div>
        <div><b>4</b><span>制作・納品・請求書払い</span></div>
      </section>

      <form onSubmit={runEstimate} className="hiyariPanel hiyariForm">
        <div className="hiyariSectionHeading">
          <span>STEP 1</span>
          <h2>ヒヤリハットの内容を入力</h2>
        </div>

        <label className="hiyariField">
          <span>現場写真 <em>必須</em></span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setImageFile(file);
              setPreview(file ? URL.createObjectURL(file) : '');
            }}
          />
        </label>

        {preview && (
          <div className="hiyariPreview">
            <img src={preview} alt="アップロード画像のプレビュー" />
          </div>
        )}

        <label className="hiyariField">
          <span>何が起きそうになりましたか？ <em>必須</em></span>
          <textarea
            value={incidentDescription}
            onChange={(e) => setIncidentDescription(e.target.value)}
            rows={6}
            placeholder="例：台車を押して通路を移動中、荷物で前方が見えにくく、曲がり角から来た作業者と接触しそうになった。"
          />
          <small>
            いつ・どこで・何をしていたとき・何が起きそうになったか、分かる範囲でご記入ください。
          </small>
        </label>

        <label className="hiyariField">
          <span>イラスト化についての希望</span>
          <textarea
            value={illustrationRequest}
            onChange={(e) => setIllustrationRequest(e.target.value)}
            rows={4}
            placeholder="例：荷物で前方が見えないことが分かる構図にしたい。人物と台車は残し、背景は簡略化したい。"
          />
        </label>

        <div className="hiyariTwoCols">
          <label className="hiyariField">
            <span>制作点数</span>
            <input
              type="number"
              min={1}
              max={50}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value || 1))}
            />
          </label>

          <div className="hiyariField">
            <span>希望納品形式</span>
            <div className="hiyariChecks">
              {['AI', 'JPG', 'PNG'].map((format) => (
                <label key={format}>
                  <input
                    type="checkbox"
                    checked={formats.includes(format)}
                    onChange={() => toggleFormat(format)}
                  />
                  {format}
                </label>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="hiyariError">{error}</div>}

        <button className="hiyariPrimary" type="submit" disabled={loading}>
          {loading ? 'AIが写真と内容を分析しています…' : 'AI概算見積りをする'}
        </button>

        <p className="hiyariNote">
          写真と入力内容は見積り・制作検討のために利用します。
          AIは事故原因を断定せず、イラスト制作工数の判定に使用します。
        </p>
      </form>

      {result && (
        <section id="hiyari-result" className="hiyariPanel hiyariResult">
          <div className="hiyariSectionHeading">
            <span>STEP 2</span>
            <h2>AI概算見積り結果</h2>
          </div>

          <div className="hiyariEstimateHero">
            <div>
              <small>概算金額（税別）</small>
              <strong>{result.estimate.totalPrice.toLocaleString()}円</strong>
              <span>税込参考：{totalWithTax.toLocaleString()}円</span>
            </div>
            <dl>
              <div>
                <dt>1点あたり</dt>
                <dd>{result.estimate.unitPrice.toLocaleString()}円</dd>
              </div>
              <div>
                <dt>点数</dt>
                <dd>{result.estimate.quantity}点</dd>
              </div>
              <div>
                <dt>納期目安</dt>
                <dd>{result.estimate.deliveryDays}</dd>
              </div>
            </dl>
          </div>

          <div className="hiyariResultGrid">
            <div className="hiyariResultBox">
              <h3>AIが確認したヒヤリハット</h3>
              <p><b>分類：</b>{result.analysis.hazardType}</p>
              <p>{result.analysis.hazardSummary}</p>
            </div>

            <div className="hiyariResultBox">
              <h3>制作するイラストの内容</h3>
              <p>{result.analysis.illustrationPlan}</p>
              <p className="hiyariMuted">
                固定タッチ：安全教育用カラーイラスト
              </p>
            </div>
          </div>

          {result.analysis.confirmationPoints.length > 0 && (
            <div className="hiyariConfirmBox">
              <h3>制作前に確認したい点</h3>
              <ul>
                {result.analysis.confirmationPoints.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="hiyariNote">{result.note}</p>

          <div className="hiyariOrderBox">
            <div className="hiyariSectionHeading">
              <span>STEP 3</span>
              <h2>この内容で発注を申し込む</h2>
            </div>

            {!ordered ? (
              <>
                <p>
                  法人向け請求書払いです。発注申込み後、クリエイトサポートで写真と内容を確認して制作を開始します。
                </p>

                <div className="hiyariTwoCols">
                  <label className="hiyariField">
                    <span>会社名 <em>必須</em></span>
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="株式会社〇〇"
                    />
                  </label>

                  <label className="hiyariField">
                    <span>ご担当者名 <em>必須</em></span>
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="山田 太郎"
                    />
                  </label>

                  <label className="hiyariField">
                    <span>メールアドレス <em>必須</em></span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="sample@example.com"
                    />
                  </label>

                  <label className="hiyariField">
                    <span>電話番号</span>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="00-0000-0000"
                    />
                  </label>
                </div>

                <div className="hiyariOrderSummary">
                  <span>見積ID：{result.estimateId}</span>
                  <strong>
                    {result.estimate.totalPrice.toLocaleString()}円（税別）
                  </strong>
                  <span>法人向け請求書払い</span>
                </div>

                <button
                  className="hiyariOrderButton"
                  type="button"
                  onClick={sendOrder}
                  disabled={orderLoading}
                >
                  {orderLoading ? '発注申込みを送信中…' : 'この内容で発注を申し込む'}
                </button>

                <p className="hiyariNote">
                  発注申込み後、内容に不明点や大きな条件差がある場合は担当者よりご連絡します。
                  制作完了後、ご指定形式で納品し、請求書をご案内します。
                </p>
              </>
            ) : (
              <div id="order-complete" className="hiyariComplete">
                <strong>発注申込みを受け付けました。</strong>
                <p>
                  受付メールをお送りしました。内容を確認後、制作を進めます。
                </p>
                <span>見積ID：{result.estimateId}</span>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="hiyariBottomInfo">
        <h2>納品・お支払いについて</h2>
        <div>
          <article>
            <strong>納品</strong>
            <p>AI / JPG / PNGから必要な形式で納品。修正内容を確認後、最終データをお送りします。</p>
          </article>
          <article>
            <strong>お支払い</strong>
            <p>法人向け請求書払い。カード決済は不要です。</p>
          </article>
          <article>
            <strong>安全教育用途</strong>
            <p>KY活動、社内掲示、安全教育資料、eラーニング、マニュアルなどに利用できます。</p>
          </article>
        </div>
      </section>
    </main>
  );
}
