/**
 * GitHub Storage Backend for File HansWY
 *
 * Menggantikan Supabase sebagai backend storage menggunakan GitHub Releases API:
 * - Release tag "storage-metadata" → menyimpan asset db.json (metadata folder & file)
 * - Release tag "storage-files"    → menyimpan semua file yang di-upload sebagai release assets
 *
 * Keuntungan dibanding Supabase Free Tier:
 * - Bandwidth sangat besar untuk public repo (tidak ada egress quota)
 * - File hingga 2GB per asset
 * - Storage tak terbatas untuk release assets
 *
 * Environment variables yang diperlukan:
 * - GITHUB_TOKEN              : Personal Access Token (server-side)
 * - NEXT_PUBLIC_GITHUB_TOKEN  : PAT untuk client-side upload (fine-grained, scope ke repo)
 * - GITHUB_OWNER / NEXT_PUBLIC_GITHUB_OWNER : Pemilik repo
 * - GITHUB_REPO  / NEXT_PUBLIC_GITHUB_REPO  : Nama repo
 */

import { FolderItem, FileItem, FolderContentsResponse, BreadcrumbItem } from './types';

// --------------- Configuration ---------------
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.NEXT_PUBLIC_GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || process.env.NEXT_PUBLIC_GITHUB_OWNER || '';
const GITHUB_REPO = process.env.GITHUB_REPO || process.env.NEXT_PUBLIC_GITHUB_REPO || '';

const API_BASE = 'https://api.github.com';
const METADATA_TAG = 'storage-metadata';
const FILES_TAG = 'storage-files';

export const isGitHubConfigured = Boolean(
  GITHUB_TOKEN && GITHUB_TOKEN.length > 10 &&
  GITHUB_OWNER &&
  GITHUB_REPO
);

// --------------- Types ---------------
interface GitHubRelease {
  id: number;
  tag_name: string;
  upload_url: string;
  assets: GitHubAsset[];
}

interface GitHubAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  content_type: string;
}

interface GitHubDatabase {
  folders: FolderItem[];
  files: (FileItem & { github_asset_id?: number })[];
}

// --------------- In-memory Cache ---------------
let metadataCache: GitHubDatabase | null = null;
let metadataCacheTime = 0;
const CACHE_TTL_MS = 15_000; // 15 detik

function invalidateCache() {
  metadataCache = null;
  metadataCacheTime = 0;
}

// --------------- Default Seed Data ---------------
function getInitialSeedData(): GitHubDatabase {
  return {
    folders: [
      {
        id: 'arceus-folder-id',
        name: 'ARCEUS',
        parent_id: null,
        created_at: '2026-10-14T13:05:34Z',
        updated_at: '2026-10-14T13:05:34Z',
      },
      {
        id: 'delta-lite-folder-id',
        name: 'DELTA LITE',
        parent_id: null,
        created_at: '2026-10-14T09:51:51Z',
        updated_at: '2026-10-14T09:51:51Z',
      },
      {
        id: 'launcher-folder-id',
        name: 'LAUNCHER',
        parent_id: null,
        created_at: '2026-10-14T13:48:56Z',
        updated_at: '2026-10-14T13:48:56Z',
      },
      {
        id: 'android-10-folder-id',
        name: 'ANDROID 10',
        parent_id: 'arceus-folder-id',
        created_at: '2026-10-14T13:05:42Z',
        updated_at: '2026-10-14T13:05:42Z',
      },
      {
        id: 'android-12-folder-id',
        name: 'ANDROID 12',
        parent_id: 'arceus-folder-id',
        created_at: '2026-10-14T13:06:41Z',
        updated_at: '2026-10-14T13:06:41Z',
      },
    ],
    files: [],
  };
}

// --------------- GitHub API Helper ---------------
async function ghFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Merge additional headers from options
  if (options.headers) {
    const extra = options.headers as Record<string, string>;
    Object.assign(headers, extra);
  }

  return fetch(url, { ...options, headers, cache: 'no-store' });
}

