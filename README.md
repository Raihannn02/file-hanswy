# File HansWY - Cloud Storage & File Manager

Website penyimpanan dan pengelolaan file 24 jam berbasis Next.js & Vercel dengan tema merah, hitam, dan abu-abu modern yang mengacu pada referensi desain.

---

## 🚀 Fitur Utama
1. **Desain & Tampilan Modern**:
   - Sidebar navigasi dengan identitas **File HansWY**, indikator user, dan badge `POWERED BY HANSWY`.
   - Pola latar belakang dot-grid dengan tema warna merah (`#e62831`), hitam (`#0a0b0e`), dan abu-abu.
   - Tanpa banner *Support Us* atau tombol donasi.
   - Desain sepenuhnya responsif untuk desktop, tablet, dan smartphone.

2. **Pengelolaan Folder & File Lengkap**:
   - **Buat Folder Baru**: Mendukung struktur folder bertingkat (subfolder).
   - **Buka Folder**: Navigasi lancar masuk dan keluar folder.
   - **Navigasi Breadcrumb**: `Root > FOLDER > SUBFOLDER` yang dapat diklik untuk kembali ke level sebelumnya.
   - **Tombol Kembali (Go back up to parent)**: Mudah kembali satu level ke atas.
   - **Unggah File**: Mendukung semua jenis format file (APK, ZIP, Dokumen, Gambar, Video, dll.) dengan validasi ukuran.
   - **Unduh File**: Tombol unduh hijau terang dengan ikon download.
   - **Salin Tautan Langsung (Copy Link)**: Tombol salin tautan langsung ke clipboard disertai notifikasi toast.
   - **Ubah Nama (Rename)**: Edit nama folder maupun file dengan mudah.
   - **Hapus Item**: Hapus folder atau file dengan dialog konfirmasi keamanan untuk mencegah kesalahan.
   - **Tombol Refresh**: Memuat ulang data file dan folder secara instan.
   - **Indikator Jumlah Item**: Menampilkan jumlah item pada setiap folder dan total item di bagian bawah (`Showing X items`).

3. **Keamanan & Autentikasi Admin**:
   - Pengunjung umum (*GuestUser*) dapat melihat isi folder, mengunduh file, mencari, dan menyalin tautan unduhan.
   - Pengelolaan file (Unggah, Buat Folder, Ubah Nama, dan Hapus) dilindungi oleh password Admin.
   - Password default: `hanswy2026` (dapat diubah melalui environment variable `ADMIN_PASSWORD`).

4. **Penyimpanan Persisten (Vercel & Supabase)**:
   - Dirancang untuk deploy ke Vercel tanpa khawatir file hilang saat redeploy.
   - Mendukung integrasi langsung dengan **Supabase Storage** (file) dan **Supabase Database** (metadata folder & file).
   - Tersedia mode fallback lokal otomatis saat masa pengujian/development.

---

## 🛠️ Panduan Menghubungkan Supabase Storage (Untuk Online 24 Jam di Vercel)

1. Buka dashboard [Supabase](https://supabase.com) dan buat proyek baru (misalnya `file-hanswy`).
2. Masuk ke menu **SQL Editor** di Supabase, lalu salin dan jalankan isi file `supabase-schema.sql` yang ada di proyek ini.
3. Masuk ke menu **Storage** di Supabase:
   - Klik **New Bucket**
   - Beri nama bucket: `file-hanswy`
   - Aktifkan opsi **Public bucket** menjadi **ON**
   - Simpan bucket.
4. Masuk ke **Project Settings -> API** untuk mengambil kredensial:
   - `Project URL`
   - `anon public key`
   - `service_role secret key`
5. Masukkan ke file `.env.local` (atau Environment Variables di Vercel):
   ```env
   ADMIN_PASSWORD=hanswy2026
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SUPABASE_STORAGE_BUCKET=file-hanswy
   ```

---

## 🌐 Panduan Deployment ke Vercel

1. Push proyek ini ke repository GitHub Anda:
   ```bash
   git init
   git add .
   git commit -m "Initial commit File HansWY"
   git branch -M main
   git remote add origin <url-repository-github-anda>
   git push -u origin main
   ```
2. Buka dashboard [Vercel](https://vercel.com) dan klik **Add New Project**.
3. Import repository GitHub **File HansWY**.
4. Di bagian **Environment Variables**, tambahkan:
   - `ADMIN_PASSWORD` : password login admin Anda
   - `NEXT_PUBLIC_SUPABASE_URL` : URL project Supabase Anda
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` : Anon key Supabase Anda
   - `SUPABASE_SERVICE_ROLE_KEY` : Service role key Supabase Anda
   - `SUPABASE_STORAGE_BUCKET` : `file-hanswy`
5. Klik **Deploy**. Website akan aktif online 24 jam dengan URL domain Vercel Anda.

---

## 💻 Menjalankan di Lokal (Development)

```bash
# Menjalankan server development
npm run dev

# Membangun versi produksi
npm run build

# Menjalankan server produksi lokal
npm run start
```
Buka browser di `http://localhost:3000` (atau port yang tertera di terminal).
