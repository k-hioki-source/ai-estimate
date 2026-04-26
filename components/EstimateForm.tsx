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
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    // ★サイズ制限
    if (f.size > 4 * 1024 * 1024) {
      alert('画像サイズが大きすぎます（4MB以下）');
      return;
    }

    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) {
      alert('画像を選択してください');
      return;
    }

    setLoading(true);

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
      alert('エラーが発生しました。画像サイズや形式をご確認ください。');
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
      <h1>AIイラスト概算見積り</h1>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
      />

      <button onClick={handleSubmit} disabled={loading}>
        {loading ? '解析中...' : '見積りする'}
      </button>

      {result && (
        <div className="result">
          <h2>{result.estimate.total.toLocaleString()}円</h2>

          <p>難易度: {difficultyLabel(result.vision.complexityScore)}</p>

          <div>
            <h3>AI判定</h3>
            <p>{result.vision.reason}</p>
          </div>

          <div>
            <h3>計算内訳</h3>
            <p>想定制作時間: {result.estimate.estimatedHours}時間</p>
            <p>制作単価: {result.estimate.hourlyRate}円 / 時間</p>
            <p>1点あたり: {result.estimate.subtotal.toLocaleString()}円</p>
          </div>
        </div>
      )}
    </div>
  );
}
