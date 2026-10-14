-- =====================================================================
-- fix-bucket-sizelimit.sql
-- Jalankan skrip ini di Supabase SQL Editor untuk menghapus
-- batasan ukuran file pada bucket 'file-hanswy'
-- =====================================================================

-- 1. Hapus batasan ukuran file pada bucket 'file-hanswy'
-- (Mengubah file_size_limit menjadi NULL berarti tidak ada batas per-bucket)
UPDATE storage.buckets
SET file_size_limit = NULL
WHERE id = 'file-hanswy';

-- 2. Pastikan bucket bersifat public
UPDATE storage.buckets
SET public = true
WHERE id = 'file-hanswy';

-- 3. Verifikasi konfigurasi bucket
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'file-hanswy';