// --------------- Release Management ---------------
async function getOrCreateRelease(tag: string, releaseName: string): Promise<GitHubRelease> {
  // Try to get existing release
  const res = await ghFetch(`${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${tag}`);

  if (res.ok) {
    return res.json();
  }

  if (res.status === 404) {
    // Buat tag terlebih dahulu (GitHub Releases API membutuhkan tag yang ada, atau kita buat release yang akan membuat tag otomatis)
    const createRes = await ghFetch(`${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tag,
        name: releaseName,
        body: `Auto-created by File HansWY — ${releaseName}`,
        draft: false,
        prerelease: false,
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Gagal membuat GitHub Release '${tag}': ${errText}`);
    }

    return createRes.json();
  }

  const errText = await res.text();
  throw new Error(`GitHub API error (HTTP ${res.status}): ${errText}`);
}

// --------------- Metadata (db.json) Operations ---------------

/**
 * Membaca metadata dari GitHub Release asset (db.json)
 */
export async function readGitHubMetadata(): Promise<GitHubDatabase> {
  // Check cache first
  if (metadataCache && (Date.now() - metadataCacheTime) < CACHE_TTL_MS) {
    return metadataCache;
  }

  try {
    const release = await getOrCreateRelease(METADATA_TAG, 'Storage Metadata');
    const dbAsset = release.assets.find((a) => a.name === 'db.json');

    if (!dbAsset) {
      // Belum ada metadata → return seed data dan simpan ke GitHub
      const seed = getInitialSeedData();
      await writeGitHubMetadata(seed, release);
      return seed;
    }

    // Download db.json content
    // Gunakan API download dengan Accept: application/octet-stream untuk menghindari caching
    const downloadRes = await ghFetch(
      `${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${dbAsset.id}`,
      { headers: { 'Accept': 'application/octet-stream' } }
    );

    if (!downloadRes.ok) {
      console.warn('Gagal download db.json dari GitHub, menggunakan seed data');
      return getInitialSeedData();
    }

    const data: GitHubDatabase = await downloadRes.json();
    metadataCache = data;
    metadataCacheTime = Date.now();
    return data;
  } catch (err) {
    console.error('Error membaca GitHub metadata:', err);
    return getInitialSeedData();
  }
}

/**
 * Menyimpan metadata ke GitHub Release asset (db.json)
 * Menghapus asset lama dan upload asset baru
 */
export async function writeGitHubMetadata(
  data: GitHubDatabase,
  existingRelease?: GitHubRelease
): Promise<void> {
  const release = existingRelease || await getOrCreateRelease(METADATA_TAG, 'Storage Metadata');

  // Hapus db.json lama jika ada
  const oldAsset = release.assets.find((a) => a.name === 'db.json');
  if (oldAsset) {
    const delRes = await ghFetch(
      `${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${oldAsset.id}`,
      { method: 'DELETE' }
    );
    if (!delRes.ok && delRes.status !== 404) {
      console.warn('Gagal menghapus db.json lama:', await delRes.text());
    }
  }

  // Upload db.json baru
  const uploadUrl = release.upload_url.replace('{?name,label}', '') + '?name=db.json';
  const uploadRes = await ghFetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Gagal menyimpan metadata ke GitHub: ${errText}`);
  }

  // Update cache
  metadataCache = data;
  metadataCacheTime = Date.now();
}

// --------------- File Operations ---------------

/**
 * Upload file sebagai GitHub Release asset
 */
export async function uploadFileToGitHub(
  buffer: Buffer,
  assetName: string,
  contentType: string
): Promise<{ assetId: number; downloadUrl: string; size: number }> {
  const release = await getOrCreateRelease(FILES_TAG, 'Storage Files');

  const uploadUrl = release.upload_url.replace('{?name,label}', '') + `?name=${encodeURIComponent(assetName)}`;
  const uploadRes = await ghFetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(buffer),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Gagal upload file ke GitHub: ${errText}`);
  }

  const asset: GitHubAsset = await uploadRes.json();
  return {
    assetId: asset.id,
    downloadUrl: asset.browser_download_url,
    size: asset.size,
  };
}

/**
 * Hapus file asset dari GitHub Release
 */
export async function deleteGitHubAsset(assetId: number): Promise<void> {
  const res = await ghFetch(
    `${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/assets/${assetId}`,
    { method: 'DELETE' }
  );

  if (!res.ok && res.status !== 404) {
    const errText = await res.text();
    throw new Error(`Gagal menghapus asset dari GitHub: ${errText}`);
  }
}

