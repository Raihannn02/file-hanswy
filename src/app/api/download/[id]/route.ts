import { NextRequest, NextResponse } from 'next/server';
import { getFile } from '@/lib/storage-engine';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const GITHUB_OWNER = process.env.GITHUB_OWNER || process.env.NEXT_PUBLIC_GITHUB_OWNER || 'Raihannn02';
const GITHUB_REPO = process.env.GITHUB_REPO || process.env.NEXT_PUBLIC_GITHUB_REPO || 'file-hanswy';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const fileId = params?.id;
    if (!fileId) {
      return new NextResponse('Parameter id wajib diisi', { status: 400 });
    }

    const file = await getFile(fileId);
    if (!file) {
      return new NextResponse('File tidak ditemukan', { status: 404 });
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
      if (file.download_url.startsWith('http')) {
        return NextResponse.redirect(file.download_url, 302);
      }
      const origin = req.nextUrl.origin;
      return NextResponse.redirect(`${origin}${file.download_url}`, 302);
    }

    // 2. Chunked download (File > 3.5 MB): Stream parts dari GitHub secara seamless
    const parts = file.download_url.split(':');
    const totalChunks = parseInt(parts[1], 10);
    const basePath = parts.slice(2).join(':');

    const filename = file.name || 'download';
    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    const encodedFilename = encodeURIComponent(filename);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (let i = 0; i < totalChunks; i++) {
            const partName = `${basePath}_part${i}`;
            const partUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/storage-files/${partName}`;

            const res = await fetch(partUrl);
            if (!res.ok || !res.body) {
              throw new Error(`Gagal mengambil bagian ${i + 1}/${totalChunks} (HTTP ${res.status})`);
            }

            const reader = res.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': file.mime_type || 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': file.size.toString(),
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Accept-Ranges': 'none',
      },
    });
  } catch (err) {
    console.error('Download error:', err);
    return new NextResponse('Gagal memproses unduhan', { status: 500 });
  }
}
