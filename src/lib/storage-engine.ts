import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  isGitHubConfigured,
  ghGetFolderContents,
  ghCreateFolder,
  ghRenameFolder,
  ghDeleteFolder,
  ghUploadFileRecord,
  ghRenameFile,
  ghDeleteFile,
  ghGetFile,
} from './github-storage';
import { FolderItem, FileItem, FolderContentsResponse, BreadcrumbItem } from './types';

interface LocalDatabase {
  folders: FolderItem[];
  files: FileItem[];
}

// In serverless environments like Vercel, /var/task is read-only.
// Use os.tmpdir() (/tmp) when running on Vercel for writable storage.
const isVercel = Boolean(process.env.VERCEL);
const DATA_DIR = isVercel ? path.join(os.tmpdir(), 'hanswy-data') : path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = isVercel ? path.join(os.tmpdir(), 'hanswy-uploads') : path.join(process.cwd(), 'public', 'uploads');

function getInitialSeedData(): LocalDatabase {
  const rootLauncherId = 'launcher-folder-id';
  const rootDeltaId = 'lite-delta-folder-id';
  const rootToolsId = 'tools-folder-id';

  const folders: FolderItem[] = [
    {
      id: rootLauncherId,
      name: 'LAUNCHER',
      parent_id: null,
      created_at: '2026-10-14T14:34:00Z',
      updated_at: '2026-10-14T14:34:00Z',
    },
    {
      id: rootDeltaId,
      name: 'LITE DELTA',
      parent_id: null,
      created_at: '2026-10-23T19:53:00Z',
      updated_at: '2026-10-23T19:53:00Z',
    },
    {
      id: rootToolsId,
      name: 'TOOLS',
      parent_id: null,
      created_at: '2026-10-17T05:05:00Z',
      updated_at: '2026-10-17T05:05:00Z',
    },
  ];

  const files: FileItem[] = [
    {
      id: 'file-apk-01',
      name: 'HANSWY LAUNCHER 01-2.742.1059.apk',
      folder_id: rootLauncherId,
      size: 108991283,
      mime_type: 'application/vnd.android.package-archive',
      storage_path: 'demo/launcher-01.apk',
      download_url: '/uploads/sample-package.apk',
      created_at: '2026-10-14T14:34:00Z',
      updated_at: '2026-10-14T14:34:00Z',
    },
  ];
  return { folders, files };
}

function ensureLocalDirs() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('ensureLocalDirs error:', err);
  }
}

function readLocalDb(): LocalDatabase {
  ensureLocalDirs();
  try {
    if (!fs.existsSync(DB_FILE)) {
      const seed = getInitialSeedData();
      fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
      return seed;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Error reading local db, returning seed:', err);
    return getInitialSeedData();
  }
}

function writeLocalDb(data: LocalDatabase) {
  ensureLocalDirs();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write local db:', err);
    throw new Error(`Gagal menyimpan ke penyimpanan lokal: ${(err as Error).message}`);
  }
}

// ----------------------------------------------------
// STORAGE REPOSITORY INTERFACE
// ----------------------------------------------------

export async function getFolderContents(
  targetFolderId: string | null = null
): Promise<FolderContentsResponse> {
  if (isGitHubConfigured) {
    try {
      return await ghGetFolderContents(targetFolderId);
    } catch (err) {
      console.error('GitHub storage getFolderContents error:', err);
      throw err;
    }
  }

  // Fallback to Local Store when GitHub is not configured
  const db = readLocalDb();
  const actualFolderId = !targetFolderId || targetFolderId === 'root' ? null : targetFolderId;

  const currentFolder = actualFolderId
    ? db.folders.find((f) => f.id === actualFolderId) || null
    : null;

  const breadcrumbs: BreadcrumbItem[] = [{ id: null, name: 'Root' }];
  if (currentFolder) {
    const trail: BreadcrumbItem[] = [{ id: currentFolder.id, name: currentFolder.name }];
    let currParentId = currentFolder.parent_id;
    while (currParentId) {
      const p = db.folders.find((f) => f.id === currParentId);
      if (p) {
        trail.unshift({ id: p.id, name: p.name });
        currParentId = p.parent_id;
      } else {
        break;
      }
    }
    breadcrumbs.push(...trail);
  }

  const folders = db.folders
    .filter((f) => (actualFolderId ? f.parent_id === actualFolderId : f.parent_id === null))
    .map((f) => {
      const subFolderCount = db.folders.filter((sub) => sub.parent_id === f.id).length;
      const fileCount = db.files.filter((file) => file.folder_id === f.id).length;
      return {
        ...f,
        item_count: subFolderCount + fileCount,
      };
    });

  const files = db.files.filter((file) =>
    actualFolderId ? file.folder_id === actualFolderId : !file.folder_id
  );

  return {
    currentFolder,
    breadcrumbs,
    folders,
    files,
    totalItems: folders.length + files.length,
    isCloudStorage: false,
  };
}

