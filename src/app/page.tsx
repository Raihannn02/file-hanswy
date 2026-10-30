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
  Moon,
  Heart,
  MessageSquare,
  Copy,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Square,
  SquareCheck,
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

// GitHub Release storage coordinates — used to resolve direct download links
// so that every download/copy-link points at GitHub (0 bytes of Vercel bandwidth).
const GITHUB_OWNER = process.env.NEXT_PUBLIC_GITHUB_OWNER || 'Raihannn02';
const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || 'file-hanswy';
const GITHUB_FILES_TAG = 'storage-files';
const githubAssetUrl = (storagePath: string) =>
  `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${GITHUB_FILES_TAG}/${storagePath}`;

// Helper to safely parse JSON from fetch response
async function safeParseJson(res: Response): Promise<{ success: boolean; [key: string]: unknown }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const statusText = res.statusText || `HTTP ${res.status}`;
    if (res.status === 413) {
      return { success: false, error: 'File size exceeds maximum upload limit. Please try a smaller file.' };
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

  // Dual Theme State: Cosmic Cyan vs Themes White
  const [cosmicThemeActive, setCosmicThemeActive] = useState<boolean>(true);

  // Search filtering
  const [searchQuery, setSearchQuery] = useState<string>('');

  // User & Auth State
  const [user, setUser] = useState<UserInfo>({ name: 'GuestUser', role: 'guest' });
  const [showAuthDropdown, setShowAuthDropdown] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  // Modals State
  const [showDisclaimerModal, setShowDisclaimerModal] = useState<boolean>(false);
  const [showChangelogModal, setShowChangelogModal] = useState<boolean>(false);
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  const [showCreateFolderModal, setShowCreateFolderModal] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [creatingFolder, setCreatingFolder] = useState<boolean>(false);

  // Hero banner sound control
  const bannerVideoRef = useRef<HTMLVideoElement>(null);
  const [isBannerMuted, setIsBannerMuted] = useState<boolean>(true);

  const toggleBannerSound = () => {
    if (bannerVideoRef.current) {
      const nextMuted = !isBannerMuted;
      bannerVideoRef.current.muted = nextMuted;
      setIsBannerMuted(nextMuted);
      if (!nextMuted) {
        bannerVideoRef.current.play().catch(() => {});
        showToast('Banner audio unmuted 🔊', 'info');
      } else {
        showToast('Banner audio muted 🔇', 'info');
      }
    }
  };

  // Upload Modal (Bulk)
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState<boolean>(false);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const [renameTarget, setRenameTarget] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);
  const [animatedRenameId, setAnimatedRenameId] = useState<string | null>(null);
  const [animatedDeleteId, setAnimatedDeleteId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  // Multi-select (bulk actions) state
  const [selectionMode, setSelectionMode] = useState<boolean>(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState<boolean>(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState<boolean>(false);

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
    }, 4500);
  };

  // Initialize theme from localStorage (Cosmic Cyan vs White)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('hanswy_theme_mode');
      if (savedTheme === 'white') {
        setCosmicThemeActive(false);
        document.documentElement.setAttribute('data-theme', 'white');
      } else {
        setCosmicThemeActive(true);
        document.documentElement.setAttribute('data-theme', 'cosmic');
      }
    }
  }, []);

  // Toggle Theme Function: Themes cosmic cyan on & Themes white on
  const toggleTheme = () => {
    const nextState = !cosmicThemeActive;
    setCosmicThemeActive(nextState);
    if (typeof window !== 'undefined') {
      const themeName = nextState ? 'cosmic' : 'white';
      localStorage.setItem('hanswy_theme_mode', themeName);
      document.documentElement.setAttribute('data-theme', themeName);
    }
    if (nextState) {
      showToast('Themes cosmic cyan on', 'info');
    } else {
      showToast('Themes white on', 'info');
    }
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
          showToast((result.error as string) || 'Failed to load directory contents', 'error');
        }
      } catch (err) {
        showToast((err as Error).message || 'Network error encountered', 'error');
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
    setSelectedFileIds([]);
  };

  const navigateToParent = () => {
    if (breadcrumbs.length > 1) {
      const parentBreadcrumb = breadcrumbs[breadcrumbs.length - 2];
      setCurrentFolderId(parentBreadcrumb.id);
    } else {
      setCurrentFolderId(null);
    }
    setSearchQuery('');
    setSelectedFileIds([]);
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
        showToast('Admin login successful ✓', 'success');
      } else {
        setAuthError((data.error as string) || 'Incorrect administrator password');
      }
    } catch {
      setAuthError('Failed to connect to authentication server');
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
      setUser({ name: 'GuestUser', role: 'guest' });
      setShowAuthDropdown(false);
      showToast('Logged out from Admin mode', 'info');
      fetchContents(currentFolderId, true);
    } catch (e) {
      console.error('Logout failed:', e);
      showToast('Failed to log out', 'error');
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
        showToast('Folder created successfully ✓', 'success');
      } else {
        showToast((data.error as string) || 'Failed to create folder', 'error');
      }
    } catch (err) {
      showToast((err as Error).message || 'Network error encountered', 'error');
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
        const renamedId = renameTarget.id;
        setRenameTarget(null);
        setRenameInput('');
        setAnimatedRenameId(renamedId);
        await fetchContents(currentFolderId, true);
        setTimeout(() => setAnimatedRenameId(null), 900);
        showToast('Item renamed successfully ✓', 'success');
      } else {
        showToast((data.error as string) || 'Failed to rename item', 'error');
      }
    } catch (err) {
      showToast((err as Error).message || 'Network error encountered', 'error');
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
        setAnimatedDeleteId(deleteTarget.id);
        const deletedType = deleteTarget.type;
        setTimeout(async () => {
          setDeleteTarget(null);
          setAnimatedDeleteId(null);
          await fetchContents(currentFolderId, true);
          showToast(`${deletedType === 'folder' ? 'Folder' : 'File'} deleted successfully ✓`, 'success');
        }, 500);
      } else {
        showToast((data.error as string) || 'Failed to delete item', 'error');
      }
    } catch (err) {
      showToast((err as Error).message || 'Network error encountered', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Toggle Hide / Show Action (Admin only)
  const handleToggleHide = async (type: 'folder' | 'file', id: string, currentHidden: boolean) => {
    try {
      const endpoint = type === 'folder' ? '/api/folders' : '/api/files';
      const targetState = !currentHidden;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_hidden: targetState }),
      });
      const data = await safeParseJson(res);
      if (data.success) {
        await fetchContents(currentFolderId, true);
        showToast(
          `${type === 'folder' ? 'Folder' : 'File'} is now ${targetState ? 'HIDDEN 🔒 (Guest users cannot see/access)' : 'VISIBLE 👁️ (Accessible to everyone)'}`,
          'info'
        );
      } else {
        showToast((data.error as string) || 'Failed to update visibility', 'error');
      }
    } catch (err) {
      showToast((err as Error).message || 'Network error encountered', 'error');
    }
  };

  // Download File Action — always triggers a direct GitHub download (0 byte Vercel bandwidth)
  const handleDownloadFile = async (file: FileItem) => {
    setDownloadingFileId(file.id);
    try {
      const targetUrl = buildDirectLink(file);

      const a = document.createElement('a');
      a.href = targetUrl;
      a.download = file.name;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 200);

      showToast(`Downloading "${file.name}"... 🚀`, 'info');
    } catch (err) {
      showToast((err as Error).message || 'Failed to trigger file download', 'error');
    } finally {
      setTimeout(() => setDownloadingFileId(null), 1200);
    }
  };

  // Resolve the GitHub Release asset URL for a file.
  // - Public single asset  -> the stored GitHub URL itself.
  // - Chunked/merged asset -> rebuilt from its storage path on GitHub.
  // Returns null only when the file lives outside GitHub storage.
  const resolveGitHubLink = (file: FileItem): string | null => {
    if (file.download_url && file.download_url.startsWith('http')) {
      return file.download_url;
    }
    if (file.download_url?.startsWith('chunked:') && file.storage_path) {
      return githubAssetUrl(file.storage_path);
    }
    return null;
  };

  // Build the most efficient download URL for a file.
  // Every file resolves to GitHub (0 byte Vercel bandwidth); the API route is only
  // used as a last-resort fallback for non-GitHub (local) storage.
  const buildDirectLink = (file: FileItem): string => {
    const ghLink = resolveGitHubLink(file);
    if (ghLink) return ghLink;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/api/download/${file.id}/${encodeURIComponent(file.name)}`;
  };

  // Copy Direct Link — always provides a direct GitHub CDN link (0 byte Vercel bandwidth)
  const copyDirectLink = (file: FileItem) => {
    navigator.clipboard.writeText(buildDirectLink(file));
    showToast('Direct download link copied to clipboard! 📋', 'success');
  };

  // Copy NMID for Support
  const copyNmid = () => {
    navigator.clipboard.writeText('ID1023272477176');
    showToast('NMID ID1023272477176 copied to clipboard! 📋', 'success');
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
          setError((uploadErr as Error).message || 'Failed to upload file to GitHub');
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
          setError((data.error as string) || 'Failed to upload file');
        }
      }
    } catch (err) {
      setError((err as Error).message || 'Network error encountered during upload');
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
    showToast('Upload process completed! ✓', 'success');
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

  // Check URL parameters for direct file download (?download=...)
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

          // Direct GitHub Release CDN download prevents consuming Vercel bandwidth quota
          const dlUrl = target.download_url && target.download_url.startsWith('http')
            ? target.download_url
            : `/api/download/${encodeURIComponent(target.id)}`;

          const a = document.createElement('a');
          a.href = dlUrl;
          a.download = target.name;
          a.rel = 'noopener';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => a.remove(), 200);

          showToast(`Downloading "${target.name}" (${formatFileSize(target.size)})... 🚀`, 'info');
        } else {
          throw new Error((data.error as string) || 'Requested file was not found');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setAutoDownloadLoading(false);
        setAutoDownloadError(err.message || 'Failed to retrieve file download details');
        showToast(err.message || 'Failed to trigger file download', 'error');
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

  // Format Date & Time (e.g. "14 Oct 2026", "21:34 WIB")
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

  // ---- MULTI-SELECT (BULK ACTIONS) ----
  const selectedFiles = useMemo(
    () => files.filter((f) => selectedFileIds.includes(f.id)),
    [files, selectedFileIds]
  );

  const allVisibleSelected =
    filteredFiles.length > 0 && filteredFiles.every((f) => selectedFileIds.includes(f.id));

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      if (prev) setSelectedFileIds([]);
      return !prev;
    });
  };

  const toggleFileSelection = (id: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredFiles.map((f) => f.id);
    setSelectedFileIds((prev) =>
      allVisibleSelected
        ? prev.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...prev, ...visibleIds]))
    );
  };

  const handleBulkCopyLinks = async () => {
    if (selectedFiles.length === 0) return;
    const links = selectedFiles.map((f) => buildDirectLink(f)).join('\n');
    try {
      await navigator.clipboard.writeText(links);
      showToast(
        `Copied ${selectedFiles.length} download link${selectedFiles.length > 1 ? 's' : ''} to clipboard! 📋`,
        'success'
      );
    } catch {
      showToast('Failed to copy links to clipboard', 'error');
    }
  };

  const handleBulkDownload = async () => {
    if (selectedFiles.length === 0 || bulkProcessing) return;
    setBulkProcessing(true);
    showToast(
      `Starting download of ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}... 🚀`,
      'info'
    );
    for (const file of selectedFiles) {
      const a = document.createElement('a');
      a.href = buildDirectLink(file);
      a.download = file.name;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 300);
      // Small spacing so the browser does not block rapid successive downloads
      await new Promise((r) => setTimeout(r, 700));
    }
    setBulkProcessing(false);
    showToast(
      `Triggered download for ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} ✓`,
      'success'
    );
  };

  // Bulk delete (Admin only) — deletes sequentially to keep db.json writes consistent
  const handleBulkDelete = async () => {
    const ids = selectedFiles.map((f) => f.id);
    if (ids.length === 0 || bulkProcessing) return;
    setBulkProcessing(true);
    let deletedCount = 0;
    const failedIds: string[] = [];
    for (const id of ids) {
      try {
        const res = await fetch(`/api/files?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await safeParseJson(res);
        if (data.success) deletedCount++;
        else failedIds.push(id);
      } catch {
        failedIds.push(id);
      }
    }
    setBulkProcessing(false);
    setShowBulkDeleteModal(false);
    setSelectedFileIds(failedIds);
    await fetchContents(currentFolderId, true);
    if (failedIds.length === 0) {
      setSelectionMode(false);
      showToast(`Deleted ${deletedCount} file${deletedCount > 1 ? 's' : ''} successfully ✓`, 'success');
    } else {
      showToast(`${deletedCount} deleted, ${failedIds.length} failed to delete`, 'error');
    }
  };

  return (
    <div className="app-container">
      {/* Mobile Nav Toggle Button */}
      <button
        className="mobile-nav-toggle"
        onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
        aria-label="Toggle Navigation Menu"
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
              <Folder size={17} color={currentFolderId === null ? 'var(--accent-cyan)' : 'var(--text-secondary)'} />
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
              <Clock size={17} color="var(--text-secondary)" />
              <span>Changelog</span>
            </div>
          </button>

          <div className="nav-group-title">COMMUNITY</div>

          {/* Discord */}
          <a
            href="https://discord.gg/BkbchbysvZ"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item-hanswy"
          >
            <div className="nav-item-content">
              <MessageSquare size={17} color="var(--text-secondary)" />
              <span>Discord</span>
            </div>
            <span className="nav-arrow-external">↗</span>
          </a>

          {/* Support HansWY - QRIS Modal Trigger */}
          <button
            type="button"
            className="nav-item-hanswy"
            onClick={() => {
              setShowSupportModal(true);
              setMobileSidebarOpen(false);
            }}
          >
            <div className="nav-item-content">
              <Heart size={17} color="var(--accent-cyan)" />
              <span>Support HansWY</span>
            </div>
            <span className="nav-arrow-active">↗</span>
          </button>
        </nav>

        {/* Sidebar Footer & Admin Controls */}
        <div className="sidebar-footer">
          {/* User status card for admin */}
          <div style={{ position: 'relative' }}>
            <div
              className="user-status-card"
              onClick={() => setShowAuthDropdown(!showAuthDropdown)}
              title="Admin Authentication Access"
            >
              <div className="user-status-left">
                <div className="user-avatar-badge">{user.role === 'admin' ? 'H' : 'G'}</div>
                <span className="user-name">{user.role === 'admin' ? 'HansWY (Admin)' : user.name}</span>
              </div>
              <ChevronDown size={14} color="var(--text-muted)" />
            </div>

            {showAuthDropdown && (
              <div
                className="auth-dropdown"
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  backgroundColor: 'var(--modal-bg)',
                  border: '1px solid var(--modal-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px',
                  zIndex: 60,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}
              >
                {user.role === 'admin' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLogout();
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#ef4444',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <Lock size={14} /> Logout Admin
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
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
                      cursor: 'pointer',
                    }}
                  >
                    <Unlock size={14} /> Admin Login
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
              title="Return to Root"
            >
              <Folder size={16} />
            </span>
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id || 'root'}>
                {idx > 0 && <span style={{ color: 'var(--text-muted)' }}>/</span>}
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

            {/* Toggleable Theme Button (Cosmic Cyan vs Themes White) */}
            <button
              className={`theme-toggle-btn ${cosmicThemeActive ? 'active' : ''}`}
              title={cosmicThemeActive ? 'Themes cosmic cyan on (click to switch to Themes white)' : 'Themes white on (click to switch to Themes cosmic cyan)'}
              onClick={toggleTheme}
            >
              {cosmicThemeActive ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>

        {/* Configuration Warning Banner if GitHub missing */}
        {schemaMissing && (
          <div
            style={{
              backgroundColor: 'var(--accent-subtle)',
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
              <h4 style={{ color: 'var(--text-primary)', fontSize: '0.92rem', fontWeight: 700, marginBottom: '4px' }}>
                GitHub Cloud Storage Not Configured
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.5' }}>
                {schemaErrorMessage || 'Please configure GITHUB_TOKEN in your environment variables for continuous cloud releases.'}
              </p>
            </div>
          </div>
        )}

        {/* ============================================================
            HERO BANNER - ANIMATION VIDEO (AUTOPLAY WITH MUTE/UNMUTE)
            ============================================================ */}
        <section className="hero-banner-wrap">
          <video
            ref={bannerVideoRef}
            src="/hanswy-banner.mp4"
            autoPlay
            loop
            muted={isBannerMuted}
            playsInline
            className="hero-banner-video"
          />

          {/* Sound Toggle Button */}
          <button
            type="button"
            className="banner-sound-toggle-btn"
            onClick={toggleBannerSound}
            title={isBannerMuted ? 'Unmute banner sound' : 'Mute banner sound'}
            aria-label={isBannerMuted ? 'Unmute banner sound' : 'Mute banner sound'}
          >
            {isBannerMuted ? (
              <>
                <VolumeX size={15} />
                <span>Muted</span>
              </>
            ) : (
              <>
                <Volume2 size={15} className="banner-sound-active-icon" />
                <span>Playing</span>
              </>
            )}
          </button>
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
                <span className="changelog-date">30 Oct 2026 • 20:45 WIB</span>
              </div>
              <span className="changelog-title">VERSION 3.5 - SMART MULTI-SELECT & BULK ACTIONS</span>
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
              title="Refresh directory"
            >
              <RotateCw size={15} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>

            {/* Multi-select toggle (Guest & Admin) */}
            <button
              className={`icon-control-btn ${selectionMode ? 'select-mode-active' : ''}`}
              onClick={toggleSelectionMode}
              disabled={filteredFiles.length === 0}
              title={selectionMode ? 'Exit select mode' : 'Select multiple files'}
            >
              {selectionMode ? <SquareCheck size={15} /> : <Square size={15} />}
            </button>

            {/* Admin action buttons */}
            {user.role === 'admin' && (
              <>
                <button
                  className="btn-admin-action secondary"
                  onClick={() => setShowCreateFolderModal(true)}
                  title="Create new directory"
                >
                  <Plus size={14} />
                  <span>Folder</span>
                </button>
                <button
                  className="btn-admin-action primary"
                  onClick={() => setShowUploadModal(true)}
                  title="Upload files"
                >
                  <Upload size={14} />
                  <span>Upload</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Bulk action bar (multi-select) */}
        {selectionMode && (
          <div className="bulk-action-bar">
            <div className="bulk-action-left">
              <button type="button" className="bulk-select-all" onClick={toggleSelectAllVisible}>
                {allVisibleSelected ? <SquareCheck size={15} /> : <Square size={15} />}
                <span>{allVisibleSelected ? 'Deselect all' : 'Select all'}</span>
              </button>
              <span className="bulk-count">
                {selectedFileIds.length} file{selectedFileIds.length === 1 ? '' : 's'} selected
              </span>
            </div>
            <div className="bulk-action-right">
              <button
                className="btn-admin-action secondary"
                disabled={selectedFileIds.length === 0 || bulkProcessing}
                onClick={handleBulkCopyLinks}
                title="Copy download links of selected files"
              >
                <LinkIcon size={14} />
                <span>Copy Links</span>
              </button>
              <button
                className="btn-admin-action secondary"
                disabled={selectedFileIds.length === 0 || bulkProcessing}
                onClick={handleBulkDownload}
                title="Download selected files"
              >
                <Download size={14} />
                <span>Download</span>
              </button>
              {user.role === 'admin' && (
                <button
                  className="btn-admin-action bulk-delete"
                  disabled={selectedFileIds.length === 0 || bulkProcessing}
                  onClick={() => setShowBulkDeleteModal(true)}
                  title="Delete selected files"
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>
        )}

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
            <span>Go back to parent directory (..)</span>
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
            <p style={{ fontSize: '0.85rem' }}>Loading HansWY Archive directory...</p>
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
                <h4 style={{ color: 'var(--text-primary)', marginBottom: '4px', fontSize: '0.95rem' }}>
                  {searchQuery ? 'No matching files or folders found' : 'This directory is empty'}
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {searchQuery ? 'Try searching with a different keyword.' : 'No content uploaded in this folder yet.'}
                </p>
              </div>
            )}

            {/* FOLDERS */}
            {filteredFolders.map((folder) => {
              const { dateStr, timeStr } = formatDateParts(folder.created_at);
              const isHidden = Boolean(folder.is_hidden);
              return (
                <div key={folder.id} className={`item-row-card ${animatedRenameId===folder.id?'item-anim-rename':''} ${animatedDeleteId===folder.id?'item-anim-delete':''} ${isHidden ? 'item-hidden-admin' : ''}`}>
                  <div
                    className="item-row-left"
                    onClick={() => navigateToFolder(folder.id)}
                  >
                    <div className="item-folder-badge">
                      <Folder size={20} fill="currentColor" strokeWidth={0} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="item-row-title">{folder.name}</span>
                      {isHidden && user.role === 'admin' && (
                        <span className="badge-hidden-tag">
                          <EyeOff size={11} /> Hidden
                        </span>
                      )}
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
                          className={`btn-icon-admin ${isHidden ? 'active-hide' : ''}`}
                          title={isHidden ? 'Hidden for Guests (Click to make Visible)' : 'Visible to Guests (Click to Hide)'}
                          onClick={() => handleToggleHide('folder', folder.id, isHidden)}
                        >
                          {isHidden ? <EyeOff size={13} color="#f59e0b" /> : <Eye size={13} />}
                        </button>
                        <button
                          className="btn-icon-admin"
                          title="Rename folder"
                          onClick={() => {
                            setRenameTarget({ type: 'folder', id: folder.id, name: folder.name });
                            setRenameInput(folder.name);
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn-icon-admin delete"
                          title="Delete folder"
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
              const isHidden = Boolean(file.is_hidden);
              return (
                <div key={file.id} className={`item-row-card ${animatedRenameId===file.id?'item-anim-rename':''} ${animatedDeleteId===file.id?'item-anim-delete':''}` + (isHidden ? ' item-hidden-admin' : '') + (selectedFileIds.includes(file.id) ? ' item-row-selected' : '')}>
                  {selectionMode && (
                    <button
                      type="button"
                      className={`item-select-box ${selectedFileIds.includes(file.id) ? 'checked' : ''}`}
                      onClick={() => toggleFileSelection(file.id)}
                      title={selectedFileIds.includes(file.id) ? 'Deselect file' : 'Select file'}
                    >
                      {selectedFileIds.includes(file.id) ? <SquareCheck size={18} /> : <Square size={18} />}
                    </button>
                  )}
                  <div className="item-row-left">
                    <div className={`item-file-badge ${isApk ? 'apk' : ''}`}>
                      {renderFileIcon(file)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="item-row-title" title={file.name}>
                          {file.name}
                        </span>
                        {isHidden && user.role === 'admin' && (
                          <span className="badge-hidden-tag">
                            <EyeOff size={11} /> Hidden
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
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
                          className={`btn-icon-admin ${isHidden ? 'active-hide' : ''}`}
                          title={isHidden ? 'Hidden for Guests (Click to make Visible)' : 'Visible to Guests (Click to Hide)'}
                          onClick={() => handleToggleHide('file', file.id, isHidden)}
                        >
                          {isHidden ? <EyeOff size={13} color="#f59e0b" /> : <Eye size={13} />}
                        </button>
                        <button
                          className="btn-icon-admin"
                          title="Rename file"
                          onClick={() => {
                            setRenameTarget({ type: 'file', id: file.id, name: file.name });
                            setRenameInput(file.name);
                          }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn-icon-admin delete"
                          title="Delete file"
                          onClick={() => setDeleteTarget({ type: 'file', id: file.id, name: file.name })}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}

                    <button
                      className="btn-icon-admin"
                      title="Copy direct download link"
                      onClick={() => copyDirectLink(file)}
                    >
                      <LinkIcon size={13} />
                    </button>

                    <button
                      className="item-btn-download"
                      onClick={() => handleDownloadFile(file)}
                      disabled={downloadingFileId === file.id}
                      title="Download file"
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
            BOTTOM SITE FOOTER
            ============================================================ */}
        <footer className="site-footer-bar">
          <div className="site-footer-brand">
            <span className="footer-brand-name">HANSWY</span>
            <span style={{ color: 'var(--text-muted)' }}>FILES</span>
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
          3. MODALS (DISCLAIMER, CHANGELOG, LOGIN, FOLDER, UPLOAD, SUPPORT QRIS)
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
                  Release Notes<span className="accent-dot">.</span>
                </h3>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setShowChangelogModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-text-body" style={{ maxHeight: '340px', overflowY: 'auto' }}>
              <div style={{ borderLeft: '2px solid var(--accent-cyan)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>30 Oct 2026 - 20:45 WIB (v3.5)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • <b>Multi-Select Mode</b>: Added a select toggle available to both Guest and Admin. Pick multiple files, then run bulk actions in one go.
                  <br />• <b>Bulk Copy &amp; Download</b>: Copy all selected download links at once, or trigger downloads for every selected file with a single click.
                  <br />• <b>Zero-Bandwidth &amp; GitHub Delivery</b>: All downloads (single and bulk) now resolve to GitHub CDN via 302 redirects. This ensures 0 bytes of Vercel bandwidth are consumed, keeping the "Fast Origin Transfer" quota safe.
                  <br />• <b>Auto-Merge Engine</b>: Large files uploaded in parts are now automatically merged into single assets on GitHub, allowing direct downloads for all future uploads.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--accent-cyan)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>30 Oct 2026 - 04:15 WIB (v3.4)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • <b>Full GitHub Direct-Delivery</b>: Re-consolidated every large APK that was previously split into parts (chunked) into a single asset on GitHub Releases. All files now serve through a 302 redirect straight to GitHub's CDN.
                  <br />• <b>Zero Vercel Bandwidth</b>: Downloads no longer pass through the serverless function, so Fast Origin Transfer usage drops to 0 bytes for every file — keeping the Vercel quota permanently safe from overlimit.
                  <br />• <b>Consistent Direct Links</b>: Both the Download button and "Copy Direct Link" now always point to GitHub, with no server-bandwidth throttling.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--accent-cyan)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>29 Oct 2026 - 16:10 WIB (v3.3)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • <b>Zero-Bandwidth Frontend Optimization</b>: Optimized `handleDownloadFile` and `copyDirectLink` to use direct GitHub CDN URLs for all public single files. This bypasses Vercel's edge network, ensuring 0 bytes of bandwidth quota are consumed for these downloads.
                  <br />• <b>Improved Quota Safety</b>: The frontend now prioritizes external CDN endpoints over serverless proxies, protecting your Vercel account from "Fast Origin Transfer" overlimits.
                  <br />• <b>Intelligent Path Selection</b>: The system automatically detects file status and chooses the most efficient download path (Direct CDN vs. API Streaming) without any user intervention.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--accent-cyan)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>29 Oct 2026 - 15:45 WIB (v3.2)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • <b>Streaming Merge Engine</b>: Implemented real-time reconstruction for large files split into parts on GitHub. This eliminates 404 errors for fragmented APKs.
                  <br />• <b>Catch-all Download API</b>: Upgraded download routes to support native file extensions (e.g., `/api/download/ID/Roblox.apk`), ensuring 100% compatibility with Executor Installer and Redfinger.
                  <br />• <b>Stable Direct Links</b>: "Copy Direct Link" now generates robust API-backed URLs that handle both standard and chunked files seamlessly.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--border-card)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>29 Oct 2026 - 15:30 WIB (v3.1)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • <b>Streaming Merge for Large Files</b>: Fixed download failures for files split into parts (chunked) on GitHub. Large APKs are now merged in real-time during download.
                  <br />• <b>Enhanced Installer Compatibility</b>: Updated download API to support catch-all path segments, ensuring direct links end with `.apk` for native compatibility with Executor Installer and Redfinger.
                  <br />• <b>Improved Link Persistence</b>: "Copy Direct Link" now provides a stable internal API endpoint that guarantees successful downloads regardless of file size or fragmentation.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--border-card)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>29 Oct 2026 - 06:45 WIB (v3.0)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • <b>New Cinematic Pixel Banner Animation</b>: Integrated updated high-definition animated pixel banner with immersive visual effects and custom soundtrack.
                  <br />• <b>Interactive Audio Mute/Unmute Controls</b>: Added ambient sound controller button on the banner allowing users to seamlessly toggle audio on or off anytime.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--border-card)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>29 Oct 2026 - 05:45 WIB (v2.9)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • <b>Admin Hide/Show Controls</b>: Added visibility toggle (eye icon) for both folders and files. Admins can test and verify content while keeping it completely invisible and inaccessible to Guest users.
                  <br />• <b>Secure Hidden State</b>: Hidden items are filtered out from Guest directory queries and blocked from direct downloads with HTTP 403 unless accessed with valid Admin authentication.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--border-card)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>29 Oct 2026 - 03:15 WIB (v2.8)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • <b>Remote / Bot Installer Compatibility</b>: Fixed Executor Installer & Redfinger remote APK installation failures by streaming binaries directly with direct `.apk` URL formats, `application/vnd.android.package-archive` MIME headers, and CORS enabled.
                  <br />• <b>Copy Direct Link Enhancement</b>: Copied links now generate direct API download URLs ending with `.apk` parameter, allowing automated remote installers to identify and download APK packages without browser interference.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--border-card)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>29 Oct 2026 - 03:00 WIB (v2.7)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • <b>Direct Download Fix</b>: Fixed browser `about:blank#blocked` error by properly proxying and triggering downloads through server-side stream endpoints with proper Content-Disposition headers.
                  <br />• <b>UI Animations</b>: Added visual confirmation animations (green highlight pulse) on folder/file rename and smooth fade-out effect on folder/file deletion.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--border-card)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>29 Oct 2026 - 01:30 WIB (v2.5)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • <b>Admin Logout Fix</b>: Resolved click dismissal conflict on the admin menu and reinforced secure session cookie deletion.
                  <br />• <b>Session Sync</b>: Instant guest-mode UI synchronization and directory permissions update upon logging out.
                  <br />• <b>UI & Performance</b>: Smoother dropdown interactions and clean error handling.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--border-card)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>29 Oct 2026 - 01:00 WIB (v2.4)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • Complete English localization across all pages, controls, and dialogs.
                  <br />• Dual theme engine: <b>Themes cosmic cyan on</b> & <b>Themes white on</b>.
                  <br />• Streamlined compact QRIS donation template (mobile & desktop optimized).
                  <br />• Removed sponsor space for a cleaner and clutter-free interface.
                  <br />• Official Discord server link updated.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--border-card)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>23 Oct 2026 - 21:00 WIB (v2.2)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • Redesigned brand and theme to HansWY Cosmic Cyan.
                  <br />• Autoplay animated hero banner video integration without play buttons.
                  <br />• Instant search filtering for folders and files.
                </p>
              </div>

              <div style={{ borderLeft: '2px solid var(--border-card)', paddingLeft: '12px', marginBottom: '14px' }}>
                <b style={{ color: 'var(--text-primary)' }}>14 Oct 2026 - 14:34 WIB (v1.0)</b>
                <p style={{ marginTop: '4px', fontSize: '0.82rem' }}>
                  • Initial release of HansWY Launcher & Tools packages with Android 10-13 compatibility.
                </p>
              </div>
            </div>

            <button
              className="btn-hanswy-primary"
              onClick={() => setShowChangelogModal(false)}
            >
              Close Notes
            </button>
          </div>
        </div>
      )}

      {/* SUPPORT HANSWY - QRIS MODAL (STREAMLINED & COMPACT TEMPLATE) */}
      {showSupportModal && (
        <div className="modal-overlay" onClick={() => setShowSupportModal(false)}>
          <div className="modal-dialog-hanswy modal-support-compact" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-hanswy" style={{ textAlign: 'left', marginBottom: '12px' }}>
              <div>
                <div className="modal-pretitle">DONATION & SUPPORT</div>
                <h3 className="modal-title-hanswy" style={{ fontSize: '1.2rem' }}>
                  Support HansWY<span className="accent-dot">.</span>
                </h3>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setShowSupportModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <p className="qris-notice-brief">
              Scan with any mobile banking or e-wallet application (BCA, Mandiri, GoPay, OVO, Dana, ShopeePay) to support free cloud updates.
            </p>

            {/* Compact QRIS Barcode Card */}
            <div className="qris-card-wrapper-compact">
              <img
                src="/qris.png"
                alt="QRIS HansWY - HAIDRINK.IND"
                className="qris-display-img-compact"
              />

              <div className="qris-meta-compact">
                <span className="qris-merchant-title">HAIDRINK.IND</span>
                <div className="qris-merchant-sub">
                  <span>NMID: ID1023272477176</span>
                  <button
                    type="button"
                    className="qris-copy-btn"
                    onClick={copyNmid}
                    title="Copy NMID"
                  >
                    <Copy size={10} />
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="qris-actions-compact">
              <a
                href="/qris.png"
                download="QRIS-HansWY-HAIDRINK.png"
                className="btn-qris-outline"
              >
                <Download size={13} />
                <span>Save QR</span>
              </a>
              <button
                type="button"
                className="btn-hanswy-primary"
                style={{ flex: 1, padding: '9px 14px', fontSize: '0.85rem' }}
                onClick={() => setShowSupportModal(false)}
              >
                Done
              </button>
            </div>
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
                  Admin Login<span className="accent-dot">.</span>
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
                  Enter administrator password to manage files, directories, and uploads.
                </p>
                {authError && (
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid #ef4444',
                      borderRadius: 'var(--radius-sm)',
                      color: '#ef4444',
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
                  <label className="form-label">Admin Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter password..."
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
                  Cancel
                </button>
                <button type="submit" className="btn-admin-action primary">
                  Sign In
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
                  Create Folder<span className="accent-dot">.</span>
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
                <label className="form-label">Folder Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. LAUNCHER, TOOLS, ARCEUS..."
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-admin-action primary"
                  disabled={creatingFolder}
                >
                  {creatingFolder ? (
                    <>
                      <RotateCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Creating...
                    </>
                  ) : (
                    'Create'
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
                  Rename {renameTarget.type === 'folder' ? 'Folder' : 'File'}<span className="accent-dot">.</span>
                </h3>
              </div>
              <button className="modal-close-btn" onClick={() => setRenameTarget(null)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleRename}>
              <div className="form-group">
                <label className="form-label">New Name</label>
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
                  Cancel
                </button>
                <button type="submit" className="btn-admin-action primary">
                  Save Changes
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
                  Delete {deleteTarget.type === 'folder' ? 'Folder' : 'File'}<span className="accent-dot">?</span>
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
              Are you sure you want to permanently delete <b>"{deleteTarget.name}"</b>? This action cannot be undone.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-admin-action primary"
                style={{ backgroundColor: '#ef4444' }}
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRMATION MODAL (Admin only) */}
      {showBulkDeleteModal && (
        <div className="modal-overlay" onClick={() => !bulkProcessing && setShowBulkDeleteModal(false)}>
          <div className="modal-dialog-hanswy" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-hanswy">
              <div>
                <div className="modal-pretitle">BULK DELETE CONFIRMATION</div>
                <h3 className="modal-title-hanswy">
                  Delete {selectedFiles.length} File{selectedFiles.length === 1 ? '' : 's'}<span className="accent-dot">?</span>
                </h3>
              </div>
              <button
                className="modal-close-btn"
                disabled={bulkProcessing}
                onClick={() => setShowBulkDeleteModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Are you sure you want to permanently delete <b>{selectedFiles.length} selected file{selectedFiles.length === 1 ? '' : 's'}</b>? This action cannot be undone.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-cancel"
                disabled={bulkProcessing}
                onClick={() => setShowBulkDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-admin-action primary"
                style={{ backgroundColor: '#ef4444' }}
                disabled={bulkProcessing}
                onClick={handleBulkDelete}
              >
                {bulkProcessing ? 'Deleting...' : `Yes, Delete ${selectedFiles.length}`}
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
                  Upload Files<span className="accent-dot">.</span>
                </h3>
              </div>
              <button className="modal-close-btn" disabled={isProcessingQueue} onClick={closeUploadModal}>
                <X size={16} />
              </button>
            </div>

            <div className="drop-zone" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => !isProcessingQueue && bulkFileInputRef.current?.click()}>
              <Upload size={28} color={isDragOver ? 'var(--accent-cyan)' : 'var(--text-muted)'} style={{ margin: '0 auto 8px', display: 'block' }} />
              <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px', fontSize: '0.9rem' }}>
                Drag & drop files here
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>or click to browse from device</p>
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
                  <span>Queue ({uploadQueue.length} files)</span>
                  {successCount > 0 && <span style={{ color: '#22c55e' }}>{successCount} completed</span>}
                </div>

                <div className="queue-list">
                  {uploadQueue.map((item) => (
                    <div key={item.id} className="queue-item">
                      <div className="queue-file-info">
                        <span className="queue-filename">{item.file.name}</span>
                        <span className="queue-filesize">{formatFileSize(item.file.size)}</span>
                      </div>
                      {item.status === 'uploading' && <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>{item.progress}%</span>}
                      {item.status === 'success' && <Check size={14} color="#22c55e" />}
                      {item.status === 'error' && <span style={{ fontSize: '0.72rem', color: '#ef4444' }}>Failed</span>}
                      {item.status === 'queued' && !isProcessingQueue && (
                        <button onClick={() => removeFromQueue(item.id)} style={{ color: 'var(--text-muted)' }}>
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
                Close
              </button>
              {queuedCount > 0 && (
                <button
                  type="button"
                  className="btn-admin-action primary"
                  disabled={isProcessingQueue}
                  onClick={startBatchUpload}
                >
                  {isProcessingQueue ? 'Uploading...' : `Upload (${queuedCount} files)`}
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
              <h3 className="modal-title-hanswy">HansWY File Download</h3>
            </div>
            <div style={{ margin: '16px 0' }}>
              <Download size={36} color="var(--accent-cyan)" style={{ margin: '0 auto 12px' }} />
              <h4 style={{ color: 'var(--text-primary)', fontSize: '1rem', marginBottom: '6px' }}>{autoDownloadFile.name}</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                Size: {formatFileSize(autoDownloadFile.size)}
              </p>
            </div>
            <a
              href={autoDownloadFile.is_chunked ? `/api/download/${autoDownloadFile.id}` : autoDownloadFile.download_url}
              download={autoDownloadFile.name}
              className="btn-hanswy-primary"
            >
              Download Again
            </a>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATIONS */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === 'success' && <Check size={16} color="#22c55e" />}
            {toast.type === 'error' && <AlertCircle size={16} color="#ef4444" />}
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
