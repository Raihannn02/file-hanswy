-- =====================================================================
-- fix-rls-storage.sql (v2 - FIXED)
-- Jalankan script ini di Supabase SQL Editor
-- Error "must be owner of table objects" sudah diperbaiki:
-- Baris ALTER TABLE storage.objects dihapus karena tidak diperlukan
-- (RLS sudah aktif secara default di Supabase Storage)
-- =====================================================================

-- ---------------------------------------------------------------
-- BAGIAN 1: Storage Policies (bucket file-hanswy)
-- Catatan: Tidak perlu ALTER TABLE storage.objects karena
-- Supabase sudah mengaktifkan RLS-nya secara otomatis
-- ---------------------------------------------------------------

-- Hapus policies lama jika ada
DROP POLICY IF EXISTS "Allow public read"      ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload"    ON storage.objects;
DROP POLICY IF EXISTS "Allow public update"    ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete"    ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload" ON storage.objects;

-- Izinkan semua orang membaca/download file dari bucket file-hanswy
CREATE POLICY "Allow public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'file-hanswy');

-- Izinkan semua orang upload ke bucket file-hanswy
-- (Admin check dilakukan di level aplikasi via cookie session)
CREATE POLICY "Allow public upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'file-hanswy');

-- Izinkan update (diperlukan untuk fitur upsert)
CREATE POLICY "Allow public update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'file-hanswy')
  WITH CHECK (bucket_id = 'file-hanswy');

-- Izinkan delete (diperlukan saat admin menghapus file)
CREATE POLICY "Allow public delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'file-hanswy');

-- ---------------------------------------------------------------
-- BAGIAN 2: Database Table Policies
-- ---------------------------------------------------------------

-- Aktifkan RLS pada tabel milik kita sendiri (ini boleh karena kita owner)
ALTER TABLE public.files   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- Hapus policies lama jika ada
DROP POLICY IF EXISTS "Allow public read files"    ON public.files;
DROP POLICY IF EXISTS "Allow public write files"   ON public.files;
DROP POLICY IF EXISTS "Allow public read folders"  ON public.folders;
DROP POLICY IF EXISTS "Allow public write folders" ON public.folders;

-- Files: izinkan semua operasi (auth check via Next.js API)
CREATE POLICY "Allow public read files"
  ON public.files FOR SELECT USING (true);

CREATE POLICY "Allow public write files"
  ON public.files FOR ALL USING (true) WITH CHECK (true);

-- Folders: izinkan semua operasi (auth check via Next.js API)
CREATE POLICY "Allow public read folders"
  ON public.folders FOR SELECT USING (true);

CREATE POLICY "Allow public write folders"
  ON public.folders FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- SELESAI! Setelah script ini berhasil dijalankan:
-- 1. Pastikan bucket 'file-hanswy' ada di Supabase Storage
--    dan bersifat PUBLIC (centang saat membuat bucket)
-- 2. Coba upload file dari website File HansWY
-- ---------------------------------------------------------------
