'use client';

import { useMemo, useState } from 'react';

type EstimateResult = {
  ok?: boolean;
  analysis?: {
    complexityScore?: number;
    partDensity?: number;
    occlusion?: number;
    lineDifficulty?: number;
    realismRequirement?: number;
    structureComplexity?: number;
    confidence?: number;
    summary?: string;
  };
  estimate?: {
    unitPrice?: number;
    totalPrice?: number;
    priceText?: string;
  };
  error?: string;
};

export default function EstimateForm() {
  const [image, setImage] = useState<File | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [usage, setUsage] = useState('manual');
  const [size, setSize] = useState('a4');
  const [style, setStyle] = useState('line');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [requestFormalQuote, setRequestFormalQuote] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EstimateResult | null>(null);
  const [error, setError] = useState('');

  const score = result?.analysis?.complexityScore ?? 0;

  const stars = useMemo(() => {
    const safeScore = result?.analysis?.complexityScore ?? 50;
    return Math.max(1, Math.min(5, Math.round(safeScore / 20)));
  }, [result]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!image) {
      setError('参考画像をアップロードしてください。');
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('image', image);
      formData.append('customerName', customerName);
      formData.append('companyName', companyName);
      formData.append('email', email);
      formData.append('usage', usage);
      formData.append('size', size);
      formData.append('style', style);
      formData.append('quantity', String(quantity));
      formData.append('notes', notes);
      formData.append('requestFormalQuote', String(requestFormalQuote));

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = (await res.json()) as EstimateResult;

      if (!res.ok || data.error) {
        throw new Error(data.error || '解析に失敗しました。');
      }

      setResult(data);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : '解析中にエラーが発生しました。'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="estimate-page">
      <section className="hero">
        <p className="eyebrow">AI概算見積りシミュレーター</p>
        <h1>イラスト制作の概算金額をその場で確認できます</h1>
        <p className="lead">
          参考画像と条件を入力するだけで、AIがイラスト制作の難易度を判定し、
          概算金額を算出します。
        </p>
        <p className="sublead">
          取扱説明書・パーツカタログ・機械イラスト・販促用リアルイラストなどに対応。
        </p>
      </section>

      <form className="estimate-card" onSubmit={handleSubmit}>
        <div className="field">
          <label>参考画像（必須）</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => setImage(e.target.files?.[0] ?? null)}
          />
          <p className="help">
            JPG / PNG / WebP など。まずは代表的な画像1枚で判定します。
          </p>
        </div>

        <div className="grid">
          <div className="field">
            <label>お名前</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="山田 太郎"
            />
          </div>

          <div className="field">
            <label>会社名</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="株式会社〇〇"
            />
          </div>
        </div>

        <div className="field">
          <label>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sample@example.com"
          />
        </div>

        <div className="grid">
          <div className="field">
            <label>用途</label>
            <select value={usage} onChange={(e) => setUsage(e.target.value)}>
              <option value="manual">取扱説明書・マニュアル</option>
              <option value="parts_catalog">パーツカタログ</option>
              <option value="web">ホームページ・印刷物</option>
              <option value="presentation">プレゼン資料</option>
              <option value="package">パッケージ・販促物</option>
              <option value="other">その他</option>
            </select>
          </div>

          <div className="field">
            <label>サイズ</label>
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="small">小さめ</option>
              <option value="a4">A4程度</option>
              <option value="large">大きめ</option>
            </select>
          </div>
        </div>

        <div className="grid">
          <div className="field">
            <label>表現</label>
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              <option value="line">白黒線画</option>
              <option value="color">カラー</option>
              <option value="realistic">リアルタッチ</option>
            </select>
          </div>

          <div className="field">
            <label>イラスト点数</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value || 1))}
            />
          </div>
        </div>

        <div className="field">
          <label>補足内容</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="使用目的、希望納期、参考資料の内容などがあればご記入ください。"
          />
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={requestFormalQuote}
            onChange={(e) => setRequestFormalQuote(e.target.checked)}
          />
          この内容で正式見積りも希望する
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'AIが解析中です...' : '概算金額を表示する'}
        </button>

        {error && <p className="error">{error}</p>}
      </form>

      {result && (
        <section className="result-card">
          <p className="eyebrow">概算見積り結果</p>
          <h2>{result?.estimate?.priceText ?? '算出できませんでした'}</h2>

          <div className="result-grid">
            <div>
              <p className="result-label">想定難易度</p>
              <p className="stars">
                {'★'.repeat(stars)}
                {'☆'.repeat(5 - stars)}
              </p>
            </div>

            <div>
              <p className="result-label">複雑さスコア</p>
              <p className="score">{score ? `${score}/100` : '-'}</p>
            </div>

            <div>
              <p className="result-label">1点あたり</p>
              <p>
                {result?.estimate?.unitPrice
                  ? `${result.estimate.unitPrice.toLocaleString()}円`
                  : '-'}
              </p>
            </div>

            <div>
              <p className="result-label">合計</p>
              <p>
                {result?.estimate?.totalPrice
                  ? `${result.estimate.totalPrice.toLocaleString()}円`
                  : '-'}
              </p>
            </div>
          </div>

          <div className="analysis-box">
            <p className="result-label">AI判定コメント</p>
            <p>{result?.analysis?.summary ?? '判定コメントはありません。'}</p>
          </div>

          <p className="note">
            ※この金額は参考画像と入力条件から算出した概算です。
            実際の仕様確認後に正式なお見積りをご案内いたします。
          </p>

          {requestFormalQuote && (
            <div className="cta-box">
              <h3>正式見積りのご希望を受け付けました</h3>
              <p>
                入力内容を確認のうえ、必要に応じて担当者よりご連絡いたします。
              </p>
            </div>
          )}
        </section>
      )}

      <section className="trust">
        <h2>対応可能なイラスト制作</h2>
        <ul>
          <li>自動車・バイク・重機・設備機器の取扱説明書用イラスト</li>
          <li>パーツカタログ用分解図・部品図</li>
          <li>機械部品のリアルイラスト・販促用ビジュアル</li>
          <li>アイソメトリックイラスト・プレゼン用図解</li>
          <li>家具・医療器具・玩具・パッケージ用イラスト</li>
        </ul>
      </section>
    </div>
  );
}
