'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import { FolderItem, FileItem, BreadcrumbItem } from '@/lib/types';

interface UserInfo {
  name: string;
  role: 'admin' | 'guest';
}

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
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

  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  const [renameTarget, setRenameTarget] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'folder' | 'file'; id: string; name: string } | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  };

  // Check auth status
  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth');
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
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
        const result = await res.json();

        if (result.success && result.data) {
          setCurrentFolder(result.data.currentFolder);
          setBreadcrumbs(result.data.breadcrumbs);
          setFolders(result.data.folders);
          setFiles(result.data.files);
          setIsCloudStorage(result.data.isCloudStorage);
        } else {
          showToast(result.error || 'Gagal memuat isi direktori', 'error');
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

  // Navigate to folder
  const navigateToFolder = (id: string | null) => {
    setCurrentFolderId(id);
  };

  // Navigate up to parent
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
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setShowLoginModal(false);
        setAdminPasswordInput('');
        showToast('Login berhasil sebagai HansWY (Admin)', 'success');
      } else {
        setAuthError(data.error || 'Password salah');
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

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: currentFolderId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Folder "${newFolderName}" berhasil dibuat`, 'success');
        setNewFolderName('');
        setShowCreateFolderModal(false);
        fetchContents(currentFolderId, true);
      } else {
        showToast(data.error || 'Gagal membuat folder', 'error');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  // Handle Upload File
  const handleUploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAdmin()) return;

    if (!selectedUploadFile) {
      showToast('Pilih file terlebih dahulu', 'error');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedUploadFile);
    if (currentFolderId) {
      formData.append('folderId', currentFolderId);
    }

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        showToast(`File "${selectedUploadFile.name}" berhasil diunggah`, 'success');
        setSelectedUploadFile(null);
        setShowUploadModal(false);
        fetchContents(currentFolderId, true);
      } else {
        showToast(data.error || 'Gagal mengunggah file', 'error');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setUploading(false);
    }
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
      const data = await res.json();
      if (data.success) {
        showToast(`Berhasil mengubah nama menjadi "${renameInput}"`, 'success');
        setRenameTarget(null);
        fetchContents(currentFolderId, true);
      } else {
        showToast(data.error || 'Gagal mengubah nama', 'error');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!requireAdmin() || !deleteTarget) return;

    try {
      const endpoint =
        deleteTarget.type === 'folder'
          ? `/api/folders?folderId=${deleteTarget.id}`
          : `/api/files?fileId=${deleteTarget.id}`;

      const res = await fetch(endpoint, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast(
          `${deleteTarget.type === 'folder' ? 'Folder' : 'File'} "${deleteTarget.name}" berhasil dihapus`,
          'success'
        );
        setDeleteTarget(null);
        fetchContents(currentFolderId, true);
      } else {
        showToast(data.error || 'Gagal menghapus item', 'error');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  };

  // Copy Direct Link
  const copyDirectLink = (file: FileItem) => {
    const fullUrl = file.download_url.startsWith('http')
      ? file.download_url
      : `${window.location.origin}${file.download_url}`;

    navigator.clipboard.writeText(fullUrl);
    showToast('Tautan langsung berhasil disalin ke clipboard! 📋', 'success');
  };

  // Format File Size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  // Format Date (matching screenshot: 10/14/2026, 1:05:34 PM)
  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return dateString;
    }
  };

  // File icon selector
  const renderFileIcon = (file: FileItem) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'apk') {
      return <Smartphone size={22} />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <Archive size={22} />;
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext || '')) {
      return <ImageIcon size={22} />;
    }
    if (['mp4', 'mkv', 'mov', 'avi'].includes(ext || '')) {
      return <Video size={22} />;
    }
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) {
      return <Music size={22} />;
    }
    return <FileText size={22} />;
  };

  const totalItemCount = folders.length + files.length;

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

          {/* Auth Dropdown Popup */}
          {showAuthDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                backgroundColor: 'var(--bg-card)',
                border: '1.5px solid var(--border-red)',
                borderRadius: 'var(--radius-md)',
                padding: '8px',
                zIndex: 40,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}
            >
              {user.role === 'admin' ? (
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    borderRadius: 'var(--radius-sm)',
                    color: '#ff4757',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                  }}
                  className="nav-item"
                >
                  <Lock size={16} /> Logout Admin
                </button>
              ) : (
                <button
                  onClick={() => {
                    setShowAuthDropdown(false);
                    setShowLoginModal(true);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                  }}
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
            onClick={() => {
              navigateToFolder(null);
              setMobileSidebarOpen(false);
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            Home
          </button>

          <button
            className="nav-item"
            onClick={() => {
              if (requireAdmin()) {
                setShowCreateFolderModal(true);
                setMobileSidebarOpen(false);
              }
            }}
          >
            <Plus size={18} />
            Buat Folder
          </button>

          <button
            className="nav-item"
            onClick={() => {
              if (requireAdmin()) {
                setShowUploadModal(true);
                setMobileSidebarOpen(false);
              }
            }}
          >
            <Upload size={18} />
            Unggah File
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
                <span className="breadcrumb-separator">&gt;</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Directory Header Banner Card */}
        <section className="directory-banner">
          <div className="directory-info">
            <div className="folder-icon-badge">
              <Folder size={28} fill="currentColor" />
            </div>
            <div className="directory-titles">
              <h2>
                {currentFolder ? currentFolder.name : 'Root Directory'}
              </h2>
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
              <RotateCw
                size={16}
                style={{
                  animation: refreshing ? 'spin 1s linear infinite' : 'none',
                }}
              />
              Refresh
            </button>

            <button
              className="btn-secondary"
              onClick={() => {
                if (requireAdmin()) setShowCreateFolderModal(true);
              }}
              title="Buat folder baru di direktori ini"
            >
              <Plus size={16} />
              Folder
            </button>

            <button
              className="btn-red"
              onClick={() => {
                if (requireAdmin()) setShowUploadModal(true);
              }}
              title="Unggah file baru ke direktori ini"
            >
              <Upload size={16} />
              Upload
            </button>
          </div>
        </section>

        {/* Parent Directory Link (.. Go back up to parent) */}
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
              <div
                style={{
                  textAlign: 'center',
                  padding: '50px 20px',
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border-subtle)',
                }}
              >
                <Folder size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Direktori ini masih kosong
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Klik tombol <b>Upload</b> untuk mengunggah file atau <b>Folder</b> untuk membuat folder baru.
                </p>
              </div>
            )}

            {/* FOLDERS LIST */}
            {folders.map((folder) => (
              <div key={folder.id} className="item-card">
                <div
                  className="item-left"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigateToFolder(folder.id)}
                >
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
                  {/* Admin Tools */}
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

                  {/* Open Button (Matches Reference) */}
                  <button
                    className="btn-open"
                    onClick={() => navigateToFolder(folder.id)}
                  >
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
                      <div className="item-name" title={file.name}>
                        {file.name}
                      </div>
                      <div className="item-meta">
                        {formatFileSize(file.size)} • {formatDate(file.created_at)}
                      </div>
                    </div>
                  </div>

                  <div className="item-actions">
                    {/* Admin Tools */}
                    {user.role === 'admin' && (
                      <>
                        <button
                          className="btn-icon"
                          title="Ubah nama file"
                          onClick={() => {
                            setRenameTarget({ type: 'file', id: file.id, name: file.name });
                            setRenameInput(file.name);
                          }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="btn-icon delete"
                          title="Hapus file"
                          onClick={() => {
                            setDeleteTarget({ type: 'file', id: file.id, name: file.name });
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}

                    {/* Copy Link Button */}
                    <button
                      className="btn-icon"
                      title="Salin tautan unduhan langsung"
                      onClick={() => copyDirectLink(file)}
                    >
                      <LinkIcon size={16} />
                    </button>

                    {/* Download Button (Mint Green badge matching reference) */}
                    <a
                      href={file.download_url}
                      download={file.name}
                      className="btn-download"
                      style={{ textDecoration: 'none' }}
                      title="Unduh file ini"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download size={16} strokeWidth={2.8} />
                      Download
                    </a>
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
              <button
                className="btn-icon"
                onClick={() => setShowLoginModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleLogin}>
              <div className="modal-body">
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '16px' }}>
                  Masukkan password admin untuk mengakses fitur upload, buat folder, rename, dan hapus.
                </p>
                {authError && (
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'rgba(230, 40, 49, 0.15)',
                      border: '1px solid var(--accent-red)',
                      borderRadius: 'var(--radius-md)',
                      color: '#ff6b75',
                      fontSize: '0.85rem',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
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
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowLoginModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-red">
                  Login Admin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE FOLDER MODAL */}
      {showCreateFolderModal && (
        <div className="modal-overlay" onClick={() => setShowCreateFolderModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Buat Folder Baru</h3>
              <button
                className="btn-icon"
                onClick={() => setShowCreateFolderModal(false)}
              >
                <X size={18} />
              </button>
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
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowCreateFolderModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-red">
                  Buat Folder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD FILE MODAL */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => !uploading && setShowUploadModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Unggah File ke Direktori</h3>
              <button
                className="btn-icon"
                disabled={uploading}
                onClick={() => setShowUploadModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUploadFile}>
              <div className="modal-body">
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '14px' }}>
                  Lokasi target:{' '}
                  <b style={{ color: '#ffffff' }}>
                    {currentFolder ? currentFolder.name : 'Root Directory'}
                  </b>
                </p>

                <div
                  style={{
                    border: '2px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '30px 20px',
                    textAlign: 'center',
                    backgroundColor: 'var(--bg-subtle)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={36} color="var(--accent-red)" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                    {selectedUploadFile ? selectedUploadFile.name : 'Klik untuk memilih file'}
                  </p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {selectedUploadFile
                      ? `Ukuran: ${formatFileSize(selectedUploadFile.size)}`
                      : 'Mendukung APK, ZIP, EXE, PDF, Gambar, dan semua format file'}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedUploadFile(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  disabled={uploading}
                  onClick={() => setShowUploadModal(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn-red"
                  disabled={uploading || !selectedUploadFile}
                  style={{ opacity: uploading ? 0.7 : 1 }}
                >
                  {uploading ? (
                    <>
                      <RotateCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      Mengunggah...
                    </>
                  ) : (
                    'Unggah Sekarang'
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
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                Ubah Nama {renameTarget.type === 'folder' ? 'Folder' : 'File'}
              </h3>
              <button className="btn-icon" onClick={() => setRenameTarget(null)}>
                <X size={18} />
              </button>
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
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setRenameTarget(null)}
                >
                  Batal
                </button>
                <button type="submit" className="btn-red">
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Konfirmasi Penghapusan</h3>
              <button className="btn-icon" onClick={() => setDeleteTarget(null)}>
                <X size={18} />
              </button>
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
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-red"
                style={{ backgroundColor: '#ff4757' }}
                onClick={handleDelete}
              >
                Ya, Hapus
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
