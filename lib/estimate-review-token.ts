import 'server-only';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { EstimateReview } from './estimate-review-display';

type Snapshot = Pick<EstimateReview, 'style' | 'quantity' | 'unit_hours' | 'amount' | 'price_type'>;
type ReviewTicket = Snapshot & { id: string; expires: number; imageHash: string };

export const estimateReviewInputLimit = 3 * 1024 * 1024;
export const estimateReviewConsentVersion = 1;

function sign(payload: string, key: string) {
  return createHmac('sha256', key).update('csworks-estimate-review-v1:').update(payload).digest();
}

export function estimateReviewImageHash(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function issueEstimateReviewTicket(imageBase64: string, snapshot: Snapshot) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.ESTIMATE_REVIEWS_ENABLED !== '1' || !key) return undefined;
  const bytes = Buffer.from(imageBase64, 'base64');
  if (!bytes.length || bytes.length > estimateReviewInputLimit) return undefined;

  const ticket: ReviewTicket = {
    ...snapshot,
    id: randomUUID(),
    expires: Date.now() + 60 * 60 * 1000,
    imageHash: estimateReviewImageHash(bytes),
  };
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return payload + '.' + sign(payload, key).toString('base64url');
}

export function readEstimateReviewTicket(token: string): ReviewTicket | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.ESTIMATE_REVIEWS_ENABLED !== '1' || !key || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const actual = Buffer.from(signature, 'base64url');
  const expected = sign(payload, key);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const ticket = JSON.parse(Buffer.from(payload, 'base64url').toString()) as ReviewTicket;
    return ticket.expires > Date.now() ? ticket : null;
  } catch {
    return null;
  }
}
