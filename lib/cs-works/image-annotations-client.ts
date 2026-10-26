'use client';
import { getSupabaseBrowserClient } from '../supabase/client';
const pending = new Set<string>();
export function markAnnotationDirty(key: string, dirty: boolean) { if (dirty) pending.add(key); else pending.delete(key); }
export function hasUnsavedAnnotations(projectId: string) { return [...pending].some(k => k.startsWith(projectId + ':')); }
export async function annotationRequest<T>(projectId: string, body?: object): Promise<T> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  if (!data.session) throw new Error('ログインし直してください。');
  const response = await fetch('/api/cs-works/image-annotations' + (body ? '' : '?projectId=' + encodeURIComponent(projectId)), {
    method: body ? 'POST' : 'GET', cache: 'no-store',
    headers: { Authorization: 'Bearer ' + data.session.access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify({ ...body, projectId }) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '修正指示を取得できません。');
  return result as T;
}
