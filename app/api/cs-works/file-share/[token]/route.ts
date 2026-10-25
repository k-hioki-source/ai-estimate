import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const headers = { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };
  const denied = () => new NextResponse('共有リンクが無効か、有効期限が切れています。', { status: 404, headers });
  try {
    const { token } = await params;
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return denied();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secret) return denied();
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const digest = createHash('sha256').update(token).digest('hex');
    const { data: share, error } = await admin.from('project_file_shares')
      .select('file_id,project_id,expires_at,revoked_at').eq('token_hash', digest).maybeSingle();
    if (error || !share || share.revoked_at || Date.parse(share.expires_at) <= Date.now()) return denied();
    const { data: file } = await admin.from('project_files').select('storage_path,file_type')
      .eq('id', share.file_id).eq('project_id', share.project_id).maybeSingle();
    if (!file || !['review','revision','delivery'].includes(file.file_type)) return denied();
    const { data: signed, error: signError } = await admin.storage.from('project-files').createSignedUrl(file.storage_path, 60);
    if (signError || !signed?.signedUrl) return denied();
    return NextResponse.redirect(signed.signedUrl, { status: 302, headers });
  } catch (error) { console.error('Share access failed', error); return denied(); }
}
