'use client';

import React, { useState, useEffect, useCallback, useRef, DragEvent } from 'react';
import {
  Folder,
  FileText,
  Download,
  Link as LinkIcon,
  RotateCw,
  Plus,
  Upload,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Trash2,
  Edit2,
  Lock,
  Unlock,
  Check,
  AlertCircle,
  Menu,
  X,
  Zap,
  Smartphone,
  Archive,
  Music,
  Video,
  Image as ImageIcon,
  Files,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { FolderItem, FileItem, BreadcrumbItem } from '@/lib/types';
import { isBrowserGitHubReady, uploadFileToGitHubBrowser } from '@/lib/github-browser';

interface UserInfo {
  name: string;
  role: 'admin' | 'guest';
}

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

// ---- Bulk Upload Types ----
type UploadStatus = 'queued' | 'uploading' | 'success' | 'error';

interface UploadQueueItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number; // 0-100
  errorMessage?: string;
}

// Helper to safely parse JSON from fetch response
async function safeParseJson(res: Response): Promise<{ success: boolean; [key: string]: unknown }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Response was not JSON (e.g. Vercel size limit HTML error page)
    const statusText = res.statusText || `HTTP ${res.status}`;
    if (res.status === 413) {
      return { success: false, error: 'Ukuran file terlalu besar. Coba gunakan file yang lebih kecil.' };
    }
    return { success: false, error: `Server error (${statusText}): ${text.substring(0, 120)}` };
  }
}