export async function createFolder(
  name: string,
  parentId: string | null
): Promise<FolderItem> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Nama folder tidak boleh kosong');

  const actualParentId = !parentId || parentId === 'root' ? null : parentId;

  if (isGitHubConfigured) {
    return await ghCreateFolder(trimmedName, actualParentId);
  }

  // Local store
  const db = readLocalDb();
  const newFolder: FolderItem = {
    id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name: trimmedName,
    parent_id: actualParentId,
    item_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.folders.push(newFolder);
  writeLocalDb(db);
  return newFolder;
}

export async function renameFolder(folderId: string, newName: string): Promise<FolderItem> {
  const trimmedName = newName.trim();
  if (!trimmedName) throw new Error('Nama folder baru tidak boleh kosong');

  if (isGitHubConfigured) {
    return await ghRenameFolder(folderId, trimmedName);
  }

  const db = readLocalDb();
  const folder = db.folders.find((f) => f.id === folderId);
  if (!folder) throw new Error('Folder tidak ditemukan');

  folder.name = trimmedName;
  folder.updated_at = new Date().toISOString();
  writeLocalDb(db);
  return folder;
}

export async function deleteFolder(folderId: string): Promise<void> {
  if (isGitHubConfigured) {
    return await ghDeleteFolder(folderId);
  }

  // Local recursive delete
  const db = readLocalDb();
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

  db.files = db.files.filter((file) => !foldersToRemove.has(file.folder_id));
  db.folders = db.folders.filter((folder) => !foldersToRemove.has(folder.id));

  writeLocalDb(db);
}

export async function uploadFileRecord(params: {
  name: string;
  folderId: string | null;
  size: number;
  mimeType: string;
  buffer: Buffer;
}): Promise<FileItem> {
  if (isGitHubConfigured) {
    return await ghUploadFileRecord(params);
  }

  // Local storage fallback
  const { name, folderId, size, mimeType, buffer } = params;
  const actualFolderId = !folderId || folderId === 'root' ? null : folderId;
  const sanitizedFileName = name.replace(/[^a-zA-Z0-9._-]/g, '_');

  ensureLocalDirs();
  const localFileName = `${Date.now()}_${sanitizedFileName}`;
  const localFilePath = path.join(UPLOADS_DIR, localFileName);
  fs.writeFileSync(localFilePath, buffer);

  const db = readLocalDb();
  const newFile: FileItem = {
    id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name,
    folder_id: actualFolderId || '',
    size,
    mime_type: mimeType,
    storage_path: localFileName,
    download_url: `/uploads/${localFileName}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.files.push(newFile);
  writeLocalDb(db);
  return newFile;
}

export async function renameFile(fileId: string, newName: string): Promise<FileItem> {
  const trimmedName = newName.trim();
  if (!trimmedName) throw new Error('Nama file baru tidak boleh kosong');

  if (isGitHubConfigured) {
    return await ghRenameFile(fileId, trimmedName);
  }

  const db = readLocalDb();
  const file = db.files.find((f) => f.id === fileId);
  if (!file) throw new Error('File tidak ditemukan');

  file.name = trimmedName;
  file.updated_at = new Date().toISOString();
  writeLocalDb(db);
  return file;
}

export async function deleteFile(fileId: string): Promise<void> {
  if (isGitHubConfigured) {
    return await ghDeleteFile(fileId);
  }

  const db = readLocalDb();
  const file = db.files.find((f) => f.id === fileId);
  if (file) {
    const localFilePath = path.join(UPLOADS_DIR, file.storage_path);
    if (fs.existsSync(localFilePath)) {
      try {
        fs.unlinkSync(localFilePath);
      } catch (e) {
        console.warn('Could not delete local file from disk:', e);
      }
    }
    db.files = db.files.filter((f) => f.id !== fileId);
    writeLocalDb(db);
  }
}

export async function getFile(fileId: string): Promise<FileItem | null> {
  if (isGitHubConfigured) {
    return await ghGetFile(fileId);
  }

  const db = readLocalDb();
  return db.files.find((f) => f.id === fileId) || null;
}
