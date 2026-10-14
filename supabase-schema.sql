-- =========================================================================
-- File HansWY - Supabase Database & Storage Setup Script (100% Automated)
-- Jalankan skrip ini di SQL Editor Supabase Anda untuk mengaktifkan database
-- dan penyimpanan cloud persisten 24 jam.
-- =========================================================================

-- 1. Buat Tabel Folders
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk pencarian cepat berdasarkan parent_id
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON public.folders(parent_id);

-- 2. Buat Tabel Files
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    size BIGINT NOT NULL DEFAULT 0,
    mime_type TEXT DEFAULT 'application/octet-stream',
    storage_path TEXT NOT NULL,
    download_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk pencarian cepat berdasarkan folder_id
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON public.files(folder_id);

-- 3. Kebijakan Keamanan (RLS)
-- Nonaktifkan RLS agar API backend Next.js (yang divalidasi dengan password admin)
-- dapat membaca, menambah, mengubah, dan menghapus folder/file secara langsung.
ALTER TABLE public.folders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;

-- Berikan izin akses penuh ke public role (anon, authenticated, service_role)
GRANT ALL ON TABLE public.folders TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.files TO anon, authenticated, service_role;

-- 4. Buat Storage Bucket 'file-hanswy' secara otomatis
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('file-hanswy', 'file-hanswy', true, 104857600, NULL) -- 100MB limit
ON CONFLICT (id) DO UPDATE SET public = true;

-- 5. Kebijakan Akses Storage Bucket 'file-hanswy'
DROP POLICY IF EXISTS "Public Storage Read" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Insert" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Update" ON storage.objects;
DROP POLICY IF EXISTS "Public Storage Delete" ON storage.objects;

CREATE POLICY "Public Storage Read" ON storage.objects
    FOR SELECT USING (bucket_id = 'file-hanswy');

CREATE POLICY "Public Storage Insert" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'file-hanswy');

CREATE POLICY "Public Storage Update" ON storage.objects
    FOR UPDATE USING (bucket_id = 'file-hanswy');

CREATE POLICY "Public Storage Delete" ON storage.objects
    FOR DELETE USING (bucket_id = 'file-hanswy');

-- 6. Seed Data Awal (Struktur Folder Sesuai Referensi)
DO $$
DECLARE
    arceus_id UUID;
    android10_id UUID;
BEGIN
    -- Cek apakah folder root sudah pernah dibuat
    IF NOT EXISTS (SELECT 1 FROM public.folders WHERE name = 'ARCEUS' AND parent_id IS NULL) THEN
        INSERT INTO public.folders (name, parent_id) VALUES ('ARCEUS', NULL) RETURNING id INTO arceus_id;
        INSERT INTO public.folders (name, parent_id) VALUES ('DELTA LITE', NULL);
        INSERT INTO public.folders (name, parent_id) VALUES ('LAUNCHER', NULL);
        
        -- Subfolder di dalam ARCEUS
        INSERT INTO public.folders (name, parent_id) VALUES ('ANDROID 10', arceus_id) RETURNING id INTO android10_id;
        INSERT INTO public.folders (name, parent_id) VALUES ('ANDROID 12', arceus_id);
    END IF;
END $$;
