export interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
  item_count?: number;
  created_at: string;
  updated_at: string;
}

export interface FileItem {
  id: string;
  name: string;
  folder_id: string;
  size: number;
  mime_type: string;
  storage_path: string;
  download_url: string;
  created_at: string;
  updated_at: string;
}

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export interface FolderContentsResponse {
  currentFolder: FolderItem | null;
  breadcrumbs: BreadcrumbItem[];
  folders: FolderItem[];
  files: FileItem[];
  totalItems: number;
  isCloudStorage: boolean;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
