import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const redirectUri = () => {
  const value = process.env.GOOGLE_REDIRECT_URI;
  if (!value) throw new Error('GOOGLE_REDIRECT_URI is missing');
  return value;
};
export const appOrigin = () => new URL(redirectUri()).origin;
export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment is missing');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
export async function requireAdmin(authorization: string | null) {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  if (!match) return null;
  const db = adminClient();
  const { data: { user }, error } = await db.auth.getUser(match[1]);
  if (error || !user) return null;
  const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', user.id).single();
  if (profileError || profile?.role !== 'admin') return null;
  return { user, db };
}
export function encryptToken(token: string) {
  const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error('Encryption key missing');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes (base64)');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function decryptToken(payload: string) {
  const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error('Encryption key missing');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const [version, iv64, tag64, data64] = payload.split(':');
  if (version !== 'v1' || !iv64 || !tag64 || !data64) throw new Error('Invalid token format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv64, 'base64'));
  decipher.setAuthTag(Buffer.from(tag64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data64, 'base64')), decipher.final()]).toString('utf8');
}
