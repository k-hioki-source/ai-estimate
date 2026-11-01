import { getSupabaseBrowserClient } from '@/lib/supabase/client';
export async function invitationRequest(path: string, input?: unknown) {
 const { data } = await getSupabaseBrowserClient().auth.getSession();
 if (!data.session) throw Error('ログインしてください。');
 const r = await fetch(path, { method: input ? 'POST' : 'GET', cache: 'no-store', headers: { Authorization: 'Bearer ' + data.session.access_token, ...(input ? { 'Content-Type': 'application/json' } : {}) }, ...(input ? { body: JSON.stringify(input) } : {}) });
 const result = await r.json(); if (!r.ok) throw Error(result.error || '処理を完了できません。'); return result;
}
export const invitationUIEnabled = process.env.NEXT_PUBLIC_CSWORKS_INVITATIONS === 'true' && process.env.NEXT_PUBLIC_CSWORKS_ACCESS_HARDENING === 'true' && process.env.NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES === 'true';
