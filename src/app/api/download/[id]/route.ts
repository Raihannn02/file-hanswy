import { NextRequest, NextResponse } from 'next/server';
import { getFile } from '@/lib/storage-engine';
import { supabase, STORAGE_BUCKET } from '@/lib/supabase';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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

    // Direct download (non-chunked file)
    if (!file.download_url.startsWith('chunked:')) {
      if (file.download_url.startsWith('http')) {
        return NextResponse.redirect(file.download_url, 302);
      }
      const origin = req.nextUrl.origin;
      return NextResponse.redirect(`${origin}${file.download_url}`, 302);
    }

    // Chunked download: stream parts seamlessly over HTTP
    const parts = file.download_url.split(':');
    const totalChunks = parseInt(parts[1], 10);
    const basePath = parts.slice(2).join(':');

    if (!supabase) {
      return new NextResponse('Supabase tidak terkonfigurasi', { status: 500 });
    }
    const sb = supabase;

    const filename = file.name || 'download';
    const asciiFilename = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    const encodedFilename = encodeURIComponent(filename);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (let i = 0; i < totalChunks; i++) {
            const chunkPath = `${basePath}_part${i}`;
            const { data: urlData } = sb.storage
              .from(STORAGE_BUCKET)
              .getPublicUrl(chunkPath);

            const res = await fetch(urlData.publicUrl);
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
    const message = (err as Error).message || 'Terjadi kesalahan saat memproses unduhan.';
    console.error('[GET /api/download/[id]] Error:', message);
    return new NextResponse(`Gagal mengunduh: ${message}`, { status: 500 });
  }
}
