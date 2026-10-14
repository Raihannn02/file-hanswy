import fs from 'fs';
import path from 'path';
import os from 'os';
import { supabase, isSupabaseConfigured, STORAGE_BUCKET } from './supabase';
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
  const rootArceusId = 'arceus-folder-id';
  const rootDeltaId = 'delta-lite-folder-id';
  const rootLauncherId = 'launcher-folder-id';
  const android10Id = 'android-10-folder-id';
  const android12Id = 'android-12-folder-id';

  const folders: FolderItem[] = [
    {
      id: rootArceusId,
      name: 'ARCEUS',
      parent_id: null,
      created_at: '2026-10-14T13:05:34Z',
      updated_at: '2026-10-14T13:05:34Z',
    },
    {
      id: rootDeltaId,
      name: 'DELTA LITE',
      parent_id: null,
      created_at: '2026-10-14T09:51:51Z',
      updated_at: '2026-10-14T09:51:51Z',
    },
    {
      id: rootLauncherId,
      name: 'LAUNCHER',
      parent_id: null,
      created_at: '2026-10-14T13:48:56Z',
      updated_at: '2026-10-14T13:48:56Z',
    },
    {
      id: android10Id,
      name: 'ANDROID 10',
      parent_id: rootArceusId,
      created_at: '2026-10-14T13:05:42Z',
      updated_at: '2026-10-14T13:05:42Z',
    },
    {
      id: android12Id,
      name: 'ANDROID 12',
      parent_id: rootArceusId,
      created_at: '2026-10-14T13:06:41Z',
      updated_at: '2026-10-14T13:06:41Z',
    },
  ];

  const files: FileItem[] = [];
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
  const isCloud = isSupabaseConfigured && supabase !== null;

  if (isCloud && supabase) {
    try {
      // 1. Get current folder info if not root
      let currentFolder: FolderItem | null = null;
      if (targetFolderId && targetFolderId !== 'root') {
        const { data: folderData, error: folderErr } = await supabase
          .from('folders')
          .select('*')
          .eq('id', targetFolderId)
          .single();

        if (folderErr) {
          if (folderErr.code === 'PGRST205' || folderErr.message?.includes('Could not find the table')) {
            return {
              currentFolder: null,
              breadcrumbs: [{ id: null, name: 'Root' }],
              folders: [],
              files: [],
              totalItems: 0,
              isCloudStorage: true,
              schemaMissing: true,
              errorMessage: "Tabel 'folders' belum dibuat di Supabase. Silakan jalankan file supabase-schema.sql di Supabase SQL Editor.",
            };
          }
          throw new Error(`Gagal memuat folder: ${folderErr.message}`);
        }
        currentFolder = folderData;
      }

      // 2. Build breadcrumbs
      const breadcrumbs: BreadcrumbItem[] = [{ id: null, name: 'Root' }];
      if (currentFolder) {
        const trail: BreadcrumbItem[] = [{ id: currentFolder.id, name: currentFolder.name }];
        let currParent = currentFolder.parent_id;
        while (currParent) {
          const { data: parentFolder } = await supabase
            .from('folders')
            .select('id, name, parent_id')
            .eq('id', currParent)
            .single();
          if (parentFolder) {
            trail.unshift({ id: parentFolder.id, name: parentFolder.name });
            currParent = parentFolder.parent_id;
          } else {
            break;
          }
        }
        breadcrumbs.push(...trail);
      }

      // 3. Fetch subfolders
      const folderQuery = supabase.from('folders').select('*').order('name');
      if (!targetFolderId || targetFolderId === 'root') {
        folderQuery.is('parent_id', null);
      } else {
        folderQuery.eq('parent_id', targetFolderId);
      }

      const { data: foldersData, error: foldersErr } = await folderQuery;
      if (foldersErr) {
        if (foldersErr.code === 'PGRST205' || foldersErr.message?.includes('Could not find the table')) {
          return {
            currentFolder: null,
            breadcrumbs: [{ id: null, name: 'Root' }],
            folders: [],
            files: [],
            totalItems: 0,
            isCloudStorage: true,
            schemaMissing: true,
            errorMessage: "Tabel 'folders' belum dibuat di Supabase. Silakan jalankan file supabase-schema.sql di Supabase SQL Editor.",
          };
        }
        throw new Error(`Gagal memuat daftar subfolder: ${foldersErr.message}`);
      }

      const folders: FolderItem[] = foldersData || [];

      // Calculate item_count for each subfolder
      for (const f of folders) {
        const { count: subFolderCount } = await supabase
          .from('folders')
          .select('id', { count: 'exact', head: true })
          .eq('parent_id', f.id);
        const { count: fileCount } = await supabase
          .from('files')
          .select('id', { count: 'exact', head: true })
          .eq('folder_id', f.id);
        f.item_count = (subFolderCount || 0) + (fileCount || 0);
      }

      // 4. Fetch files in current folder
      let files: FileItem[] = [];
      const fileQuery = supabase.from('files').select('*').order('name');
      if (targetFolderId && targetFolderId !== 'root') {
        fileQuery.eq('folder_id', targetFolderId);
      } else {
        fileQuery.is('folder_id', null);
      }

      const { data: filesData, error: filesErr } = await fileQuery;
      if (filesErr) {
        console.warn('Gagal memuat files:', filesErr.message);
      } else {
        files = filesData || [];
      }

      const totalItems = folders.length + files.length;

      return {
        currentFolder,
        breadcrumbs,
        folders,
        files,
        totalItems,
        isCloudStorage: true,
        schemaMissing: false,
      };
    } catch (err) {
      console.error('Supabase query error:', err);
      throw err;
    }
  }

  // Fallback to Local Store when Supabase is not configured
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
  const isCloud = isSupabaseConfigured && supabase !== null;

  if (isCloud && supabase) {
    const { data, error } = await supabase
      .from('folders')
      .insert({
        name: trimmedName,
        parent_id: actualParentId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('Could not find the table')) {
        throw new Error("Tabel 'folders' belum dibuat di Supabase. Silakan jalankan skrip supabase-schema.sql di SQL Editor Supabase terlebih dahulu.");
      }
      throw new Error(`Gagal membuat folder di Supabase: ${error.message}`);
    }

    return data;
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

  const isCloud = isSupabaseConfigured && supabase !== null;
  if (isCloud && supabase) {
    const { data, error } = await supabase
      .from('folders')
      .update({ name: trimmedName, updated_at: new Date().toISOString() })
      .eq('id', folderId)
      .select()
      .single();

    if (error) {
      throw new Error(`Gagal mengubah nama folder di Supabase: ${error.message}`);
    }
    return data;
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
  const isCloud = isSupabaseConfigured && supabase !== null;

  if (isCloud && supabase) {
    // 1. Delete files in folder from Supabase Storage
    const { data: filesToDelete, error: fetchFilesErr } = await supabase
      .from('files')
      .select('storage_path, download_url')
      .eq('folder_id', folderId);

    if (fetchFilesErr && fetchFilesErr.code !== 'PGRST205') {
      console.warn('Warning fetching files to delete:', fetchFilesErr.message);
    }

    if (filesToDelete && filesToDelete.length > 0) {
      const paths: string[] = [];
      for (const f of filesToDelete) {
        if (f.storage_path) paths.push(f.storage_path);
        if (f.download_url && f.download_url.startsWith('chunked:')) {
          const parts = f.download_url.split(':');
          const count = parseInt(parts[1], 10);
          const basePath = parts.slice(2).join(':');
          for (let i = 0; i < count; i++) {
            paths.push(`${basePath}_part${i}`);
          }
        }
      }
      if (paths.length > 0) {
        await supabase.storage.from(STORAGE_BUCKET).remove(paths);
      }
    }

    // 2. Delete folder from Supabase Database
    const { error: delErr } = await supabase.from('folders').delete().eq('id', folderId);
    if (delErr) {
      if (delErr.code === 'PGRST205' || delErr.message?.includes('Could not find the table')) {
        throw new Error("Tabel 'folders' belum dibuat di Supabase. Silakan jalankan skrip supabase-schema.sql di SQL Editor Supabase terlebih dahulu.");
      }
      throw new Error(`Gagal menghapus folder dari Supabase: ${delErr.message}`);
    }
    return;
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
  const { name, folderId, size, mimeType, buffer } = params;
  const actualFolderId = !folderId || folderId === 'root' ? null : folderId;
  const isCloud = isSupabaseConfigured && supabase !== null;

  const sanitizedFileName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueStorageKey = `${actualFolderId || 'root'}/${Date.now()}_${sanitizedFileName}`;

  if (isCloud && supabase) {
    // 1. Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(uniqueStorageKey, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload Supabase Storage gagal: ${uploadError.message}. Pastikan bucket '${STORAGE_BUCKET}' sudah dibuat di Supabase.`);
    }

    // 2. Get public download URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(uniqueStorageKey);

    const downloadUrl = urlData.publicUrl;

    // 3. Insert record into files table
    const { data: fileRecord, error: dbError } = await supabase
      .from('files')
      .insert({
        name,
        folder_id: actualFolderId,
        size,
        mime_type: mimeType,
        storage_path: uniqueStorageKey,
        download_url: downloadUrl,
      })
      .select()
      .single();

    if (dbError) {
      throw new Error(`Gagal menyimpan metadata file ke database Supabase: ${dbError.message}`);
    }

    return fileRecord;
  }

  // Local storage fallback
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

  const isCloud = isSupabaseConfigured && supabase !== null;
  if (isCloud && supabase) {
    const { data, error } = await supabase
      .from('files')
      .update({ name: trimmedName, updated_at: new Date().toISOString() })
      .eq('id', fileId)
      .select()
      .single();

    if (error) {
      throw new Error(`Gagal mengubah nama file di Supabase: ${error.message}`);
    }
    return data;
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
  const isCloud = isSupabaseConfigured && supabase !== null;

  if (isCloud && supabase) {
    const { data: file } = await supabase
      .from('files')
      .select('storage_path, download_url')
      .eq('id', fileId)
      .single();

    if (file?.storage_path) {
      const pathsToDelete = [file.storage_path];
      if (file.download_url && file.download_url.startsWith('chunked:')) {
        const parts = file.download_url.split(':');
        const count = parseInt(parts[1], 10);
        const basePath = parts.slice(2).join(':');
        for (let i = 0; i < count; i++) {
          pathsToDelete.push(`${basePath}_part${i}`);
        }
      }
      await supabase.storage.from(STORAGE_BUCKET).remove(pathsToDelete);
    }

    const { error } = await supabase.from('files').delete().eq('id', fileId);
    if (error) {
      throw new Error(`Gagal menghapus file dari Supabase: ${error.message}`);
    }
    return;
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
