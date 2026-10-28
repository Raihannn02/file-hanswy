/**
 * Client-Side GitHub Helper for Direct Browser Uploads
 *
 * Mengunggah file langsung dari browser ke GitHub Releases API
 * (melewati batas serverless Vercel dan tanpa batasan Supabase 50MB)
 * GitHub Release Asset mendukung file hingga 2GB per asset.
 */

const GITHUB_TOKEN = process.env.NEXT_PUBLIC_GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.NEXT_PUBLIC_GITHUB_OWNER || '';
const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || '';

const API_BASE = 'https://api.github.com';
const FILES_TAG = 'storage-files';

export const isBrowserGitHubReady = Boolean(
  GITHUB_TOKEN &&
  GITHUB_TOKEN.length > 10 &&
  GITHUB_OWNER &&
  GITHUB_REPO
);

interface UploadResult {
  assetId: number;
  downloadUrl: string;
  storagePath: string;
  size: number;
}

/**
 * Mendapatkan ID release untuk tag storage-files (atau membuatnya jika belum ada)
 */
async function getOrCreateFilesRelease(): Promise<{ id: number; upload_url: string }> {
  const getRes = await fetch(`${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${FILES_TAG}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (getRes.ok) {
    const data = await getRes.json();
    return { id: data.id, upload_url: data.upload_url };
  }

  if (getRes.status === 404) {
    // Buat release baru
    const createRes = await fetch(`${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tag_name: FILES_TAG,
        name: 'File HansWY - Storage Files',
        body: 'Internal storage for File HansWY uploads. Do not delete this release.',
        draft: false,
        prerelease: false,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Gagal membuat release GitHub untuk files: ${err}`);
    }

    const data = await createRes.json();
    return { id: data.id, upload_url: data.upload_url };
  }

  const errText = await getRes.text();
  throw new Error(`Gagal memeriksa release GitHub: ${errText}`);
}

/**
 * Upload file langsung dari browser ke GitHub Release Asset dengan XMLHttpRequest untuk progress tracking
 */
export async function uploadFileToGitHubBrowser(
  file: File,
  folderId: string | null,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  if (!isBrowserGitHubReady) {
    throw new Error('Konfigurasi GitHub browser belum lengkap (NEXT_PUBLIC_GITHUB_TOKEN/OWNER/REPO).');
  }

  // 1. Dapatkan release
  if (onProgress) onProgress(5);
  const release = await getOrCreateFilesRelease();
  if (onProgress) onProgress(15);

  // 2. Siapkan nama asset
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const folderKey = folderId || 'root';
  const assetName = `${folderKey}--${Date.now()}_${sanitizedName}`;

  // 3. Upload ke endpoint uploads.github.com
  const uploadUrl = `https://uploads.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`;

  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);

    xhr.setRequestHeader('Authorization', `Bearer ${GITHUB_TOKEN}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('Accept', 'application/vnd.github+json');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          // Progress dari 15% sampai 85%
          const pct = 15 + Math.round((evt.loaded / evt.total) * 70);
          onProgress(pct);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve({
            assetId: res.id,
            downloadUrl: res.browser_download_url,
            storagePath: assetName,
            size: file.size,
          });
        } catch (e) {
          reject(new Error('Gagal memproses respon dari GitHub'));
        }
      } else {
        let msg = `GitHub upload error (${xhr.status})`;
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.message) msg = res.message;
        } catch {
          // ignore parse error
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Koneksi ke GitHub terputus saat mengunggah file.'));
    };

    xhr.send(file);
  });
}