/**
 * Cari asset ID berdasarkan nama dari files release
 */
export async function findGitHubAssetByName(assetName: string): Promise<number | null> {
  const release = await getOrCreateRelease(FILES_TAG, 'Storage Files');

  // Cek di assets yang sudah ada di release object
  let found = release.assets.find((a) => a.name === assetName);
  if (found) return found.id;

  // Jika tidak ditemukan, mungkin ada pagination. Fetch semua halaman.
  let page = 1;
  while (true) {
    const res = await ghFetch(
      `${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/${release.id}/assets?per_page=100&page=${page}`
    );
    if (!res.ok) break;

    const assets: GitHubAsset[] = await res.json();
    if (assets.length === 0) break;

    found = assets.find((a) => a.name === assetName);
    if (found) return found.id;

    if (assets.length < 100) break;
    page++;
  }

  return null;
}

// --------------- High-level Storage API ---------------
// (Digunakan oleh storage-engine.ts)

export async function ghGetFolderContents(
  targetFolderId: string | null = null
): Promise<FolderContentsResponse> {
  const db = await readGitHubMetadata();
  const actualFolderId = !targetFolderId || targetFolderId === 'root' ? null : targetFolderId;

  // 1. Get current folder info
  const currentFolder = actualFolderId
    ? db.folders.find((f) => f.id === actualFolderId) || null
    : null;

  // 2. Build breadcrumbs
  const breadcrumbs: BreadcrumbItem[] = [{ id: null, name: 'Root' }];
  if (currentFolder) {
    const trail: BreadcrumbItem[] = [{ id: currentFolder.id, name: currentFolder.name }];
    let currParent = currentFolder.parent_id;
    while (currParent) {
      const parent = db.folders.find((f) => f.id === currParent);
      if (parent) {
        trail.unshift({ id: parent.id, name: parent.name });
        currParent = parent.parent_id;
      } else {
        break;
      }
    }
    breadcrumbs.push(...trail);
  }

  // 3. Fetch subfolders
  const folders = db.folders
    .filter((f) => (actualFolderId ? f.parent_id === actualFolderId : f.parent_id === null))
    .map((f) => {
      const subFolderCount = db.folders.filter((sub) => sub.parent_id === f.id).length;
      const fileCount = db.files.filter((file) => file.folder_id === f.id).length;
      return { ...f, item_count: subFolderCount + fileCount };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // 4. Fetch files
  const files = db.files
    .filter((file) => (actualFolderId ? file.folder_id === actualFolderId : !file.folder_id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    currentFolder,
    breadcrumbs,
    folders,
    files,
    totalItems: folders.length + files.length,
    isCloudStorage: true,
    schemaMissing: false,
  };
}

export async function ghCreateFolder(
  name: string,
  parentId: string | null
): Promise<FolderItem> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Nama folder tidak boleh kosong');

  const actualParentId = !parentId || parentId === 'root' ? null : parentId;
  const db = await readGitHubMetadata();

  const newFolder: FolderItem = {
    id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: trimmedName,
    parent_id: actualParentId,
    item_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.folders.push(newFolder);
  await writeGitHubMetadata(db);
  return newFolder;
}

export async function ghRenameFolder(
  folderId: string,
  newName: string
): Promise<FolderItem> {
  const trimmedName = newName.trim();
  if (!trimmedName) throw new Error('Nama folder baru tidak boleh kosong');

  const db = await readGitHubMetadata();
  const folder = db.folders.find((f) => f.id === folderId);
  if (!folder) throw new Error('Folder tidak ditemukan');

  folder.name = trimmedName;
  folder.updated_at = new Date().toISOString();
  await writeGitHubMetadata(db);
  return folder;
}

export async function ghDeleteFolder(folderId: string): Promise<void> {
  const db = await readGitHubMetadata();

  // Kumpulkan semua folder yang perlu dihapus (rekursif)
  const foldersToRemove = new Set<string>([folderId]);
  let foundNew = true;
  while (foundNew) {
    foundNew = false;
    for (const f of db.folders) {
      if (f.parent_id && foldersToRemove.has(f.parent_id) && !foldersToRemove.has(f.id)) {
        foldersToRemove.add(f.id);
        foundNew = true;
      }
    }
  }

  // Hapus file assets dari GitHub Release
  const filesToDelete = db.files.filter((f) => foldersToRemove.has(f.folder_id));
  for (const file of filesToDelete) {
    try {
      if (file.github_asset_id) {
        await deleteGitHubAsset(file.github_asset_id);
      } else if (file.storage_path) {
        const assetId = await findGitHubAssetByName(file.storage_path);
        if (assetId) await deleteGitHubAsset(assetId);
      }
    } catch (err) {
      console.warn(`Gagal menghapus asset file ${file.name}:`, err);
    }
  }

  // Hapus dari metadata
  db.files = db.files.filter((f) => !foldersToRemove.has(f.folder_id));
  db.folders = db.folders.filter((f) => !foldersToRemove.has(f.id));

  await writeGitHubMetadata(db);
}

export async function ghUploadFileRecord(params: {
  name: string;
  folderId: string | null;
  size: number;
  mimeType: string;
  buffer: Buffer;
}): Promise<FileItem> {
  const { name, folderId, size, mimeType, buffer } = params;
  const actualFolderId = !folderId || folderId === 'root' ? null : folderId;

  // Generate unique asset name (tanpa / karena GitHub asset name tidak support /)
  const sanitizedFileName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const assetName = `${actualFolderId || 'root'}--${Date.now()}_${sanitizedFileName}`;

  // Upload ke GitHub Release
  const { assetId, downloadUrl } = await uploadFileToGitHub(buffer, assetName, mimeType);

  // Simpan metadata ke db.json
  const db = await readGitHubMetadata();
  const newFile: FileItem & { github_asset_id?: number } = {
    id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name,
    folder_id: actualFolderId || '',
    size,
    mime_type: mimeType,
    storage_path: assetName,
    download_url: downloadUrl,
    github_asset_id: assetId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.files.push(newFile);
  await writeGitHubMetadata(db);
  return newFile;
}

export async function ghRenameFile(
  fileId: string,
  newName: string
): Promise<FileItem> {
  const trimmedName = newName.trim();
  if (!trimmedName) throw new Error('Nama file baru tidak boleh kosong');

  const db = await readGitHubMetadata();
  const file = db.files.find((f) => f.id === fileId);
  if (!file) throw new Error('File tidak ditemukan');

  file.name = trimmedName;
  file.updated_at = new Date().toISOString();
  await writeGitHubMetadata(db);
  return file;
}

export async function ghDeleteFile(fileId: string): Promise<void> {
  const db = await readGitHubMetadata();
  const file = db.files.find((f) => f.id === fileId);

  if (file) {
    // Hapus asset dari GitHub Release
    try {
      if (file.github_asset_id) {
        await deleteGitHubAsset(file.github_asset_id);
      } else if (file.storage_path) {
        const assetId = await findGitHubAssetByName(file.storage_path);
        if (assetId) await deleteGitHubAsset(assetId);
      }
    } catch (err) {
      console.warn(`Gagal menghapus asset ${file.name} dari GitHub:`, err);
    }

    // Hapus dari metadata
    db.files = db.files.filter((f) => f.id !== fileId);
    await writeGitHubMetadata(db);
  }
}

export async function ghGetFile(fileId: string): Promise<FileItem | null> {
  const db = await readGitHubMetadata();
  return db.files.find((f) => f.id === fileId) || null;
}

/**
 * Simpan metadata file (digunakan setelah client-side upload langsung ke GitHub)
 */
export async function ghSaveFileMetadata(params: {
  name: string;
  folderId: string | null;
  size: number;
  mimeType: string;
  storagePath: string;
  downloadUrl: string;
  githubAssetId?: number;
}): Promise<FileItem> {
  const actualFolderId = !params.folderId || params.folderId === 'root' ? null : params.folderId;

  const db = await readGitHubMetadata();
  const newFile: FileItem & { github_asset_id?: number } = {
    id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: params.name,
    folder_id: actualFolderId || '',
    size: params.size,
    mime_type: params.mimeType,
    storage_path: params.storagePath,
    download_url: params.downloadUrl,
    github_asset_id: params.githubAssetId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.files.push(newFile);
  await writeGitHubMetadata(db);
  return newFile;
}
