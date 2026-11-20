'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import styles from './EstimateReviewForm.module.css';

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
    <section className={styles.card} aria-labelledby="estimate-review-title">
      <h3 id="estimate-review-title">AI見積り結果を評価してください</h3>
      {accepted ? (
        <div role="status" className={styles.confirmation}>
          <strong>評価を受け付けました。ありがとうございます。</strong>
          <p>投稿は管理者の確認後に掲載します。このまま下のボタンから、PDFのダウンロードや見積りの保存に進めます。</p>
        </div>
      ) : (
        <form onSubmit={submit}>
          <fieldset className={styles.rating} disabled={sending}>
            <legend>星を選んで匿名で評価（任意）</legend>
            <div className={styles.stars}>
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value}>
                  <input
                    type="radio" name="estimate-rating" value={value} aria-label={`星${value}つ`}
                    checked={rating === value} onChange={() => setRating(value)} required
                  />
                  <span aria-hidden="true">{rating >= value ? '★' : '☆'}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {rating > 0 && (
            <div className={styles.details}>
              <p>星評価、下の参考画像、見積り条件と概算金額・工数は、管理者の確認後に公開されます。会社名、個人情報、未公開情報が画像に写っていないかご確認ください。</p>
              {preview && <img src={preview} alt="公開対象の参考画像" className={styles.preview} />}
              <label className={styles.consent}>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required disabled={sending} />
                <span>この画像を公開する権限があり、画像・概算見積り結果・星評価をインターネット上に公開することに同意します。</span>
              </label>
              <button type="submit" className={styles.submit} disabled={!consent || sending}>
                {sending ? '投稿中…' : '匿名で投稿する'}
              </button>
              {error && <p role="alert">{error}</p>}
            </div>
          )}
        </form>
      )}
      <Link href="/estimate/examples" className={styles.examples}>AI概算見積りの事例を見る →</Link>
    </section>
  );
}
