import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { isGitHubConfigured, ghSaveFileMetadata } from '@/lib/github-storage';

function safeJson(data: object, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/files/metadata
 * Menyimpan metadata file ke database (db.json release asset) setelah file berhasil diupload
 * langsung ke GitHub Release Asset dari browser (client-side upload).
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
      githubAssetId?: number;
    };

    try {
      body = await req.json();
    } catch {
      return safeJson({ success: false, error: 'Request body harus berformat JSON.' }, 400);
    }

    const { name, folderId, size, mimeType, storagePath, downloadUrl, githubAssetId } = body;

    if (!name || !storagePath || !downloadUrl || size === undefined) {
      return safeJson(
        { success: false, error: 'Parameter name, storagePath, downloadUrl, dan size wajib diisi.' },
        400
      );
    }

    const actualFolderId = !folderId || folderId === 'root' ? null : folderId;

    if (isGitHubConfigured) {
      const fileRecord = await ghSaveFileMetadata({
        name,
        folderId: actualFolderId,
        size,
        mimeType: mimeType || 'application/octet-stream',
        storagePath,
        downloadUrl,
        githubAssetId,
      });

      return safeJson({ success: true, data: fileRecord });
    }

    return safeJson(
      { success: false, error: 'GitHub Storage tidak terkonfigurasi di server.' },
      500
    );
  } catch (err) {
    const msg = (err as Error).message || 'Terjadi kesalahan server.';
    console.error('[POST /api/files/metadata] Error:', msg);
    return safeJson({ success: false, error: msg }, 500);
  }
}
