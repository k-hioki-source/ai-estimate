'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

export default function EstimateReviewForm({ ticket, image }: { ticket: string; image: File }) {
  const [preview, setPreview] = useState('');
  const [rating, setRating] = useState(0);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || !rating || sending) return;
    setSending(true);
    setError('');
    try {
      const form = new FormData();
      form.set('ticket', ticket);
      form.set('rating', String(rating));
      form.set('consentVersion', '1');
      form.set('image', image);
      const response = await fetch('/api/estimate-reviews', { method: 'POST', body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAccepted(true);
    } catch (error) {
      setError(error instanceof Error && error.message && !(error instanceof SyntaxError)
        ? error.message : '投稿に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card">
      <h3>AI概算見積りを評価する</h3>
      {accepted ? (
        <p role="status">匿名の評価を受け付けました。管理者の確認後、公開できる内容を事例一覧に掲載します。</p>
      ) : (
        <details>
          <summary>星評価を選んで匿名で投稿</summary>
          <form onSubmit={submit}>
            <p>星評価、下の参考画像、見積り条件と概算金額・工数が、管理者の確認後に公開されます。画像内に会社名、個人情報、未公開情報が写っていないかご確認ください。</p>
            {preview && <img src={preview} alt="公開対象の参考画像" style={{ maxWidth: '100%', maxHeight: 220 }} />}
            <fieldset disabled={sending}>
              <legend>見積り結果への評価（1〜5）</legend>
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value} style={{ display: 'inline-block', padding: '8px 12px 8px 0' }}>
                  <input
                    type="radio" name="estimate-rating" value={value}
                    checked={rating === value} onChange={() => setRating(value)} required
                  /> ★{value}
                </label>
              ))}
            </fieldset>
            <p>
              <label>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required disabled={sending} />
                この画像を公開する権限があり、画像・概算見積り結果・星評価をインターネット上に公開することに同意します。
              </label>
            </p>
            <button type="submit" className="pdfDownloadButton" disabled={!rating || !consent || sending}>
              {sending ? '投稿中…' : '匿名で投稿する'}
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        </details>
      )}
      <p><Link href="/estimate/examples">AI概算見積りの事例を見る →</Link></p>
    </section>
  );
}
