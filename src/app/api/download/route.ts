import { NextRequest, NextResponse } from 'next/server';
import { GET as handleGetByPath } from './[...path]/route';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || searchParams.get('download');
  if (!id) {
    return new NextResponse('Parameter id atau download wajib disertakan', { status: 400 });
  }
  // Wrap id in an array as required by the catch-all segment [...path]
  return handleGetByPath(req, { params: Promise.resolve({ path: [id] }) });
}
