import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
export const invitationsEnabled = () => process.env.CSWORKS_INVITATIONS_ENABLED === 'true' && process.env.NEXT_PUBLIC_CSWORKS_ACCESS_HARDENING === 'true' && process.env.NEXT_PUBLIC_CSWORKS_FORMAL_QUOTES === 'true';
export const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' } });
export const uuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export async function actor(req: NextRequest, adminOnly = false) {
 const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if (!token) return null;
 const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
 const { data, error } = await db.auth.getUser(token);
 if (error || !data.user) return null;
 if (adminOnly) { const { data: profile, error } = await db.from('profiles').select('role').eq('id', data.user.id).single(); if (error || profile?.role !== 'admin') return null; }
 return { db, user: data.user };
}
export async function body(req: NextRequest, limit = 650000) {
 const reader = req.body?.getReader(); if (!reader) throw Error('入力がありません。');
 const parts: Uint8Array[] = []; let size = 0;
 while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw Error('入力が大きすぎます。'); } parts.push(value); }
 try { const b = JSON.parse(Buffer.concat(parts).toString('utf8')); if (!b || typeof b !== 'object' || Array.isArray(b)) throw Error(); return b; } catch { throw Error('入力形式を確認してください。'); }
}
export function failure(code?: string) {
 if (code === '42501') return reply({ error: '操作する権限がありません。' }, 403);
 if (code === '40001' || code === '23505') return reply({ error: '内容が更新されています。再読み込みしてください。' }, 409);
 if (code === '54000') return reply({ error: '送信間隔・回数の上限です。時間をおいてください。' }, 429);
 if (code?.startsWith('22')) return reply({ error: '入力内容・明細・納期を確認してください。' }, 400);
 return reply({ error: '処理を完了できません。設定と履歴を確認してください。' }, 503);
}
