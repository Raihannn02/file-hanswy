-- =====================================================================
-- fix-rls-storage.sql
-- Jalankan script ini di Supabase SQL Editor untuk mengizinkan
-- upload file langsung dari browser ke Supabase Storage
-- =====================================================================

-- 1. Pastikan bucket 'file-hanswy' sudah ada dan bersifat PUBLIC
-- (Jika belum ada, buat manual di Supabase Storage → New Bucket)
-- Centang "Public bucket" saat membuat bucket

-- 2. Drop RLS policies lama jika ada
DROP POLICY IF EXISTS "Allow public read" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow public upload" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update" ON storage.objects;

-- 3. Aktifkan RLS pada storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. Izinkan SEMUA orang untuk membaca/download file (public access)
CREATE POLICY "Allow public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'file-hanswy');

-- 5. Izinkan SEMUA orang untuk upload file ke bucket
-- (Admin check dilakukan di level aplikasi via cookie auth)
CREATE POLICY "Allow public upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'file-hanswy');

-- 6. Izinkan SEMUA orang untuk update (diperlukan untuk upsert)
CREATE POLICY "Allow public update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'file-hanswy');

-- 7. Izinkan SEMUA orang untuk delete (diperlukan saat hapus file)
CREATE POLICY "Allow public delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'file-hanswy');

-- =====================================================================
-- Juga pastikan tabel files dan folders memiliki RLS yang benar
-- =====================================================================

-- Files table: izinkan read untuk semua, write untuk semua
-- (Auth check dilakukan di level Next.js API)
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read files" ON public.files;
DROP POLICY IF EXISTS "Allow public write files" ON public.files;
DROP POLICY IF EXISTS "Allow public read folders" ON public.folders;
DROP POLICY IF EXISTS "Allow public write folders" ON public.folders;

CREATE POLICY "Allow public read files"
  ON public.files FOR SELECT USING (true);

CREATE POLICY "Allow public write files"
  ON public.files FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public read folders"
  ON public.folders FOR SELECT USING (true);

CREATE POLICY "Allow public write folders"
  ON public.folders FOR ALL USING (true) WITH CHECK (true);

-- =====================================================================
-- SELESAI! Setelah menjalankan script ini:
-- 1. Pergi ke Supabase → Storage → Buckets
-- 2. Pastikan bucket 'file-hanswy' sudah ada
-- 3. Jika belum ada: klik "New bucket", nama = file-hanswy, centang Public
-- 4. Coba upload file lagi dari website File HansWY
-- =====================================================================
