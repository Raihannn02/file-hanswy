import { NextRequest, NextResponse } from 'next/server';
import { getFile } from '@/lib/storage-engine';
import { isAdminAuthenticated } from '@/lib/auth';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const GITHUB_OWNER = process.env.GITHUB_OWNER || process.env.NEXT_PUBLIC_GITHUB_OWNER || 'Raihannn02';
const GITHUB_REPO = process.env.GITHUB_REPO || process.env.NEXT_PUBLIC_GITHUB_REPO || 'file-hanswy';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  try {
    const params = await props.params;
    const pathSegments = params?.path || [];
    const fileId = pathSegments[0];
    
    if (!fileId) {
      return new NextResponse('Parameter id wajib diisi', { status: 400 });
    }

    const file = await getFile(fileId);
    if (!file) {
      return new NextResponse('File tidak ditemukan', { status: 404 });
    }

    // If file is hidden and requester is not authenticated admin, block download
    if (file.is_hidden && !isAdminAuthenticated(req)) {
      return new NextResponse('File sedang dalam pengujian (Hidden by Admin)', { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    if (searchParams.get('info') === 'true') {
      return NextResponse.json({
        success: true,
        file: {
          id: file.id,
          name: file.name,
          size: file.size,
          mime_type: file.mime_type,
          created_at: file.created_at,
          is_chunked: file.download_url?.startsWith('chunked:') ?? false,
          download_url: file.download_url,
        },
      });
    }

    // 1. Direct download (single file GitHub Release Asset atau URL Lokal)
    if (!file.download_url.startsWith('chunked:')) {
      const targetUrl = file.download_url.startsWith('http')
        ? file.download_url
        : `${req.nextUrl.origin}${file.download_url}`;

      // PERMANENT FIX: Return 302 Redirect directly to GitHub Release CDN
      // Response size is only ~150 bytes (headers only). 0 bytes of APK payload pass through Vercel.
      // This ensures Vercel bandwidth quota (Fast Origin Transfer) NEVER runs out.
      return NextResponse.redirect(targetUrl, {
        status: 302,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // 2. Handle chunked files by streaming and merging chunks
    // This allows automated installers to download a single file even if it's stored in parts on GitHub.
    const parts = file.download_url.split(':');
    const totalParts = parseInt(parts[1], 10);
    const storagePath = parts.slice(2).join(':');

    // Create a ReadableStream that fetches chunks sequentially
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (let i = 0; i < totalParts; i++) {
            const assetName = `${storagePath}_part${i}`;
            const chunkUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/storage-files/${assetName}`;
            
            const res = await fetch(chunkUrl);
            if (!res.ok) {
              throw new Error(`Failed to fetch chunk ${i} from GitHub: ${res.statusText}`);
            }
            
            const reader = res.body?.getReader();
            if (!reader) {
              throw new Error(`Chunk ${i} has no body`);
            }

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          }
          controller.close();
        } catch (err) {
          console.error('Streaming merge error:', err);
          controller.error(err);
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': file.mime_type || 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${file.name}"`,
        'Content-Length': file.size.toString(),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Download error:', err);
    return new NextResponse('Gagal memproses unduhan', { status: 500 });
  }
}
