import { getSupabaseBrowserClient } from '../supabase/client';
export async function formalQuoteRequest<T>(projectId: string, body?: Record<string, unknown>): Promise<T> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  if (!data.session?.access_token) throw Error('ログインが必要です。');
  const response = await fetch('/api/cs-works/formal-quotes' + (body ? '' : '?projectId=' + encodeURIComponent(projectId)), { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + data.session.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify({ ...body, projectId }) } : {}), cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.error || '正式見積りを取得できません。');
  return result as T;
}
