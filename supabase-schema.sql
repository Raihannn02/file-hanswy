-- ====================================================
-- File HansWY - Supabase Database & Storage Setup Script
-- ====================================================

-- 1. Create Folders Table
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by parent_id
CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON public.folders(parent_id);

-- 2. Create Files Table
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

-- Index for fast lookup by folder_id
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON public.files(folder_id);

-- 3. Row Level Security (RLS)
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Allow public read access (guests can view files and folders)
CREATE POLICY "Public read folders" ON public.folders
    FOR SELECT USING (true);

CREATE POLICY "Public read files" ON public.files
    FOR SELECT USING (true);

-- Allow service role full access for create/update/delete
CREATE POLICY "Service role full folders" ON public.folders
    FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full files" ON public.files
    FOR ALL TO service_role USING (true);

-- 4. Initial Seed Data (Matches the reference structure)
DO $$
DECLARE
    arceus_id UUID;
    android10_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.folders WHERE name = 'ARCEUS' AND parent_id IS NULL) THEN
        INSERT INTO public.folders (name, parent_id) VALUES ('ARCEUS', NULL) RETURNING id INTO arceus_id;
        INSERT INTO public.folders (name, parent_id) VALUES ('DELTA LITE', NULL);
        INSERT INTO public.folders (name, parent_id) VALUES ('LAUNCHER', NULL);
        
        -- Subfolders in ARCEUS
        INSERT INTO public.folders (name, parent_id) VALUES ('ANDROID 10', arceus_id) RETURNING id INTO android10_id;
        INSERT INTO public.folders (name, parent_id) VALUES ('ANDROID 12', arceus_id);
    END IF;
END $$;

-- 5. Storage Bucket:
-- Create a public bucket named 'file-hanswy' in Supabase Storage dashboard:
-- Storage -> Create Bucket -> Name: 'file-hanswy' -> Public bucket: ON.
