-- ==========================================================
-- JALANKAN INI DI SUPABASE SQL EDITOR (Copy & Paste -> RUN)
-- ==========================================================
-- Ini mengizinkan API backend File HansWY untuk membuat,
-- mengubah, dan menghapus folder serta file secara permanen.

-- 1. Matikan RLS agar operasi backend tidak diblokir
ALTER TABLE public.folders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.files DISABLE ROW LEVEL SECURITY;

-- 2. Berikan izin penuh
GRANT ALL ON TABLE public.folders TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.files TO anon, authenticated, service_role;

-- 3. Pastikan bucket storage 'file-hanswy' ada dan berstatus public
INSERT INTO storage.buckets (id, name, public) 
VALUES ('file-hanswy', 'file-hanswy', true) 
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. Berikan izin upload dan delete ke storage bucket
DROP POLICY IF EXISTS "Public Storage All" ON storage.objects;
CREATE POLICY "Public Storage All" ON storage.objects 
FOR ALL USING (bucket_id = 'file-hanswy') 
WITH CHECK (bucket_id = 'file-hanswy');
