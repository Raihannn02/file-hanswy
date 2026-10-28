import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { uploadFileToGitHub, ghSaveFileMetadata, isGitHubConfigured } from '@/lib/github-storage';

export const maxDuration = 60;

function safeJson(data: object, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated(req)) {
      return safeJson(
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin.' },
        403
      );
    }

    if (!isGitHubConfigured) {
      return safeJson(
        { success: false, error: 'GitHub Storage belum dikonfigurasi di server.' },
        500
      );
    }

    const formData = await req.formData();
    const chunk = formData.get('chunk') as Blob | null;
    const partIndexStr = formData.get('partIndex') as string | null;
    const totalPartsStr = formData.get('totalParts') as string | null;
    const storagePath = formData.get('storagePath') as string | null;
    const name = formData.get('name') as string | null;
    const folderId = (formData.get('folderId') as string) || null;
    const totalSizeStr = formData.get('totalSize') as string | null;
    const mimeType = (formData.get('mimeType') as string) || 'application/octet-stream';

    if (!chunk || partIndexStr === null || totalPartsStr === null || !storagePath || !name) {
      return safeJson(
        { success: false, error: 'Parameter upload chunk tidak lengkap.' },
        400
      );
    }

    const partIndex = parseInt(partIndexStr, 10);
    const totalParts = parseInt(totalPartsStr, 10);
    const totalSize = totalSizeStr ? parseInt(totalSizeStr, 10) : chunk.size;

    const arrayBuffer = await chunk.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Tentukan nama asset di GitHub Release
    const assetName = totalParts === 1 ? storagePath : `${storagePath}_part${partIndex}`;

    // Upload chunk ke GitHub Release storage-files
    const { assetId, downloadUrl: assetUrl } = await uploadFileToGitHub(
      buffer,
      assetName,
      mimeType
    );

    // Jika ini adalah part terakhir, simpan metadata ke database (db.json)
    if (partIndex === totalParts - 1) {
      const finalDownloadUrl =
        totalParts === 1
          ? assetUrl
          : `chunked:${totalParts}:${storagePath}`;

      const fileRecord = await ghSaveFileMetadata({
        name,
        folderId: !folderId || folderId === 'root' ? null : folderId,
        size: totalSize,
        mimeType,
        storagePath,
        downloadUrl: finalDownloadUrl,
        githubAssetId: totalParts === 1 ? assetId : undefined,
      });

      return safeJson({
        success: true,
        completed: true,
        data: fileRecord,
      });
    }

    return safeJson({
      success: true,
      completed: false,
      partIndex,
    });
  } catch (err) {
    console.error('Chunk upload error:', err);
    return safeJson(
      { success: false, error: (err as Error).message || 'Gagal mengunggah bagian file.' },
      500
    );
  }
}