export default function FileHansWYApp() {
  // Navigation & State
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: 'Root' }]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isCloudStorage, setIsCloudStorage] = useState<boolean>(false);
  const [schemaMissing, setSchemaMissing] = useState<boolean>(false);
  const [schemaErrorMessage, setSchemaErrorMessage] = useState<string>('');

  // User & Auth State
  const [user, setUser] = useState<UserInfo>({ name: 'GuestUser', role: 'guest' });
  const [showAuthDropdown, setShowAuthDropdown] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  // Modals State
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  const [showCreateFolderModal, setShowCreateFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [creatingFolder, setCreatingFolder] = useState<boolean>(false);

  // Upload Modal (Bulk)
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState<boolean>(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const [renameTarget, setRenameTarget] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Auto-download state (when URL has ?download=...)
  const [autoDownloadFile, setAutoDownloadFile] = useState<{
    id: string;
    name: string;
    size: number;
    mime_type?: string;
    is_chunked: boolean;
    download_url: string;
  } | null>(null);
  const [autoDownloadLoading, setAutoDownloadLoading] = useState<boolean>(false);
  const [autoDownloadError, setAutoDownloadError] = useState<string>('');

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  // Check auth status
  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth');
      const data = await safeParseJson(res);
      if (data.user) {
        setUser(data.user as UserInfo);
      }
    } catch (e) {
      console.error('Failed to check auth:', e);
    }
  };

  // Fetch folder contents
  const fetchContents = useCallback(
    async (folderId: string | null = null, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : '';
        const res = await fetch(`/api/folders${query}`);
        const result = await safeParseJson(res);

        if (result.success && result.data) {
          const d = result.data as {
            currentFolder: FolderItem | null;
            breadcrumbs: BreadcrumbItem[];
            folders: FolderItem[];
            files: FileItem[];
            isCloudStorage: boolean;
            schemaMissing?: boolean;
            errorMessage?: string;
          };
          setCurrentFolder(d.currentFolder);
          setBreadcrumbs(d.breadcrumbs);
          setFolders(d.folders);
          setFiles(d.files);
          setIsCloudStorage(d.isCloudStorage);
          setSchemaMissing(Boolean(d.schemaMissing));
          if (d.schemaMissing && d.errorMessage) {
            setSchemaErrorMessage(d.errorMessage);
          }
        } else {
          showToast((result.error as string) || 'Gagal memuat isi direktori', 'error');
        }
      } catch (err) {
        showToast((err as Error).message || 'Terjadi kesalahan jaringan', 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    checkAuth();
    fetchContents(currentFolderId);
  }, [currentFolderId, fetchContents]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('.user-status-card') && !target.closest('.auth-dropdown')) {
        setShowAuthDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const navigateToFolder = (id: string | null) => {
    setCurrentFolderId(id);
  };

  const navigateToParent = () => {
    if (breadcrumbs.length > 1) {
      const parentBreadcrumb = breadcrumbs[breadcrumbs.length - 2];
      setCurrentFolderId(parentBreadcrumb.id);
    } else {
      setCurrentFolderId(null);
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordInput }),
      });
      const data = await safeParseJson(res);
      if (data.success) {
        setUser(data.user as UserInfo);
        setShowLoginModal(false);
        setAdminPasswordInput('');
        showToast('Login berhasil sebagai HansWY (Admin) ✓', 'success');
      } else {
        setAuthError((data.error as string) || 'Password salah');
      }
    } catch {
      setAuthError('Gagal menghubungkan ke server');
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
      setUser({ name: 'GuestUser', role: 'guest' });
      setShowAuthDropdown(false);
      showToast('Anda telah logout dari mode Admin', 'info');
    } catch (e) {
      console.error(e);
    }
  };

  // Guard for admin actions
  const requireAdmin = (): boolean => {
    if (user.role !== 'admin') {
      setShowLoginModal(true);
      showToast('Tindakan ini memerlukan izin Admin. Silakan login.', 'info');
      return false;
    }
    return true;
  };

  // Handle Create Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAdmin()) return;
    if (!newFolderName.trim()) {
      showToast('Nama folder wajib diisi', 'error');
      return;
    }

    setCreatingFolder(true);
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), parentId: currentFolderId }),
      });
      const data = await safeParseJson(res);
      if (data.success) {
        showToast(`Folder "${newFolderName}" berhasil dibuat ✓`, 'success');
        setNewFolderName('');
        setShowCreateFolderModal(false);
        fetchContents(currentFolderId, true);
      } else {
        showToast((data.error as string) || 'Gagal membuat folder', 'error');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setCreatingFolder(false);
    }
  };

  // ---- BULK UPLOAD LOGIC ----

  const addFilesToQueue = (newFiles: File[]) => {
    const items: UploadQueueItem[] = newFiles.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file: f,
      status: 'queued',
      progress: 0,
    }));
    setUploadQueue((prev) => [...prev, ...items]);
  };

  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToQueue(Array.from(e.target.files));
      e.target.value = ''; // reset so same files can be re-added
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const removeFromQueue = (id: string) => {
    setUploadQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const uploadSingleFile = async (item: UploadQueueItem): Promise<void> => {
    // Mark as uploading
    setUploadQueue((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', progress: 5 } : i))
    );

    const setProgress = (p: number) => {
      setUploadQueue((prev) =>
        prev.map((i) => (i.id === item.id && i.status === 'uploading' ? { ...i, progress: p } : i))
      );
    };

    const setError = (msg: string) => {
      setUploadQueue((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: 'error', progress: 0, errorMessage: msg } : i
        )
      );
    };

    const setSuccess = () => {
      setUploadQueue((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'success', progress: 100 } : i))
      );
    };

    try {
      // ================================================================
      // STRATEGI: Upload langsung dari browser ke GitHub Releases API
      // Melewati Vercel API sepenuhnya → tidak ada batas 4.5MB Vercel
      // GitHub Releases: Mendukung hingga 2GB per file tanpa batas bandwidth
      // ================================================================

      if (isBrowserGitHubReady) {
        // -- JALUR 1: Direct GitHub Release Asset Upload --
        setProgress(10);
        try {
          const uploadResult = await uploadFileToGitHubBrowser(
            item.file,
            currentFolderId,
            (pct) => setProgress(pct)
          );

          setProgress(85);

          // Simpan metadata ke API (hanya JSON kecil)
          const metaRes = await fetch('/api/files/metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: item.file.name,
              folderId: currentFolderId,
              size: item.file.size,
              mimeType: item.file.type || 'application/octet-stream',
              storagePath: uploadResult.storagePath,
              downloadUrl: uploadResult.downloadUrl,
              githubAssetId: uploadResult.assetId,
            }),
          });

          const metaData = await safeParseJson(metaRes);
          if (metaData.success) {
            setSuccess();
          } else {
            setError((metaData.error as string) || 'Gagal menyimpan metadata file');
          }
        } catch (uploadErr) {
          setError((uploadErr as Error).message || 'Gagal mengunggah file ke GitHub');
        }

      } else {
        // -- JALUR 2: Fallback ke API Route (server-side / lokal) --
        const formData = new FormData();
        formData.append('file', item.file);
        if (currentFolderId) formData.append('folderId', currentFolderId);

        setProgress(20);
        const progressInterval = setInterval(() => {
          setUploadQueue((prev) =>
            prev.map((i) =>
              i.id === item.id && i.status === 'uploading' && i.progress < 80
                ? { ...i, progress: i.progress + 10 }
                : i
            )
          );
        }, 500);

        const res = await fetch('/api/files', { method: 'POST', body: formData });
        clearInterval(progressInterval);
        const data = await safeParseJson(res);

        if (data.success) {
          setSuccess();
        } else {
          setError((data.error as string) || 'Upload gagal');
        }
      }
    } catch (err) {
      setError((err as Error).message || 'Terjadi kesalahan saat upload');
    }
  };

  const startBulkUpload = async () => {
    if (!requireAdmin()) return;

    const queued = uploadQueue.filter((i) => i.status === 'queued');
    if (queued.length === 0) {
      showToast('Tidak ada file dalam antrean untuk diunggah', 'info');
      return;
    }

    setIsProcessingQueue(true);

    // Upload files sequentially (prevents overwhelming the server)
    for (const item of queued) {
      await uploadSingleFile(item);
    }

    setIsProcessingQueue(false);

    // Refresh contents
    fetchContents(currentFolderId, true);

    // Summary toast
    const finalQueue = uploadQueue;
    const successCount = finalQueue.filter((i) => i.status === 'success').length + queued.length;
    const failCount = 0; // Will be updated after state settles

    setTimeout(() => {
      setUploadQueue((prev) => {
        const s = prev.filter((i) => i.status === 'success').length;
        const f = prev.filter((i) => i.status === 'error').length;
        if (s > 0) showToast(`${s} file berhasil diunggah${f > 0 ? `, ${f} file gagal` : ''} ✓`, f > 0 ? 'info' : 'success');
        return prev;
      });
    }, 300);
  };

  const clearCompletedFromQueue = () => {
    setUploadQueue((prev) => prev.filter((i) => i.status === 'queued' || i.status === 'uploading'));
  };

  const closeUploadModal = () => {
    if (isProcessingQueue) return;
    setShowUploadModal(false);
    setUploadQueue([]);
    setIsDragOver(false);
  };

  // Handle Rename
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAdmin() || !renameTarget) return;
    if (!renameInput.trim()) {
      showToast('Nama baru tidak boleh kosong', 'error');
      return;
    }

    try {
      const endpoint = renameTarget.type === 'folder' ? '/api/folders' : '/api/files';
      const body =
        renameTarget.type === 'folder'
          ? { folderId: renameTarget.id, name: renameInput.trim() }
          : { fileId: renameTarget.id, name: renameInput.trim() };

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await safeParseJson(res);
      if (data.success) {
        showToast(`Berhasil diubah menjadi "${renameInput}" ✓`, 'success');
        setRenameTarget(null);
        fetchContents(currentFolderId, true);
      } else {
        showToast((data.error as string) || 'Gagal mengubah nama', 'error');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!requireAdmin() || !deleteTarget) return;
    setDeleting(true);
    try {
      const endpoint =
        deleteTarget.type === 'folder'
          ? `/api/folders?folderId=${deleteTarget.id}`
          : `/api/files?fileId=${deleteTarget.id}`;

      const res = await fetch(endpoint, { method: 'DELETE' });
      const data = await safeParseJson(res);
      if (data.success) {
        showToast(
          `${deleteTarget.type === 'folder' ? 'Folder' : 'File'} "${deleteTarget.name}" berhasil dihapus ✓`,
          'success'
        );
        setDeleteTarget(null);
        fetchContents(currentFolderId, true);
      } else {
        showToast((data.error as string) || 'Gagal menghapus item', 'error');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Copy Direct Link
  const copyDirectLink = (file: FileItem) => {
    let fullUrl = '';
    if (file.download_url.startsWith('chunked:')) {
      fullUrl = `${window.location.origin}/api/download/${file.id}`;
    } else {
      fullUrl = file.download_url.startsWith('http')
        ? file.download_url
        : `${window.location.origin}${file.download_url}`;
    }
    navigator.clipboard.writeText(fullUrl);
    showToast('Tautan langsung berhasil disalin! 📋', 'success');
  };

  // State & Handler for File Downloads (both direct and chunked)
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const handleDownloadFile = (file: FileItem) => {
    let dlUrl = '';
    if (file.download_url.startsWith('chunked:')) {
      dlUrl = `/api/download/${file.id}`;
    } else {
      dlUrl = file.download_url.startsWith('http')
        ? file.download_url
        : `${window.location.origin}${file.download_url}`;
    }

    setDownloadingFileId(file.id);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(`Memulai unduhan "${file.name}"... 🚀`, 'info');
    setTimeout(() => {
      setDownloadingFileId(null);
    }, 2000);
  };

  // Auto-download when URL has ?download=fileId
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const downloadId = params.get('download');
    if (!downloadId) return;

    let isMounted = true;
    setAutoDownloadLoading(true);
    setAutoDownloadError('');

    fetch(`/api/download/${downloadId}?info=true`)
      .then((res) => {
        if (!res.ok) throw new Error('File tidak ditemukan atau telah dihapus.');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (data.success && data.file) {
          const target = data.file;
          setAutoDownloadFile(target);
          setAutoDownloadLoading(false);

          // Direct trigger download
          const dlUrl = target.is_chunked
            ? `/api/download/${target.id}`
            : (target.download_url.startsWith('http') ? target.download_url : `${window.location.origin}${target.download_url}`);

          const a = document.createElement('a');
          a.href = dlUrl;
          a.download = target.name;
          document.body.appendChild(a);
          a.click();
          a.remove();

          showToast(`Mengunduh "${target.name}" (${formatFileSize(target.size)})... 🚀`, 'info');
        } else {
          throw new Error(data.error || 'File tidak ditemukan');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setAutoDownloadLoading(false);
        setAutoDownloadError(err.message || 'Gagal memuat informasi file');
        showToast(err.message || 'Gagal mengunduh file', 'error');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Format File Size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Format Date
  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleString('en-US', {
        month: 'numeric', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
      });
    } catch {
      return dateString;
    }
  };

  // File icon selector
  const renderFileIcon = (file: FileItem) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'apk') return <Smartphone size={22} />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) return <Archive size={22} />;
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext || '')) return <ImageIcon size={22} />;
    if (['mp4', 'mkv', 'mov', 'avi'].includes(ext || '')) return <Video size={22} />;
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return <Music size={22} />;
    return <FileText size={22} />;
  };

  const getFileIconForQueue = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'apk') return <Smartphone size={16} />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) return <Archive size={16} />;
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext || '')) return <ImageIcon size={16} />;
    if (['mp4', 'mkv', 'mov', 'avi'].includes(ext || '')) return <Video size={16} />;
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return <Music size={16} />;
    return <FileText size={16} />;
  };

  const totalItemCount = folders.length + files.length;
  const queuedCount = uploadQueue.filter((i) => i.status === 'queued').length;
  const successCount = uploadQueue.filter((i) => i.status === 'success').length;
  const errorCount = uploadQueue.filter((i) => i.status === 'error').length;
  const uploadingCount = uploadQueue.filter((i) => i.status === 'uploading').length;

  return (
    <div className="app-container">
      {/* Mobile Toggle Button */}
      <button
        className="mobile-nav-toggle"
        onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        aria-label="Toggle Menu"
      >
        {mobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* ------------------------------------------------------------------ */}
      {/* 1. LEFT SIDEBAR */}
      {/* ------------------------------------------------------------------ */}
      <aside className={`sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="brand-section">
          <div className="brand-logo-badge">
            <Zap size={24} fill="currentColor" strokeWidth={0} />
          </div>
          <h1 className="brand-title">File HansWY</h1>
        </div>

        {/* User Status Profile Card */}
        <div style={{ position: 'relative' }}>
          <div
            className="user-status-card"
            onClick={() => setShowAuthDropdown(!showAuthDropdown)}
            title="Klik untuk membuka menu otentikasi"
          >
            <div className="user-status-left">
              <div className="user-avatar-badge">
                {user.role === 'admin' ? 'H' : 'G'}
              </div>
              <span className="user-name">{user.name}</span>
            </div>
            <ChevronDown size={16} color="var(--text-muted)" />
          </div>

          {/* Auth Dropdown */}
          {showAuthDropdown && (
            <div className="auth-dropdown">
              {user.role === 'admin' ? (
                <button
                  onClick={handleLogout}
                  style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', borderRadius: 'var(--radius-sm)', color: '#ff4757', fontWeight: 600, fontSize: '0.9rem' }}
                  className="nav-item"
                >
                  <Lock size={16} /> Logout Admin
                </button>
              ) : (
                <button
                  onClick={() => { setShowAuthDropdown(false); setShowLoginModal(true); }}
                  style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}
                  className="nav-item"
                >
                  <Unlock size={16} /> Login sebagai Admin
                </button>
              )}
            </div>
          )}
        </div>

        {/* Navigation items */}
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${currentFolderId === null ? 'active' : ''}`}
            onClick={() => { navigateToFolder(null); setMobileSidebarOpen(false); }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Home
          </button>

          <button
            className="nav-item"
            onClick={() => { if (requireAdmin()) { setShowCreateFolderModal(true); setMobileSidebarOpen(false); } }}
          >
            <Plus size={18} />
            Buat Folder
          </button>

          <button
            className="nav-item"
            onClick={() => { if (requireAdmin()) { setShowUploadModal(true); setMobileSidebarOpen(false); } }}
          >
            <Files size={18} />
            Bulk Upload
          </button>
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div className="powered-badge">POWERED BY HANSWY</div>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* 2. MAIN CONTENT AREA */}
      {/* ------------------------------------------------------------------ */}
      <main className="main-content">
        {/* Breadcrumb Bar */}
        <div className="breadcrumb-bar">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.id || 'root'}>
              <span
                className="breadcrumb-segment"
                onClick={() => navigateToFolder(crumb.id)}
              >
                {crumb.name}
              </span>
              {idx < breadcrumbs.length - 1 && (
                <span className="breadcrumb-separator">
                  <ChevronRight size={14} />
                </span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Configuration Warning Banner */}
        {schemaMissing && (
          <div style={{ backgroundColor: 'rgba(230, 40, 49, 0.12)', border: '1.5px solid var(--accent-red)', borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <AlertCircle size={24} color="var(--accent-red)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <h4 style={{ color: '#ffffff', fontSize: '0.98rem', fontWeight: 700, marginBottom: '6px' }}>
                ⚠️ GitHub Storage Belum Dikonfigurasi
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.6' }}>
                Token GitHub belum dikonfigurasi di file <b>.env.local</b> atau Environment Variables Vercel.
              </p>
              <ol style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginTop: '6px', paddingLeft: '18px', lineHeight: '1.6' }}>
                <li>Buat Personal Access Token (PAT) di GitHub dengan izin <b>Contents: Read & Write</b>.</li>
                <li>Tambahkan <b>GITHUB_TOKEN</b> dan <b>NEXT_PUBLIC_GITHUB_TOKEN</b>.</li>
                <li>Klik tombol <b>Refresh</b> pada website ini setelah konfigurasi selesai.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Cloud/Local Storage indicator */}
        {!schemaMissing && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.72rem', color: isCloudStorage ? '#52e38c' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: isCloudStorage ? '#52e38c' : 'var(--text-muted)', display: 'inline-block' }} />
              {isCloudStorage ? 'Cloud Storage (GitHub)' : 'Local Storage'}
            </span>
          </div>
        )}

        {/* Directory Header Banner Card */}
        <section className="directory-banner">
          <div className="directory-info">
            <div className="folder-icon-badge">
              <Folder size={28} fill="currentColor" />
            </div>
            <div className="directory-titles">
              <h2>{currentFolder ? currentFolder.name : 'Root Directory'}</h2>
              <p>{totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}</p>
            </div>
          </div>

          <div className="directory-actions">
            <button
              className="btn-secondary"
              onClick={() => fetchContents(currentFolderId, true)}
              disabled={refreshing}
              title="Perbarui daftar file dan folder"
            >
              <RotateCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              Refresh
            </button>

            <button
              className="btn-secondary"
              onClick={() => { if (requireAdmin()) setShowCreateFolderModal(true); }}
              title="Buat folder baru di direktori ini"
            >
              <Plus size={16} />
              Folder
            </button>

            <button
              className="btn-red"
              onClick={() => { if (requireAdmin()) setShowUploadModal(true); }}
              title="Unggah file ke direktori ini"
            >
              <Upload size={16} />
              Upload
            </button>
          </div>
        </section>

        {/* Parent Directory Link */}
        {currentFolderId !== null && (
          <div className="parent-nav-card" onClick={navigateToParent}>
            <div className="parent-icon-badge">
              <ArrowLeft size={18} />
            </div>
            <div>
              <div className="parent-text">..</div>
              <div className="parent-subtext">Go back up to parent</div>
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
            <RotateCw size={32} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>Memuat direktori File HansWY...</p>
          </div>
        )}

        {/* Items List */}
        {!loading && (
          <div className="items-list">
            {/* Empty state */}
            {folders.length === 0 && files.length === 0 && (
              <div style={{ textAlign: 'center', padding: '50px 20px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-subtle)' }}>
                <Folder size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>Direktori ini masih kosong</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Klik tombol <b>Upload</b> untuk mengunggah file atau <b>Folder</b> untuk membuat folder baru.
                </p>
              </div>
            )}

            {/* FOLDERS LIST */}
            {folders.map((folder) => (
              <div key={folder.id} className="item-card">
                <div className="item-left" style={{ cursor: 'pointer' }} onClick={() => navigateToFolder(folder.id)}>
                  <div className="item-badge folder">
                    <Folder size={22} fill="currentColor" />
                  </div>
                  <div className="item-details">
                    <div className="item-name">{folder.name}</div>
                    <div className="item-meta">
                      {folder.item_count !== undefined ? `${folder.item_count} items • ` : ''}
                      {formatDate(folder.created_at)}
                    </div>
                  </div>
                </div>

                <div className="item-actions">
                  {user.role === 'admin' && (
                    <>
                      <button
                        className="btn-icon"
                        title="Ubah nama folder"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameTarget({ type: 'folder', id: folder.id, name: folder.name });
                          setRenameInput(folder.name);
                        }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="btn-icon delete"
                        title="Hapus folder"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name });
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  <button className="btn-open" onClick={() => navigateToFolder(folder.id)}>
                    <Folder size={15} fill="currentColor" />
                    Open
                  </button>
                </div>
              </div>
            ))}

            {/* FILES LIST */}
            {files.map((file) => {
              const isApk = file.name.toLowerCase().endsWith('.apk');
              return (
                <div key={file.id} className="item-card">
                  <div className="item-left">
                    <div className={`item-badge ${isApk ? 'apk' : 'file'}`}>
                      {renderFileIcon(file)}
                    </div>
                    <div className="item-details">
                      <div className="item-name" title={file.name}>{file.name}</div>
                      <div className="item-meta">{formatFileSize(file.size)} • {formatDate(file.created_at)}</div>
                    </div>
                  </div>

                  <div className="item-actions">
                    {user.role === 'admin' && (
                      <>
                        <button
                          className="btn-icon"
                          title="Ubah nama file"
                          onClick={() => { setRenameTarget({ type: 'file', id: file.id, name: file.name }); setRenameInput(file.name); }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="btn-icon delete"
                          title="Hapus file"
                          onClick={() => setDeleteTarget({ type: 'file', id: file.id, name: file.name })}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                    <button className="btn-icon" title="Salin tautan unduhan langsung" onClick={() => copyDirectLink(file)}>
                      <LinkIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="btn-download"
                      title="Unduh file ini"
                      onClick={() => handleDownloadFile(file)}
                      disabled={downloadingFileId === file.id}
                      style={{ cursor: downloadingFileId === file.id ? 'wait' : 'pointer' }}
                    >
                      {downloadingFileId === file.id ? (
                        <RotateCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Download size={16} strokeWidth={2.8} />
                      )}
                      {downloadingFileId === file.id ? 'Mengunduh...' : 'Download'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Counter */}
        <div className="footer-counter">
          Showing {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
        </div>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* 3. MODALS & DIALOGS */}
      {/* ------------------------------------------------------------------ */}

      {/* ADMIN LOGIN MODAL */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Login Admin HansWY</h3>
              <button className="btn-icon" onClick={() => setShowLoginModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleLogin}>
              <div className="modal-body">
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '16px' }}>
                  Masukkan password admin untuk mengakses fitur upload, buat folder, rename, dan hapus.
                </p>
                {authError && (
                  <div style={{ padding: '10px 14px', backgroundColor: 'rgba(230, 40, 49, 0.15)', border: '1px solid var(--accent-red)', borderRadius: 'var(--radius-md)', color: '#ff6b75', fontSize: '0.85rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={16} /> {authError}
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Password Admin</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Masukkan password..."
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowLoginModal(false)}>Batal</button>
                <button type="submit" className="btn-red">Login Admin</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE FOLDER MODAL */}
      {showCreateFolderModal && (
        <div className="modal-overlay" onClick={() => !creatingFolder && setShowCreateFolderModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Buat Folder Baru</h3>
              <button className="btn-icon" disabled={creatingFolder} onClick={() => setShowCreateFolderModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nama Folder</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: ANDROID 13, LAUNCHER, TOOLS..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    autoFocus
                    required
                    disabled={creatingFolder}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-cancel" disabled={creatingFolder} onClick={() => setShowCreateFolderModal(false)}>Batal</button>
                <button type="submit" className="btn-red" disabled={creatingFolder}>
                  {creatingFolder ? <><RotateCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Membuat...</> : 'Buat Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK UPLOAD MODAL */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={closeUploadModal}>
          <div
            className="modal-dialog upload-modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Files size={20} color="var(--accent-red)" />
                <h3 className="modal-title">Bulk Upload File</h3>
              </div>
              <button className="btn-icon" disabled={isProcessingQueue} onClick={closeUploadModal}><X size={18} /></button>
            </div>

            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '14px' }}>
                Lokasi target:{' '}
                <b style={{ color: '#ffffff' }}>{currentFolder ? currentFolder.name : 'Root Directory'}</b>
              </p>

              {/* Drag & Drop Zone */}
              <div
                className={`drop-zone ${isDragOver ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isProcessingQueue && bulkFileInputRef.current?.click()}
              >
                <Upload size={32} color={isDragOver ? 'var(--accent-red)' : 'var(--text-muted)'} style={{ margin: '0 auto 10px', display: 'block', transition: 'color 0.2s' }} />
                <p style={{ fontWeight: 600, color: isDragOver ? 'var(--accent-red)' : '#ffffff', marginBottom: '4px', textAlign: 'center', transition: 'color 0.2s' }}>
                  {isDragOver ? 'Lepaskan file di sini...' : 'Seret & lepas file di sini'}
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>
                  atau klik untuk memilih beberapa file sekaligus
                </p>
                <input
                  ref={bulkFileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleBulkFileChange}
                  disabled={isProcessingQueue}
                />
              </div>

              {/* Upload Queue */}
              {uploadQueue.length > 0 && (
                <div className="upload-queue">
                  {/* Queue Summary */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      {uploadQueue.length} file dalam antrean
                      {successCount > 0 && <span style={{ color: '#52e38c' }}> · {successCount} berhasil</span>}
                      {errorCount > 0 && <span style={{ color: '#ff4757' }}> · {errorCount} gagal</span>}
                    </span>
                    {!isProcessingQueue && (successCount > 0 || errorCount > 0) && (
                      <button
                        onClick={clearCompletedFromQueue}
                        style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer' }}
                      >
                        Hapus selesai
                      </button>
                    )}
                  </div>

                  {/* Queue Items */}
                  <div className="queue-list">
                    {uploadQueue.map((item) => (
                      <div key={item.id} className="queue-item">
                        <div className="queue-icon">
                          {item.status === 'success' && <CheckCircle2 size={16} color="#52e38c" />}
                          {item.status === 'error' && <XCircle size={16} color="#ff4757" />}
                          {item.status === 'uploading' && <Loader2 size={16} color="var(--accent-red)" style={{ animation: 'spin 1s linear infinite' }} />}
                          {item.status === 'queued' && <Clock size={16} color="var(--text-muted)" />}
                        </div>
                        <div className="queue-file-info">
                          <div className="queue-file-icon">
                            {getFileIconForQueue(item.file)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="queue-filename">{item.file.name}</div>
                            {item.errorMessage && (
                              <div className="queue-error">{item.errorMessage}</div>
                            )}
                            {item.status === 'uploading' && (
                              <div className="queue-progress-bar">
                                <div className="queue-progress-fill" style={{ width: `${item.progress}%` }} />
                              </div>
                            )}
                          </div>
                          <div className="queue-filesize">{formatFileSize(item.file.size)}</div>
                        </div>
                        {item.status !== 'uploading' && !isProcessingQueue && (
                          <button
                            className="btn-icon"
                            style={{ padding: '2px', flexShrink: 0 }}
                            onClick={() => removeFromQueue(item.id)}
                            title="Hapus dari antrean"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-cancel" disabled={isProcessingQueue} onClick={closeUploadModal}>
                {isProcessingQueue ? 'Sedang Upload...' : 'Tutup'}
              </button>
              <button
                type="button"
                className="btn-red"
                disabled={isProcessingQueue || queuedCount === 0}
                style={{ opacity: (isProcessingQueue || queuedCount === 0) ? 0.6 : 1 }}
                onClick={startBulkUpload}
              >
                {isProcessingQueue ? (
                  <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Mengunggah {uploadingCount > 0 ? `(${uploadingCount})` : ''}...</>
                ) : (
                  <><Upload size={16} /> Unggah {queuedCount > 0 ? `${queuedCount} File` : 'Semua'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {renameTarget && (
        <div className="modal-overlay" onClick={() => setRenameTarget(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Ubah Nama {renameTarget.type === 'folder' ? 'Folder' : 'File'}</h3>
              <button className="btn-icon" onClick={() => setRenameTarget(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleRename}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nama Baru</label>
                  <input
                    type="text"
                    className="form-input"
                    value={renameInput}
                    onChange={(e) => setRenameInput(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setRenameTarget(null)}>Batal</button>
                <button type="submit" className="btn-red">Simpan Perubahan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Konfirmasi Penghapusan</h3>
              <button className="btn-icon" disabled={deleting} onClick={() => setDeleteTarget(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: '1.5' }}>
                Apakah Anda yakin ingin menghapus {deleteTarget.type === 'folder' ? 'folder' : 'file'}{' '}
                <b style={{ color: '#ffffff' }}>"{deleteTarget.name}"</b>?
              </p>
              {deleteTarget.type === 'folder' && (
                <p style={{ color: '#ff6b75', fontSize: '0.82rem', marginTop: '10px' }}>
                  ⚠️ Perhatian: Seluruh subfolder dan file di dalam folder ini juga akan terhapus secara permanen.
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-cancel" disabled={deleting} onClick={() => setDeleteTarget(null)}>Batal</button>
              <button
                type="button"
                className="btn-red"
                style={{ backgroundColor: '#ff4757', opacity: deleting ? 0.7 : 1 }}
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? <><RotateCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Menghapus...</> : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AUTO DOWNLOAD MODAL / CARD */}
      {(autoDownloadFile || autoDownloadLoading || autoDownloadError) && (
        <div
          className="modal-overlay"
          onClick={() => {
            setAutoDownloadFile(null);
            setAutoDownloadError('');
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
          }}
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {autoDownloadLoading ? 'Mencari File...' : autoDownloadError ? 'Gagal Mengunduh' : 'Unduhan File'}
              </h3>
              <button
                className="btn-icon"
                onClick={() => {
                  setAutoDownloadFile(null);
                  setAutoDownloadError('');
                  const newUrl = window.location.pathname;
                  window.history.replaceState({}, '', newUrl);
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px 20px' }}>
              {autoDownloadLoading && (
                <div>
                  <RotateCw size={36} color="var(--accent-red)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 14px auto' }} />
                  <p style={{ color: 'var(--text-secondary)' }}>Menghubungkan dan menyiapkan unduhan...</p>
                </div>
              )}

              {autoDownloadError && (
                <div>
                  <AlertCircle size={40} color="#ff4757" style={{ margin: '0 auto 12px auto' }} />
                  <p style={{ color: '#ff6b75', fontWeight: 600 }}>{autoDownloadError}</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '8px' }}>
                    Pastikan tautan yang Anda masukkan benar atau file belum dihapus.
                  </p>
                </div>
              )}

              {autoDownloadFile && (
                <div>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      background: 'rgba(230, 40, 49, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px auto',
                      color: 'var(--accent-red)',
                    }}
                  >
                    <Download size={32} />
                  </div>
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px', wordBreak: 'break-word' }}>
                    {autoDownloadFile.name}
                  </h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '18px' }}>
                    Ukuran: <b>{formatFileSize(autoDownloadFile.size)}</b>
                    {autoDownloadFile.name.endsWith('.apk') && (
                      <span style={{ color: '#52e38c', marginLeft: '8px' }}>✓ File APK Android</span>
                    )}
                  </p>

                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      fontSize: '0.82rem',
                      color: 'var(--text-muted)',
                      marginBottom: '20px',
                      textAlign: 'left',
                      lineHeight: '1.4',
                    }}
                  >
                    💡 Unduhan telah dipicu otomatis. Jika di ponsel Anda unduhan tidak berjalan otomatis, silakan klik tombol di bawah untuk mengunduh langsung.
                  </div>

                  <a
                    href={autoDownloadFile.is_chunked ? `/api/download/${autoDownloadFile.id}` : (autoDownloadFile.download_url.startsWith('http') ? autoDownloadFile.download_url : `${typeof window !== 'undefined' ? window.location.origin : ''}${autoDownloadFile.download_url}`)}
                    download={autoDownloadFile.name}
                    className="btn-red"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      textDecoration: 'none',
                      width: '100%',
                      padding: '12px',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                    }}
                  >
                    <Download size={18} />
                    Unduh File Sekarang
                  </a>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={() => {
                  setAutoDownloadFile(null);
                  setAutoDownloadError('');
                  const newUrl = window.location.pathname;
                  window.history.replaceState({}, '', newUrl);
                }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. FLOATING TOAST NOTIFICATIONS */}
      {/* ------------------------------------------------------------------ */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === 'success' && <Check size={18} color="#52e38c" />}
            {toast.type === 'error' && <AlertCircle size={18} color="#e62831" />}
            {toast.type === 'info' && <Zap size={18} color="#f59e0b" />}
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
