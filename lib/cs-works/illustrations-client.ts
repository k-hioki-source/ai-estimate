import { getSupabaseBrowserClient } from '../supabase/client';
import type { IllustrationResult } from './illustrations';
export async function illustrationRequest<T>(projectId: string, body?: Record<string, unknown>): Promise<T> {
 const { data } = await getSupabaseBrowserClient().auth.getSession();
 if (!data.session?.access_token) throw Error('ログインが必要です。');
 const r = await fetch('/api/cs-works/illustrations' + (body ? '' : '?projectId=' + encodeURIComponent(projectId)), { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + data.session.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, cache: 'no-store', ...(body ? { body: JSON.stringify({ ...body, projectId }) } : {}) });
 const result = await r.json().catch(() => ({})); if (!r.ok) throw Error(result.error || 'イラスト情報を取得できません。'); return result;
}
export async function notifyIllustrationResult(projectId: string, result: IllustrationResult) {
 if (result.replayed) return true;
 const { data } = await getSupabaseBrowserClient().auth.getSession(); if (!data.session) return false;
 try { return (await fetch('/api/cs-works/notify', { method: 'POST', headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, type: result.notificationType, illustrationOperationId: result.operationId }) })).ok; } catch { return false; }
}
