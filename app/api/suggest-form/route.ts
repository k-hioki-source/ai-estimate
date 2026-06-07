import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { message } = await req.json();

  return NextResponse.json({
    sourceType: 'reference_drawing',
    usage: 'sales',
    style: 'real',
    notes: `依頼内容：${message || ''}`,
    reason: 'テスト送信です。',
  });
}
