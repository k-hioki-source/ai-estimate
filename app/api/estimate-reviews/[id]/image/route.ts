import { NextRequest } from 'next/server';
import { adminClient, requireAdmin } from '../../../../../lib/google-calendar-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });

  try {
    const authorization = request.headers.get('authorization');
    const admin = authorization ? await requireAdmin(authorization) : null;
    const query = (admin?.db ?? adminClient()).from('estimate_reviews').select('image_base64').eq('id', id);
    if (!admin) query.eq('status', 'published');
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

    return new Response(new Uint8Array(Buffer.from(data.image_base64, 'base64')), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Estimate review image read failed', error);
    return new Response(null, { status: 500 });
  }
}
