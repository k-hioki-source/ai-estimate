'use client';

import { useMemo, useState } from 'react';

export default function EstimateForm() {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [usage, setUsage] = useState('manual');
  const [size, setSize] = useState('a4');
  const [style, setStyle] = useState('line');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [requestFormalQuote, setRequestFormalQuote] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const score = result?.analysis?.complexityScore ?? 0;

  const stars = useMemo(() => {
    const s = result?.analysis?.complexityScore ?? 50;
    return Math.max(1, Math.min(5, Math.round(s / 20)));
  }, [result]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!image) {
      setError('参考画像をアップしてください');
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('image', image);
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

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'エラー');

      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pageShell">
      <div className="container stackLarge">

        {/* ヒーロー */}
        <section className="card hero">
          <span className="eyebrow">AI見積り</span>
          <h1 className="heroTitle">
            イラスト制作の<br />概算金額をその場で確認
          </h1>
          <p className="heroLead">
            画像をアップロードするだけで、AIが難易度を判定し概算金額を算出します。
          </p>

          <div className="heroPoints">
            <span className="miniPoint">最短10秒</span>
            <span className="miniPoint">無料</span>
            <span className="miniPoint">匿名OK</span>
          </div>
        </section>

        {/* フォーム */}
        <form className="card stack" onSubmit={handleSubmit}>

          <div className="field">
            <label>参考画像（必須）</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setImage(file);
                setPreviewUrl(file ? URL.createObjectURL(file) : '');
              }}
            />

            {previewUrl && (
              <img src={previewUrl} className="preview" />
            )}
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label>用途</label>
              <select value={usage} onChange={(e) => setUsage(e.target.value)}>
                <option value="manual">取説</option>
                <option value="parts">パーツ</option>
                <option value="web">WEB</option>
              </select>
            </div>

            <div className="field">
              <label>サイズ</label>
              <select value={size} onChange={(e) => setSize(e.target.value)}>
                <option value="a4">A4</option>
                <option value="large">大</option>
              </select>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label>表現</label>
              <select value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="line">線画</option>
                <option value="color">カラー</option>
                <option value="realistic">リアル</option>
              </select>
            </div>

            <div className="field">
              <label>点数</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="field">
            <label>補足</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="checkRow">
            <input
              type="checkbox"
              checked={requestFormalQuote}
              onChange={(e) => setRequestFormalQuote(e.target.checked)}
            />
            正式見積りを希望する
          </label>

          <button className="primaryButton" disabled={loading}>
            {loading ? '解析中...' : '概算見積りを表示'}
          </button>

          {error && <div className="errorBox">{error}</div>}
        </form>

        {/* 結果 */}
        {result && (
          <section className="card resultHero">

            <div className="badgeRow">
              <span className="badge">AI判定</span>
              <span className="scorePill">スコア {score}</span>
            </div>

            <p className="resultAmountLabel">概算金額</p>
            <h2 className="resultAmount">
              {result?.estimate?.priceText}
            </h2>

            <div className="resultTopGrid">

              <div className="summaryCard">
                <div className="summaryItem">
                  <span>難易度</span>
                  <strong>{'★'.repeat(stars)}</strong>
                </div>

                <div className="summaryItem">
                  <span>単価</span>
                  <strong>
                    {result?.estimate?.unitPrice?.toLocaleString()}円
                  </strong>
                </div>

                <div className="summaryItem">
                  <span>合計</span>
                  <strong>
                    {result?.estimate?.totalPrice?.toLocaleString()}円
                  </strong>
                </div>
              </div>

              <div className="summaryCard">
                <p>{result?.analysis?.summary}</p>
              </div>

            </div>

            <p className="noticeText">
              ※概算です。正式見積りは別途ご案内します。
            </p>

          </section>
        )}

      </div>
    </div>
  );
}
