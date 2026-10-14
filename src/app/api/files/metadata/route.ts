import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

function safeJson(data: object, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/files/metadata
 * Menyimpan metadata file ke database setelah file berhasil diupload
 * langsung ke Supabase Storage dari browser (client-side upload).
 * Request body yang dikirim sangat kecil (hanya JSON metadata).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated(req)) {
      return safeJson(
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin.' },
        403
      );
    }

    let body: {
      name?: string;
      folderId?: string | null;
      size?: number;
      mimeType?: string;
      storagePath?: string;
      downloadUrl?: string;
    };

    try {
      body = await req.json();
    } catch {
      return safeJson({ success: false, error: 'Request body harus berformat JSON.' }, 400);
    }

    const { name, folderId, size, mimeType, storagePath, downloadUrl } = body;

    if (!name || !storagePath || !downloadUrl || size === undefined) {
      return safeJson(
        { success: false, error: 'Parameter name, storagePath, downloadUrl, dan size wajib diisi.' },
        400
      );
    }

    const actualFolderId = !folderId || folderId === 'root' ? null : folderId;

    // Simpan ke Supabase Database
    if (isSupabaseConfigured && supabase) {
      const { data: fileRecord, error: dbError } = await supabase
        .from('files')
        .insert({
          name,
          folder_id: actualFolderId,
          size,
          mime_type: mimeType || 'application/octet-stream',
          storage_path: storagePath,
          download_url: downloadUrl,
        })
        .select()
        .single();

      if (dbError) {
        console.error('[POST /api/files/metadata] DB error:', dbError.message);
        return safeJson(
          { success: false, error: `Gagal menyimpan metadata file: ${dbError.message}` },
          500
        );
      }

      return safeJson({ success: true, data: fileRecord });
    }

    // Fallback: local storage (tidak perlu aksi karena client-side upload tidak bisa local)
    return safeJson(
      { success: false, error: 'Supabase tidak terkonfigurasi. Upload langsung hanya tersedia dengan Supabase.' },
      500
    );
  } catch (err) {
    const msg = (err as Error).message || 'Terjadi kesalahan server.';
    console.error('[POST /api/files/metadata] Error:', msg);
    return safeJson({ success: false, error: msg }, 500);
  }
}
