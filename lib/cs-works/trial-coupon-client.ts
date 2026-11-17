import { getSupabaseBrowserClient } from '../supabase/client';
export const trialCouponEnabled = process.env.NEXT_PUBLIC_CSWORKS_TRIAL_COUPON === 'true';
export type TrialCouponStatus = { granted: boolean; available: boolean; consumed: boolean; granted_at: string | null; consumed_at: string | null; expires_at: string | null; amount: number };
export async function trialCouponRequest<T>(query = '', post = false): Promise<T> {
 const { data } = await getSupabaseBrowserClient().auth.getSession();
 if (!data.session) throw Error('ログインが必要です。');
 const r = await fetch('/api/cs-works/trial-coupon' + query, { method: post ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + data.session.access_token }, cache: 'no-store' });
 const body = await r.json();
 if (!r.ok) throw Error(body.error || 'クーポンを確認できません。');
 return body as T;
}
