'use client';

import { useState } from 'react';

type ApiResponse = {
  input: {
    requestFormalQuote: boolean;
  };
  vision: {
    subjectType: string;
    complexityScore: number;
    partDensity: number;
    lineDifficulty: number;
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
};

export default function EstimateForm() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];

    if (!f) {
      setPreview(null);
      return;
    }

    // ★サイズ制限（重要）
    if (f.size > 4 * 1024 * 1024) {
      setError('画像サイズが大きすぎます（4MB以下にしてください）');
      e.target.value = '';
      setPreview(null);
      return;
    }

    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('画像を選択してください');
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('usage', 'manual');
    formData.append('style', 'line');
    formData.append('quantity', '1');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const text = await res.text();

      let json: ApiResponse;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(text);
      }

      setResult(json);
    } catch (e) {
      console.error(e);
      setError('エラーが発生しました。画像形式やサイズをご確認ください。');
    }

    setLoading(false);
  };

  const difficultyLabel = (score: number) => {
    if (score < 30) return 'やさしめ';
    if (score < 60) return '標準';
    return '高難度';
  };

  return (
    <div className="container">

      <h1 className="title">AIイラスト概算見積り</h1>

      <div className="card">

        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
        />

        {preview && (
          <div style={{ marginTop: 10 }}>
            <img src={preview} alt="preview" style={{ maxWidth: '100%' }} />
          </div>
        )}

        {error && <p style={{ color: 'red' }}>{error}</p>}

        <button onClick={handleSubmit} disabled={loading}>
          {loading ? '解析中...' : '見積りする'}
        </button>
      </div>

      {result && (
        <div className="result">

          <div className="resultHeader">
            <h2>{result.estimate.total.toLocaleString()}円</h2>
            <p>納期目安：{result.estimate.deliveryDays}</p>
          </div>

          <div className="resultGrid">

            <div className="resultBox">
              <h3>AI判定</h3>
              <p>対象：{result.vision.subjectType}</p>
              <p>難易度：{difficultyLabel(result.vision.complexityScore)}</p>
              <p>部品密度：{result.vision.partDensity}</p>
              <p>線の難しさ：{result.vision.lineDifficulty}</p>
              <p>構造難度：{result.vision.structureComplexity}</p>
              <p>信頼度：{result.vision.confidence}</p>
              <p>理由：{result.vision.reason}</p>
            </div>

            <div className="resultBox">
              <h3>計算内訳</h3>
              <p>想定制作時間：{result.estimate.estimatedHours}時間</p>
              <p>制作単価：{result.estimate.hourlyRate.toLocaleString()}円 / 時間</p>
              <p>1点あたり：{result.estimate.subtotal.toLocaleString()}円</p>
              <p>点数：{result.estimate.quantity}</p>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
