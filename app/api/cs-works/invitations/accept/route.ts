import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { actor, body, failure, invitationsEnabled, reply } from '@/lib/cs-works/invitations-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
 if (!invitationsEnabled()) return reply({ error: 'Not found' }, 404);
 try {
  const a = await actor(req); if (!a) return reply({ error: '招待先のメールアドレスでログインしてください。' }, 401);
  let b; try { b = await body(req, 1024); } catch { return reply({ error: '招待リンクを確認してください。' }, 400); }
  if (typeof b.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(b.token)) return reply({ error: '招待リンクを確認してください。' }, 400);
  const { data, error } = await a.db.rpc('csworks_accept_invitation', { p_hash: createHash('sha256').update(b.token).digest('hex') });
  if (error) return failure(error.code);
  if (data?.error) return reply({ error: data.error === 'rate_limited' ? '試行回数の上限です。15分ほどお待ちください。' : data.error === 'email_confirmation_required' ? 'アカウントのメール確認を完了してください。' : 'この招待は利用できません。招待先のアカウント・有効期限を確認してください。承諾済みの場合はMy Pageをご覧ください。' }, data.error === 'rate_limited' ? 429 : 403);
  return reply(data);
 } catch { return failure(); }
}
