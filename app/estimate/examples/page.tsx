import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminClient } from '../../../lib/google-calendar-auth';
import {
  estimateReviewColumns, estimateReviewPrice, estimateReviewStyles, type EstimateReview,
} from '../../../lib/estimate-review-display';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'AI概算見積りの事例 | CS Works' };
const pageSize = 12;

export default async function EstimateExamplesPage({ searchParams }: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (process.env.ESTIMATE_REVIEWS_ENABLED !== '1') notFound();
  const { page: value } = await searchParams;
  const parsed = Number(value);
  const page = Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100000 ? parsed : 1;
  const offset = (page - 1) * pageSize;
  const { data, error } = await adminClient().from('estimate_reviews').select(estimateReviewColumns)
    .eq('status', 'published').order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(offset, offset + pageSize);
  if (error) console.error('Estimate examples read failed', error);
  const reviews = (data ?? []) as unknown as EstimateReview[];

  return (
    <main className="container" style={{ paddingBlock: 32 }}>
      <Link href="/estimate">← AI概算見積りへ</Link>
      <h1>AI概算見積りの事例</h1>
      <p>参考画像と概算見積りに対する、利用者の匿名評価です。正式なお見積りは制作内容を確認してご案内します。</p>
      {error && <p role="alert">事例を取得できませんでした。</p>}
      {!error && !reviews.length && <p>このページに掲載中の事例はありません。</p>}
      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
        {reviews.slice(0, pageSize).map((review) => (
          <article key={review.id} className="card" style={{ minWidth: 0 }}>
            <img src={`/api/estimate-reviews/${review.id}/image`} alt="見積りに使用した参考画像"
              loading="lazy" style={{ width: '100%', height: 220, objectFit: 'contain', background: '#f7f8fa' }} />
            <h2>{estimateReviewStyles[review.style]}・{review.quantity}点</h2>
            <p aria-label={`投稿者評価 5段階中${review.rating}`} style={{ color: '#8a5000' }}>
              {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
            </p>
            <p><strong>{estimateReviewPrice(review)}</strong></p>
            {review.unit_hours !== null && <p>概算制作時間　1点あたり{review.unit_hours}時間</p>}
            {review.admin_comment && <>
              <strong>クリエイトサポートからのコメント</strong>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{review.admin_comment}</p>
            </>}
          </article>
        ))}
      </div>
      {(page > 1 || reviews.length > pageSize) && (
        <nav aria-label="事例一覧のページ" style={{ display: 'flex', gap: 20, marginBlock: 20 }}>
          {page > 1 && <Link href={`?page=${page - 1}`}>← 前のページ</Link>}
          {reviews.length > pageSize && <Link href={`?page=${page + 1}`}>次のページ →</Link>}
        </nav>
      )}
    </main>
  );
}
