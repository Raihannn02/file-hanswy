/**
 * Client-Side Upload Helper for File HansWY
 *
 * Mengunggah file dalam potongan chunk (3.5 MB per part) melalui endpoint /api/files/chunk.
 * Keunggulan:
 * 1. Tidak terkena batasan 4.5 MB Vercel Serverless Function (karena tiap chunk < 4 MB).
 * 2. Tidak terkena masalah CORS GitHub uploads.github.com (karena server yang mengunggah ke GitHub).
 * 3. Token GitHub tetap aman di server (tidak perlu diekspos ke browser).
 * 4. Mendukung progress bar yang presisi untuk setiap file.
 */

// 3.5 MB per chunk (aman di bawah batas 4.5 MB Vercel)
const CHUNK_SIZE = 3.5 * 1024 * 1024;

export const isBrowserGitHubReady = true;

interface UploadResult {
  assetId?: number;
  downloadUrl: string;
  storagePath: string;
  size: number;
}

export async function uploadFileToGitHubBrowser(
  file: File,
  folderId: string | null,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const folderKey = folderId || 'root';
  const storagePath = `${folderKey}--${Date.now()}_${sanitizedName}`;
  const mimeType = file.type || 'application/octet-stream';

  const totalParts = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

  if (onProgress) onProgress(5);

  let lastResponseData: any = null;

  for (let i = 0; i < totalParts; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkBlob = file.slice(start, end, mimeType);

    const formData = new FormData();
    formData.append('chunk', chunkBlob);
    formData.append('partIndex', i.toString());
    formData.append('totalParts', totalParts.toString());
    formData.append('storagePath', storagePath);
    formData.append('name', file.name);
    formData.append('folderId', folderId || '');
    formData.append('totalSize', file.size.toString());
    formData.append('mimeType', mimeType);

    const res = await fetch('/api/files/chunk', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      let errMessage = `Gagal mengunggah bagian ${i + 1}/${totalParts} (HTTP ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.error) errMessage = errJson.error;
      } catch {
        // ignore
      }
      throw new Error(errMessage);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || `Gagal mengunggah bagian ${i + 1}/${totalParts}`);
    }

    lastResponseData = data;

    if (onProgress) {
      const progressPercent = Math.min(95, Math.round(((i + 1) / totalParts) * 90));
      onProgress(progressPercent);
    }
  }

  if (onProgress) onProgress(100);

  return {
    downloadUrl: lastResponseData?.data?.download_url || '',
    storagePath,
    size: file.size,
  };
}
