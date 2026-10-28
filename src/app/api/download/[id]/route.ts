import { NextRequest, NextResponse } from 'next/server';
import { getFile } from '@/lib/storage-engine';

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

    // Direct download (GitHub Release Asset / Local URL)
    if (!file.download_url.startsWith('chunked:')) {
      if (file.download_url.startsWith('http')) {
        return NextResponse.redirect(file.download_url, 302);
      }
      const origin = req.nextUrl.origin;
      return NextResponse.redirect(`${origin}${file.download_url}`, 302);
    }

    // Legacy chunked download (jika ada file lama)
    return new NextResponse('Format chunked lama tidak didukung pada migrasi GitHub.', { status: 410 });
  } catch (err) {
    console.error('Download error:', err);
    return new NextResponse('Gagal memproses unduhan', { status: 500 });
  }
}
