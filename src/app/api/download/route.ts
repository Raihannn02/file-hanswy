import { NextRequest, NextResponse } from 'next/server';
import { GET as handleGetById } from './[id]/route';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || searchParams.get('download');
  if (!id) {
    return new NextResponse('Parameter id atau download wajib disertakan', { status: 400 });
  }
  return handleGetById(req, { params: Promise.resolve({ id }) });
}
