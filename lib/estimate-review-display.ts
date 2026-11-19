export type EstimateReview = {
  id: string;
  rating: number;
  style: 'line' | 'color' | 'real';
  quantity: number;
  unit_hours: number | null;
  amount: number | null;
  price_type: 'estimate' | 'reference' | 'consultation';
  admin_comment: string;
};

export const estimateReviewColumns =
  'id,rating,style,quantity,unit_hours,amount,price_type,admin_comment';

export const estimateReviewStyles = {
  line: '白黒線画',
  color: 'カラー',
  real: 'リアルイラスト',
};

export function estimateReviewPrice(review: Pick<EstimateReview, 'price_type' | 'amount'>) {
  if (review.amount === null) return '個別見積り（要相談）';
  const formatted = review.amount.toLocaleString('ja-JP') + '円';
  return review.price_type === 'reference' ? 'イラスト制作部分の参考価格 ' + formatted + '〜' : formatted;
}
