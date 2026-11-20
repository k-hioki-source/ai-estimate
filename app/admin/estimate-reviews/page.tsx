'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase/client';
import {
  estimateReviewPrice, estimateReviewStyles, type EstimateReview,
} from '../../../lib/estimate-review-display';

type Review = EstimateReview & {
  status: 'pending' | 'published' | 'hidden';
  created_at: string;
};

const statuses = { pending: '確認待ち', published: '公開中', hidden: '非公開' };

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await getSupabaseBrowserClient().auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) throw new Error('管理者アカウントでログインしてください。');
        const response = await fetch(`/api/admin/estimate-reviews?page=${page}`, {
          headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (controller.signal.aborted) return;
        setToken(accessToken);
        setReviews(result.reviews);
        setHasNext(result.hasNext);
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : '投稿一覧を取得できませんでした。');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [page]);

  return (
    <main className="container" style={{ paddingBlock: 28 }}>
      <Link href="/admin">← 案件管理に戻る</Link>
      <h1>AI見積りの星評価</h1>
      <p>画像を確認し、公開できる投稿を「公開中」に変更してください。管理者コメントは公開事例に表示されます。</p>
      {error && <p role="alert">{error}</p>}
      {loading ? <p role="status">読み込み中…</p> : !error && (
        <>
          {!reviews.length && <p>このページに投稿はありません。</p>}
          {reviews.map((review) => <ReviewEditor key={review.id} initial={review} token={token} />)}
        </>
      )}
      {(page > 1 || hasNext) && <nav aria-label="管理一覧のページ" style={{ display: 'flex', gap: 12 }}>
        <button type="button" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>前のページ</button>
        <button type="button" disabled={loading || !hasNext} onClick={() => setPage(page + 1)}>次のページ</button>
      </nav>}
    </main>
  );
}

function ReviewEditor({ initial, token }: { initial: Review; token: string }) {
  const [review, setReview] = useState(initial);
  const [status, setStatus] = useState(initial.status);
  const [comment, setComment] = useState(initial.admin_comment);
  const [image, setImage] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!image) return;
    return () => URL.revokeObjectURL(image);
  }, [image]);

  async function preview() {
    setPreviewing(true);
    setMessage('');
    try {
      const response = await fetch(`/api/estimate-reviews/${review.id}/image`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error();
      setImage(URL.createObjectURL(await response.blob()));
    } catch {
      setMessage('画像を取得できませんでした。');
    } finally {
      setPreviewing(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/estimate-reviews', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: review.id, status, admin_comment: comment }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setReview(result.review);
      setComment(result.review.admin_comment);
      setMessage('保存しました。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  const publishing = status === 'published' && review.status !== 'published';

  return (
    <article className="card">
      <h2>{estimateReviewStyles[review.style]}・{review.quantity}点</h2>
      <p>★{review.rating} ／ 5　{estimateReviewPrice(review)}　{statuses[review.status]}</p>
      {image ? <img src={image} alt="投稿された参考画像" style={{ maxWidth: '100%', maxHeight: 480 }} /> :
        <button type="button" onClick={preview} disabled={previewing}>{previewing ? '読込中…' : '参考画像を確認'}</button>}
      <form onSubmit={save}>
        <p><label>公開状態 <select value={status} onChange={(event) => setStatus(event.target.value as Review['status'])} disabled={saving}>
          <option value="pending">確認待ち</option>
          <option value="published" disabled={!image && review.status !== 'published'}>公開中</option>
          <option value="hidden">非公開</option>
        </select></label></p>
        <label>管理者コメント
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000}
            rows={3} disabled={saving} style={{ display: 'block', width: '100%' }} />
        </label>
        <p>
          <button type="submit" className="primaryButton" disabled={saving}>
            {saving ? '保存中…' : publishing ? '公開する' : '保存する'}
          </button>
        </p>
      </form>
      {message && <p role="status">{message}</p>}
    </article>
  );
}
