'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo, DragEvent } from 'react';
import {
  Folder,
  FileText,
  Download,
  Link as LinkIcon,
  RotateCw,
  Plus,
  Upload,
  ChevronDown,
  ArrowLeft,
  Trash2,
  Edit2,
  Lock,
  Unlock,
  Check,
  AlertCircle,
  AlertTriangle,
  Menu,
  X,
  Smartphone,
  Archive,
  Music,
  Video,
  Image as ImageIcon,
  Clock,
  Search,
  Sun,
  Heart,
  MessageSquare,
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
  progress: number;
  errorMessage?: string;
}

// Helper to safely parse JSON from fetch response
async function safeParseJson(res: Response): Promise<{ success: boolean; [key: string]: unknown }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const statusText = res.statusText || `HTTP ${res.status}`;
    if (res.status === 413) {
      return { success: false, error: 'Ukuran file terlalu besar. Coba gunakan file yang lebih kecil.' };
    }
    return { success: false, error: `Server error (${statusText}): ${text.substring(0, 120)}` };
  }
}

export default function HansWYFileArchiveApp() {
  // Navigation & State
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentFolder, setCurrentFolder] = useState<FolderItem | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: 'Files' }]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isCloudStorage, setIsCloudStorage] = useState<boolean>(false);
  const [schemaMissing, setSchemaMissing] = useState<boolean>(false);
  const [schemaErrorMessage, setSchemaErrorMessage] = useState<string>('');

  // Search filtering
  const [searchQuery, setSearchQuery] = useState<string>('');

  // User & Auth State
  const [user, setUser] = useState<UserInfo>({ name: 'GuestUser', role: 'guest' });
  const [showAuthDropdown, setShowAuthDropdown] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  // Modals State
  const [showDisclaimerModal, setShowDisclaimerModal] = useState<boolean>(false);
  const [showChangelogModal, setShowChangelogModal] = useState<boolean>(false);
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

  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

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

          const formattedBreadcrumbs = (d.breadcrumbs || []).map((b, idx) => ({
            ...b,
            name: idx === 0 ? 'Files' : b.name,
          }));
          setBreadcrumbs(formattedBreadcrumbs.length > 0 ? formattedBreadcrumbs : [{ id: null, name: 'Files' }]);

          setFolders(d.folders || []);
          setFiles(d.files || []);
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
    setSearchQuery('');
  };

  const navigateToParent = () => {
    if (breadcrumbs.length > 1) {
      const parentBreadcrumb = breadcrumbs[breadcrumbs.length - 2];
      setCurrentFolderId(parentBreadcrumb.id);
    } else {
      setCurrentFolderId(null);
    }
    setSearchQuery('');
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
    if (user.role === 'admin') return true;
    setShowLoginModal(true);
    return false;
  };

  // Create Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), parentId: currentFolderId }),
      });
      const data = await safeParseJson(res);
      if (data.success) {
        setShowCreateFolderModal(false);
        setNewFolderName('');
        fetchContents(currentFolderId, true);
        showToast('Folder berhasil dibuat ✓', 'success');
      } else {
        showToast((data.error as string) || 'Gagal membuat folder', 'error');
      }
    } catch (err) {
      showToast((err as Error).message || 'Terjadi kesalahan jaringan', 'error');
    } finally {
      setCreatingFolder(false);
    }
  };

  // Rename Action
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameInput.trim()) return;
    try {
      const endpoint = renameTarget.type === 'folder' ? '/api/folders' : '/api/files';
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: renameTarget.id, name: renameInput.trim() }),
      });
      const data = await safeParseJson(res);
      if (data.success) {
        setRenameTarget(null);
        setRenameInput('');
        fetchContents(currentFolderId, true);
        showToast('Nama berhasil diubah ✓', 'success');
      } else {
        showToast((data.error as string) || 'Gagal mengubah nama', 'error');
      }
    } catch (err) {
      showToast((err as Error).message || 'Terjadi kesalahan jaringan', 'error');
    }
  };

  // Delete Action
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const endpoint = deleteTarget.type === 'folder' ? '/api/folders' : '/api/files';
      const res = await fetch(`${endpoint}?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      const data = await safeParseJson(res);
      if (data.success) {
        setDeleteTarget(null);
        fetchContents(currentFolderId, true);
        showToast(`${deleteTarget.type === 'folder' ? 'Folder' : 'File'} berhasil dihapus ✓`, 'success');
      } else {
        showToast((data.error as string) || 'Gagal menghapus item', 'error');
      }
    } catch (err) {
      showToast((err as Error).message || 'Terjadi kesalahan jaringan', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Download File Action
  const handleDownloadFile = async (file: FileItem) => {
    setDownloadingFileId(file.id);
    try {
      const dlUrl = file.is_chunked
        ? `/api/download/${file.id}`
        : file.download_url.startsWith('http')
        ? file.download_url
        : `${window.location.origin}${file.download_url}`;

      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();

      showToast(`Mengunduh "${file.name}" (${formatFileSize(file.size)})... 🚀`, 'info');
    } catch (err) {
      showToast((err as Error).message || 'Gagal mengunduh file', 'error');
    } finally {
      setTimeout(() => setDownloadingFileId(null), 1200);
    }
  };

  // Copy Direct Link
  const copyDirectLink = (file: FileItem) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareableUrl = `${origin}?download=${encodeURIComponent(file.id)}`;
    navigator.clipboard.writeText(shareableUrl);
    showToast('Tautan langsung disalin ke papan klip! 📋', 'success');
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
      e.target.value = '';
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
      if (isBrowserGitHubReady) {
        setProgress(5);
        try {
          await uploadFileToGitHubBrowser(item.file, currentFolderId, (pct) => setProgress(pct));
          setProgress(100);
          setSuccess();
        } catch (uploadErr) {
          setError((uploadErr as Error).message || 'Gagal mengunggah file ke GitHub');
        }
      } else {
        const formData = new FormData();
        formData.append('file', item.file);
        if (currentFolderId) formData.append('folderId', currentFolderId);

        setProgress(20);
        const progressInterval = setInterval(() => {
          setUploadQueue((prev) =>
            prev.map((i) => {
              if (i.id === item.id && i.status === 'uploading' && i.progress < 85) {
                return { ...i, progress: Math.min(i.progress + 15, 85) };
              }
              return i;
            })
          );
        }, 300);

        const res = await fetch('/api/files', { method: 'POST', body: formData });
        clearInterval(progressInterval);
        const data = await safeParseJson(res);

        if (data.success) {
          setProgress(100);
          setSuccess();
        } else {
          setError((data.error as string) || 'Gagal mengunggah file');
        }
      }
    } catch (err) {
      setError((err as Error).message || 'Terjadi kesalahan jaringan');
    }
  };

  const startBatchUpload = async () => {
    const queuedItems = uploadQueue.filter((i) => i.status === 'queued' || i.status === 'error');
    if (queuedItems.length === 0) return;

    setIsProcessingQueue(true);
    for (const item of queuedItems) {
      await uploadSingleFile(item);
    }
    setIsProcessingQueue(false);
    fetchContents(currentFolderId, true);
    showToast('Proses upload selesai! ✓', 'success');
  };

  const closeUploadModal = () => {
    if (isProcessingQueue) return;
    const hasSuccess = uploadQueue.some((i) => i.status === 'success');
    if (hasSuccess) {
      fetchContents(currentFolderId, true);
    }
    setUploadQueue([]);
    setShowUploadModal(false);
  };

  // Check URL parameters for direct file download
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const downloadId = params.get('download');
    if (!downloadId) return;

    let isMounted = true;
    setAutoDownloadLoading(true);
    setAutoDownloadError('');

    fetch(`/api/files?id=${encodeURIComponent(downloadId)}`)
      .then((res) => safeParseJson(res))
      .then((data) => {
        if (!isMounted) return;
        setAutoDownloadLoading(false);
        if (data.success && data.file) {
          const target = data.file as FileItem;
          setAutoDownloadFile({
            id: target.id,
            name: target.name,
            size: target.size,
            mime_type: target.mime_type,
            is_chunked: Boolean(target.is_chunked),
            download_url: target.download_url,
          });

          const dlUrl = target.is_chunked
            ? `/api/download/${target.id}`
            : target.download_url.startsWith('http')
            ? target.download_url
            : `${window.location.origin}${target.download_url}`;

          const a = document.createElement('a');
          a.href = dlUrl;
          a.download = target.name;
          document.body.appendChild(a);
          a.click();
          a.remove();

          showToast(`Mengunduh "${target.name}" (${formatFileSize(target.size)})... 🚀`, 'info');
        } else {
          throw new Error((data.error as string) || 'File tidak ditemukan');
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

  // Format Date & Time like screenshot (e.g., "14 Oct 2026", "21:34 WIB")
  const formatDateParts = (dateString: string) => {
    try {
      const d = new Date(dateString);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const day = d.getDate();
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return {
        dateStr: `${day} ${month} ${year}`,
        timeStr: `${hours}:${minutes} WIB`,
      };
    } catch {
      return { dateStr: dateString, timeStr: '' };
    }
  };

  // File icon selector
  const renderFileIcon = (file: FileItem) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'apk') return <Smartphone size={18} />;
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) return <Archive size={18} />;
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext || '')) return <ImageIcon size={18} />;
    if (['mp4', 'mkv', 'mov', 'avi'].includes(ext || '')) return <Video size={18} />;
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return <Music size={18} />;
    return <FileText size={18} />;
  };

  // Filtered folders and files
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders;
    return folders.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [folders, searchQuery]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;
    return files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  const totalVisibleItems = filteredFolders.length + filteredFiles.length;
  const queuedCount = uploadQueue.filter((i) => i.status === 'queued').length;
  const successCount = uploadQueue.filter((i) => i.status === 'success').length;

  return (
    <div className="app-container">
      {/* Mobile Nav Toggle Button */}
      <button
        className="mobile-nav-toggle"
        onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        aria-label="Toggle Menu"
      >
        {mobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* ============================================================
          1. LEFT SIDEBAR (HANSWY STYLE)
          ============================================================ */}
      <aside className={`sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div
          className="brand-section-hanswy"
          onClick={() => {
            navigateToFolder(null);
            setMobileSidebarOpen(false);
          }}
        >
          <div className="brand-logo-h">H</div>
          <div className="brand-text-block">
            <h1 className="brand-title-hanswy">HansWY</h1>
            <span className="brand-subtitle-hanswy">FILE ARCHIVE</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="nav-group-title">COLLECTION</div>

          {/* All files */}
          <button
            className={`nav-item-hanswy ${currentFolderId === null ? 'active' : ''}`}
            onClick={() => {
              navigateToFolder(null);
              setMobileSidebarOpen(false);
            }}
          >
            <div className="nav-item-content">
              <Folder size={17} color={currentFolderId === null ? 'var(--accent-cyan)' : '#8591a5'} />
              <span>All files</span>
            </div>
            {currentFolderId === null && <span className="nav-arrow-active">↗</span>}
          </button>

          {/* Changelog */}
          <button
            className="nav-item-hanswy"
            onClick={() => {
              setShowChangelogModal(true);
              setMobileSidebarOpen(false);
            }}
          >
            <div className="nav-item-content">
              <Clock size={17} color="#8591a5" />
              <span>Changelog</span>
            </div>
          </button>

          <div className="nav-group-title">COMMUNITY</div>

          {/* Discord */}
          <a
            href="https://discord.com"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item-hanswy"
          >
            <div className="nav-item-content">
              <MessageSquare size={17} color="#8591a5" />
              <span>Discord</span>
            </div>
            <span className="nav-arrow-external">↗</span>
          </a>

          {/* Support HansWY */}
          <a
            href="https://saweria.co"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item-hanswy"
          >
            <div className="nav-item-content">
              <Heart size={17} color="#8591a5" />
              <span>Support HansWY</span>
            </div>
            <span className="nav-arrow-external">↗</span>
          </a>
        </nav>

        {/* Sidebar Footer & Admin Controls */}
        <div className="sidebar-footer">
          {/* User status card for admin */}
          <div style={{ position: 'relative' }}>
            <div
              className="user-status-card"
              onClick={() => setShowAuthDropdown(!showAuthDropdown)}
              title="Akses Admin"
            >
              <div className="user-status-left">
                <div className="user-avatar-badge">{user.role === 'admin' ? 'H' : 'G'}</div>
                <span className="user-name">{user.role === 'admin' ? 'HansWY (Admin)' : user.name}</span>
              </div>
              <ChevronDown size={14} color="#727f95" />
            </div>

            {showAuthDropdown && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px',
                  zIndex: 60,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                {user.role === 'admin' ? (
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#ff4757',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    <Lock size={14} /> Logout Admin
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setShowAuthDropdown(false);
                      setShowLoginModal(true);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    <Unlock size={14} /> Login Admin
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="sidebar-footer-text">Made for the grind.</div>
          <div className="sidebar-footer-subtext">HansWY Files</div>
        </div>
      </aside>

      {/* ============================================================
          2. MAIN CONTENT AREA
          ============================================================ */}
      <main className="main-content">
        {/* Top Navigation Bar */}
        <div className="top-nav-bar">
          <div className="breadcrumb-left">
            <span
              className="breadcrumb-root-icon"
              onClick={() => navigateToFolder(null)}
              style={{ cursor: 'pointer' }}
            >
              <Folder size={16} />
            </span>
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id || 'root'}>
                {idx > 0 && <span style={{ color: '#556277' }}>/</span>}
                <span
                  className={
                    idx === breadcrumbs.length - 1 ? 'breadcrumb-item-current' : 'breadcrumb-item-text'
                  }
                  onClick={() => navigateToFolder(crumb.id)}
                >
                  {crumb.name}
                </span>
              </React.Fragment>
            ))}
          </div>

          <div className="top-nav-right">
            <span className="top-badge-title">HANSWY / DOWNLOAD CENTER</span>
            <button
              className="theme-toggle-btn"
              title="Theme Toggle"
              onClick={() => showToast('Tema HansWY Cosmic Cyan Aktif', 'info')}
            >
              <Sun size={17} />
            </button>
          </div>
        </div>

        {/* Configuration Warning Banner if GitHub missing */}
        {schemaMissing && (
          <div
            style={{
              backgroundColor: 'rgba(0, 210, 255, 0.08)',
              border: '1px solid var(--accent-cyan)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 18px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <AlertCircle size={20} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <h4 style={{ color: '#ffffff', fontSize: '0.92rem', fontWeight: 700, marginBottom: '4px' }}>
                GitHub Storage Belum Dikonfigurasi
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.5' }}>
                {schemaErrorMessage || 'Silakan tambahkan GITHUB_TOKEN di file .env.local untuk penyimpanan cloud.'}
              </p>
            </div>
          </div>
        )}

        {/* ============================================================
            HERO BANNER - ANIMATION VIDEO (OTOMATIS TANPA PLAY BUTTON)
            ============================================================ */}
        <section className="hero-banner-wrap">
          <video
            src="/hanswy-banner.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="hero-banner-video"
          />
        </section>

        {/* ============================================================
            CHANGELOG CARD
            ============================================================ */}
        <section className="changelog-bar">
          <div className="changelog-left">
            <div className="changelog-icon-wrap">
              <Clock size={18} />
            </div>
            <div className="changelog-info">
              <div className="changelog-meta">
                <span className="changelog-tag">CHANGELOG</span>
                <span className="changelog-date">23 Oct 2026 • 21:00 WIB</span>
              </div>
              <span className="changelog-title">STILL UPDATING</span>
            </div>
          </div>

          <button
            className="changelog-link-btn"
            onClick={() => setShowChangelogModal(true)}
          >
            <span>View notes</span>
            <span>↗</span>
          </button>
        </section>

        {/* ============================================================
            RISK DISCLAIMER NOTICE BAR
            ============================================================ */}
        <div className="risk-notice-bar">
          <div className="risk-notice-left">
            <AlertTriangle size={15} />
            <span>Use at your own risk. Compatibility across all devices is not guaranteed.</span>
          </div>
          <span className="risk-read-link" onClick={() => setShowDisclaimerModal(true)}>
            Read first
          </span>
        </div>

        {/* ============================================================
            SECTION HEADER: ALL FILES. + SEARCH & CONTROLS
            ============================================================ */}
        <div className="section-header-row">
          <div className="section-titles">
            <h2 className="section-title-main">
              All files<span className="accent-dot">.</span>
            </h2>
            <span className="section-subtitle">
              {filteredFolders.length} {filteredFolders.length === 1 ? 'folder' : 'folders'}
              {filteredFiles.length > 0 && `, ${filteredFiles.length} files`}
            </span>
          </div>

          <div className="section-controls-right">
            {/* Real-time search box */}
            <div className="search-box-wrap">
              <Search size={15} className="search-box-icon" />
              <input
                type="text"
                placeholder="Search this folder..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input-field"
              />
            </div>

            {/* Refresh button */}
            <button
              className="icon-control-btn"
              onClick={() => fetchContents(currentFolderId, true)}
              disabled={refreshing}
              title="Perbarui folder"
            >
              <RotateCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>

            {/* Admin action buttons */}
            {user.role === 'admin' && (
              <>
                <button
                  className="btn-admin-action secondary"
                  onClick={() => setShowCreateFolderModal(true)}
                  title="Buat folder baru"
                >
                  <Plus size={14} />
                  <span>Folder</span>
                </button>
                <button
                  className="btn-admin-action primary"
                  onClick={() => setShowUploadModal(true)}
                  title="Upload file"
                >
                  <Upload size={14} />
                  <span>Upload</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Parent Directory Navigation */}
        {currentFolderId !== null && (
          <div
            onClick={navigateToParent}
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '12px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '0.88rem',
            }}
          >
            <ArrowLeft size={16} />
            <span>Kembali ke folder sebelumnya (..)</span>
          </div>
        )}

        {/* Table Column Headers */}
        <div className="table-header-row">
          <span>NAME</span>
          <span>UPDATED</span>
        </div>

        {/* Loading Spinner */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
            <RotateCw size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '0.85rem' }}>Memuat direktori HansWY Archive...</p>
          </div>
        )}

        {/* ============================================================
            ITEMS LIST (FOLDERS & FILES)
            ============================================================ */}
        {!loading && (
          <div className="items-list">
            {/* Empty state */}
            {totalVisibleItems === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '48px 20px',
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border-subtle)',
                }}
              >
                <Folder size={36} color="var(--text-muted)" style={{ margin: '0 auto 10px' }} />
                <h4 style={{ color: 'var(--text-secondary)', marginBottom: '4px', fontSize: '0.95rem' }}>
                  {searchQuery ? 'Tidak ada file atau folder yang cocok' : 'Direktori ini masih kosong'}
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {searchQuery ? 'Coba gunakan kata kunci pencarian yang lain.' : 'Belum ada konten di dalam folder ini.'}
                </p>
              </div>
            )}

            {/* FOLDERS */}
            {filteredFolders.map((folder) => {
              const { dateStr, timeStr } = formatDateParts(folder.created_at);
              return (
                <div key={folder.id} className="item-row-card">
                  <div
                    className="item-row-left"
                    onClick={() => navigateToFolder(folder.id)}
                  >
                    <div className="item-folder-badge">
                      <Folder size={20} fill="currentColor" strokeWidth={0} />
                    </div>
                    <span className="item-row-title">{folder.name}</span>
                  </div>

                  <div className="item-row-right">
                    <div className="item-row-date">
                      <span>{dateStr}</span>
                      <span>{timeStr}</span>
                    </div>

                    {user.role === 'admin' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn-icon-admin"
                          title="Ubah nama"
                          onClick={() => {
                            setRenameTarget({ type: 'folder', id: folder.id, name: folder.name });
                            setRenameInput(folder.name);
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn-icon-admin delete"
                          title="Hapus folder"
                          onClick={() => setDeleteTarget({ type: 'folder', id: folder.id, name: folder.name })}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}

                    <button
                      className="item-btn-open"
                      onClick={() => navigateToFolder(folder.id)}
                    >
                      <span>Open</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* FILES */}
            {filteredFiles.map((file) => {
              const isApk = file.name.toLowerCase().endsWith('.apk');
              const { dateStr, timeStr } = formatDateParts(file.created_at);
              return (
                <div key={file.id} className="item-row-card">
                  <div className="item-row-left">
                    <div className={`item-file-badge ${isApk ? 'apk' : ''}`}>
                      {renderFileIcon(file)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span className="item-row-title" title={file.name}>
                        {file.name}
                      </span>
                      <span style={{ fontSize: '0.74rem', color: '#74829a', fontFamily: 'var(--font-mono)' }}>
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                  </div>

                  <div className="item-row-right">
                    <div className="item-row-date">
                      <span>{dateStr}</span>
                      <span>{timeStr}</span>
                    </div>

                    {user.role === 'admin' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn-icon-admin"
                          title="Ubah nama"
                          onClick={() => {
                            setRenameTarget({ type: 'file', id: file.id, name: file.name });
                            setRenameInput(file.name);
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn-icon-admin delete"
                          title="Hapus file"
                          onClick={() => setDeleteTarget({ type: 'file', id: file.id, name: file.name })}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}

                    <button
                      className="btn-icon-admin"
                      title="Salin tautan langsung"
                      onClick={() => copyDirectLink(file)}
                    >
                      <LinkIcon size={13} />
                    </button>

                    <button
                      className="item-btn-download"
                      onClick={() => handleDownloadFile(file)}
                      disabled={downloadingFileId === file.id}
                    >
                      {downloadingFileId === file.id ? (
                        <RotateCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <Download size={13} />
                      )}
                      <span>Download</span>
                      <span>→</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sub-footer Info */}
        <div className="sub-footer-info">
          <span>
            Showing {totalVisibleItems} of {folders.length + files.length} items
          </span>
          <span>Files, without the clutter.</span>
        </div>

        {/* ============================================================
            SPONSOR / AD RESPONSIVE BANNER BOX
            ============================================================ */}
        <section className="sponsor-ad-box">
          <span className="sponsor-ad-tag">AD</span>
          <div className="sponsor-ad-label">
            <span>Sponsor space</span>
            <span className="sponsor-ad-pill">Responsive banner</span>
          </div>
          <span className="sponsor-ad-tag">AD SPACE</span>
        </section>

        {/* ============================================================
            BOTTOM SITE FOOTER
            ============================================================ */}
        <footer className="site-footer-bar">
          <div className="site-footer-brand">
            <span className="footer-brand-name">HANSWY</span>
            <span style={{ color: '#8897ad' }}>FILES</span>
            <span className="footer-brand-tagline">Pick a folder. Find your version.</span>
          </div>
          <span
            className="footer-disclaimer-btn"
            onClick={() => setShowDisclaimerModal(true)}
          >
            Disclaimer
          </span>
        </footer>
      </main>

      {/* ============================================================
          3. MODALS (DISCLAIMER, CHANGELOG, LOGIN, FOLDER, UPLOAD)
          ============================================================ */}

      {/* BEFORE YOU DOWNLOAD / DISCLAIMER MODAL */}
      {showDisclaimerModal && (
        <div className="modal-overlay" onClick={() => setShowDisclaimerModal(false)}>
          <div className="modal-dialog-hanswy" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-hanswy">
              <div>
                <div className="modal-pretitle">BEFORE YOU DOWNLOAD</div>
                <h3 className="modal-title-hanswy">
                  Use at your own risk<span className="accent-dot">.</span>
                </h3>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setShowDisclaimerModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-text-body">
              <p>
                Use files at your discretion. Back up your data before replacing an app. Results may vary by device, Android version, and APK variant.
              </p>
              <p>
                Modified apps may cause crashes or account restrictions. Security and compatibility are not guaranteed.
              </p>
            </div>

            <div className="modal-note-box">
              Areas marked AD contain sponsored content. Download buttons appear in file rows or file details.
            </div>

            <button
              className="btn-hanswy-primary"
              onClick={() => setShowDisclaimerModal(false)}
            >
              I understand
            </button>
          </div>
        </div>
      )}

      {/* CHANGELOG NOTES MODAL */}
      {showChangelogModal && (
        <div className="modal-overlay" onClick={() => setShowChangelogModal(false)}>
          <div className="modal-dialog-hanswy" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-hanswy">
              <div>
                <div className="modal-pretitle">CHANGELOG ARCHIVE</div>
                <h3 className="modal-title-hanswy">
                  HansWY Release Notes<span className="accent-dot">.</span>
                </h3>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setShowChangelogModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-text-body" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              <div style={{ borderLeft: '2px solid var(--accent-cyan)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: '#ffffff' }}>23 Oct 2026 - 21:00 WIB</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • Pembaruan tampilan HansWY File Archive bertema Cosmic Electric Cyan.
                  <br />• Integrasi auto-play video animasi banner.
                  <br />• Fitur pencarian folder & file langsung.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid #202b3f', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: '#ffffff' }}>14 Oct 2026 - 14:34 WIB</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • Initial release HansWY Launcher & Tools package.
                  <br />• Pembaruan kompabilitas Android 10-13.
                </p>
              </div>
            </div>

            <button
              className="btn-hanswy-primary"
              onClick={() => setShowChangelogModal(false)}
            >
              Tutup Catatan
            </button>
          </div>
        </div>
      )}

      {/* ADMIN LOGIN MODAL */}
      {showLoginModal && (
        <div className="modal-overlay" onClick={() => setShowLoginModal(false)}>
          <div className="modal-dialog-hanswy" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-hanswy">
              <div>
                <div className="modal-pretitle">AUTHENTICATION</div>
                <h3 className="modal-title-hanswy">
                  Login Admin HansWY<span className="accent-dot">.</span>
                </h3>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setShowLoginModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleLogin}>
              <div className="modal-body">
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem', marginBottom: '14px' }}>
                  Masukkan password admin untuk mengelola file, folder, dan upload.
                </p>
                {authError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'rgba(255, 82, 82, 0.15)',
                      border: '1px solid #ff5252',
                      borderRadius: 'var(--radius-sm)',
                      color: '#ff6b75',
                      fontSize: '0.82rem',
                      marginBottom: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <AlertCircle size={15} /> {authError}
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
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowLoginModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-admin-action primary">
                  Login Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE FOLDER MODAL */}
      {showCreateFolderModal && (
        <div className="modal-overlay" onClick={() => !creatingFolder && setShowCreateFolderModal(false)}>
          <div className="modal-dialog-hanswy" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-hanswy">
              <div>
                <div className="modal-pretitle">MANAGEMENT</div>
                <h3 className="modal-title-hanswy">
                  Buat Folder Baru<span className="accent-dot">.</span>
                </h3>
              </div>
              <button
                className="modal-close-btn"
                disabled={creatingFolder}
                onClick={() => setShowCreateFolderModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <div className="form-group">
                <label className="form-label">Nama Folder</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: LAUNCHER, TOOLS, ARCEUS..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                  required
                  disabled={creatingFolder}
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  disabled={creatingFolder}
                  onClick={() => setShowCreateFolderModal(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-admin-action primary"
                  disabled={creatingFolder}
                >
                  {creatingFolder ? (
                    <>
                      <RotateCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Membuat...
                    </>
                  ) : (
                    'Buat Folder'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RENAME MODAL */}
      {renameTarget && (
        <div className="modal-overlay" onClick={() => setRenameTarget(null)}>
          <div className="modal-dialog-hanswy" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-hanswy">
              <div>
                <div className="modal-pretitle">MANAGEMENT</div>
                <h3 className="modal-title-hanswy">
                  Ubah Nama {renameTarget.type === 'folder' ? 'Folder' : 'File'}<span className="accent-dot">.</span>
                </h3>
              </div>
              <button className="modal-close-btn" onClick={() => setRenameTarget(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleRename}>
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
              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setRenameTarget(null)}>
                  Batal
                </button>
                <button type="submit" className="btn-admin-action primary">
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="modal-dialog-hanswy" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-hanswy">
              <div>
                <div className="modal-pretitle">DELETE CONFIRMATION</div>
                <h3 className="modal-title-hanswy">
                  Hapus {deleteTarget.type === 'folder' ? 'Folder' : 'File'}<span className="accent-dot">?</span>
                </h3>
              </div>
              <button
                className="modal-close-btn"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Apakah Anda yakin ingin menghapus <b>"{deleteTarget.name}"</b>? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-admin-action primary"
                style={{ backgroundColor: '#e53935' }}
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK UPLOAD MODAL */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={closeUploadModal}>
          <div className="modal-dialog-hanswy upload-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-hanswy">
              <div>
                <div className="modal-pretitle">FILE STORAGE</div>
                <h3 className="modal-title-hanswy">
                  Upload File<span className="accent-dot">.</span>
                </h3>
              </div>
              <button className="modal-close-btn" disabled={isProcessingQueue} onClick={closeUploadModal}>
                <X size={16} />
              </button>
            </div>

            <div className="drop-zone" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => !isProcessingQueue && bulkFileInputRef.current?.click()}>
              <Upload size={28} color={isDragOver ? 'var(--accent-cyan)' : 'var(--text-muted)'} style={{ margin: '0 auto 8px', display: 'block' }} />
              <p style={{ fontWeight: 600, color: '#ffffff', marginBottom: '2px', fontSize: '0.9rem' }}>
                Seret & lepas file ke sini
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>atau klik untuk memilih file</p>
              <input
                ref={bulkFileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={handleBulkFileChange}
                disabled={isProcessingQueue}
              />
            </div>

            {uploadQueue.length > 0 && (
              <div className="upload-queue">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <span>Antrean ({uploadQueue.length} file)</span>
                  {successCount > 0 && <span style={{ color: '#52e38c' }}>{successCount} selesai</span>}
                </div>

                <div className="queue-list">
                  {uploadQueue.map((item) => (
                    <div key={item.id} className="queue-item">
                      <div className="queue-file-info">
                        <span className="queue-filename">{item.file.name}</span>
                        <span className="queue-filesize">{formatFileSize(item.file.size)}</span>
                      </div>
                      {item.status === 'uploading' && <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>{item.progress}%</span>}
                      {item.status === 'success' && <Check size={14} color="#52e38c" />}
                      {item.status === 'error' && <span style={{ fontSize: '0.72rem', color: '#ff6b75' }}>Gagal</span>}
                      {item.status === 'queued' && !isProcessingQueue && (
                        <button onClick={() => removeFromQueue(item.id)} style={{ color: '#65728a' }}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-footer">
              <button type="button" className="btn-cancel" disabled={isProcessingQueue} onClick={closeUploadModal}>
                Tutup
              </button>
              {queuedCount > 0 && (
                <button
                  type="button"
                  className="btn-admin-action primary"
                  disabled={isProcessingQueue}
                  onClick={startBatchUpload}
                >
                  {isProcessingQueue ? 'Mengunggah...' : `Unggah (${queuedCount} file)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AUTO DOWNLOAD POPUP MODAL */}
      {autoDownloadFile && (
        <div className="modal-overlay" onClick={() => setAutoDownloadFile(null)}>
          <div className="modal-dialog-hanswy" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <div className="modal-header-hanswy" style={{ justifyContent: 'center' }}>
              <h3 className="modal-title-hanswy">Unduhan File HansWY</h3>
            </div>
            <div style={{ margin: '16px 0' }}>
              <Download size={36} color="var(--accent-cyan)" style={{ margin: '0 auto 12px' }} />
              <h4 style={{ color: '#ffffff', fontSize: '1rem', marginBottom: '6px' }}>{autoDownloadFile.name}</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                Ukuran: {formatFileSize(autoDownloadFile.size)}
              </p>
            </div>
            <a
              href={autoDownloadFile.is_chunked ? `/api/download/${autoDownloadFile.id}` : autoDownloadFile.download_url}
              download={autoDownloadFile.name}
              className="btn-hanswy-primary"
            >
              Unduh Lagi Sekarang
            </a>
          </div>
        </div>
      )}

      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === 'success' && <Check size={16} color="#52e38c" />}
            {toast.type === 'error' && <AlertCircle size={16} color="#ff5252" />}
            {toast.type === 'info' && <Clock size={16} color="var(--accent-cyan)" />}
            <span>{toast.text}</span>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
