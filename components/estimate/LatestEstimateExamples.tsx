'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './LatestEstimateExamples.module.css';

type Example = { id: string; title: string; price: string; rating: number; comment: string };

export default function LatestEstimateExamples() {
  const [examples, setExamples] = useState<Example[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/estimate-examples', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Could not load estimate examples');
        return response.json();
      })
      .then(result => setExamples(result.examples))
      .catch(() => {
        if (!controller.signal.aborted) setExamples([]);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className={styles.section} aria-labelledby="csw-latest-examples">
      <h2 id="csw-latest-examples">AI概算見積りの事例</h2>
      {examples && examples.length > 0 && (
        <div className={styles.grid}>
          {examples.map(example => (
            <article className={styles.card} key={example.id}>
              <img src={`/api/estimate-reviews/${example.id}/image`} alt={`${example.title}の参考画像`}
                width={320} height={200} loading="lazy" />
              <div className={styles.info}>
                <h3>{example.title}</h3>
                <strong>AI概算　{example.price}</strong>
                <span className={styles.stars} role="img" aria-label={`投稿者評価 5段階中${example.rating}`}>
                  {'★'.repeat(example.rating)}{'☆'.repeat(5 - example.rating)}
                </span>
                {example.comment && (
                  <div className={styles.comment}>
                    <strong>クリエイトサポートからの補足</strong>
                    <p>{example.comment}</p>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <div className={styles.actions}>
        <Link href="/estimate/examples">事例をもっと見る →</Link>
        <Link href="/estimate">自分の資料で無料見積り →</Link>
      </div>
    </section>
  );
}
