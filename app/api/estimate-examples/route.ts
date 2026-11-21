import { NextResponse } from 'next/server';
import { adminClient } from '../../../lib/google-calendar-auth';
import { estimateReviewPrice, estimateReviewStyles, type EstimateReview } from '../../../lib/estimate-review-display';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };

export async function GET() {
  if (process.env.ESTIMATE_REVIEWS_ENABLED !== '1') {
    return NextResponse.json({ examples: [] }, { headers });
  }

  try {
    const { data, error } = await adminClient().from('estimate_reviews')
      .select('id,rating,style,quantity,amount,price_type,admin_comment')
      .eq('status', 'published').order('created_at', { ascending: false })
      .order('id', { ascending: false }).limit(3);
    if (error) throw error;
    const reviews = data as Pick<EstimateReview, 'id' | 'rating' | 'style' | 'quantity' | 'amount' | 'price_type' | 'admin_comment'>[];
    return NextResponse.json({
      examples: reviews.map(review => ({
        id: review.id,
        title: `${estimateReviewStyles[review.style]}・${review.quantity}点`,
        price: estimateReviewPrice(review),
        rating: review.rating,
        comment: review.admin_comment?.trim() || '',
      })),
    }, { headers });
  } catch (error) {
    console.error('Latest estimate examples could not be loaded', error);
    return NextResponse.json({ examples: [] }, { status: 503, headers });
  }
}
