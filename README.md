# File HansWY - Cloud Storage & File Manager

Website penyimpanan dan pengelolaan file 24 jam berbasis Next.js & Vercel dengan tema merah, hitam, dan abu-abu modern.

---

## 🚀 Fitur Utama
1. **Desain & Tampilan Modern**:
   - Sidebar navigasi dengan identitas **File HansWY**, indikator user, dan badge `POWERED BY HANSWY`.
   - Pola latar belakang dot-grid dengan tema warna merah (`#e62831`), hitam (`#0a0b0e`), dan abu-abu.
   - Desain sepenuhnya responsif untuk desktop, tablet, dan smartphone.

2. **Pengelolaan Folder & File Lengkap**:
   - **Buat Folder Baru**: Mendukung struktur folder bertingkat (subfolder).
   - **Buka Folder**: Navigasi lancar masuk dan keluar folder.
   - **Navigasi Breadcrumb**: `Root > FOLDER > SUBFOLDER` yang dapat diklik untuk kembali ke level sebelumnya.
   - **Tombol Kembali**: Mudah kembali satu level ke atas.
   - **Unggah File**: Mendukung semua jenis format file hingga 2GB per file melalui GitHub Release Assets tanpa batasan bandwidth egress.
   - **Unduh File**: Tombol unduh hijau terang dengan tautan unduhan langsung.
   - **Salin Tautan Langsung (Copy Link)**: Tombol salin tautan langsung ke clipboard disertai notifikasi toast.
   - **Ubah Nama (Rename)**: Edit nama folder maupun file dengan mudah.
   - **Hapus Item**: Hapus folder atau file dengan dialog konfirmasi keamanan.
   - **Tombol Refresh**: Memuat ulang data file dan folder secara instan.
   - **Indikator Jumlah Item**: Menampilkan jumlah item pada setiap folder dan total item di bagian bawah (`Showing X items`).

3. **Keamanan & Autentikasi Admin Terenkripsi**:
   - Pengunjung umum (*GuestUser*) dapat melihat isi folder, mengunduh file, mencari, dan menyalin tautan unduhan.
   - Pengelolaan file (Unggah, Buat Folder, Ubah Nama, dan Hapus) dilindungi oleh password Admin.
   - Password disimpan dalam bentuk **terenkripsi (Scrypt Hash dengan salt kriptografis)** untuk keamanan tingkat tinggi.
   - Dilengkapi *timing-safe verification* dan *cryptographic HMAC signed session token*.
   - Environment variable: `ADMIN_PASSWORD_HASH` (atau `ADMIN_PASSWORD`).

4. **Penyimpanan Cloud (GitHub Releases API)**:
   - File dan metadata disimpan menggunakan GitHub Releases API (`storage-metadata` & `storage-files`).
   - Tidak ada batasan egress quota seperti di Supabase Free Tier.
   - Ukuran per file hingga **2 GB**.
   - Mode fallback lokal otomatis saat masa pengujian/development tanpa token.

---

## 🛠️ Panduan Konfigurasi GitHub Storage

1. Buka [GitHub Tokens](https://github.com/settings/tokens?type=beta) (Fine-grained personal access tokens) atau [Classic Tokens](https://github.com/settings/tokens).
2. Buat token baru:
   - Pilih repository: **`Raihannn02/file-hanswy`** (atau `All repositories`)
   - Beri izin (Permissions):
     - **Repository permissions** -> **Contents**: `Read and write`
3. Salin token yang dihasilkan (format: `github_pat_...` atau `ghp_...`).
4. Masukkan ke file `.env.local` (atau Environment Variables di Vercel):
   ```env
   ADMIN_PASSWORD=hanswy2026
   GITHUB_TOKEN=ghp_your_token_here
   NEXT_PUBLIC_GITHUB_TOKEN=ghp_your_token_here
   GITHUB_OWNER=Raihannn02
   NEXT_PUBLIC_GITHUB_OWNER=Raihannn02
   GITHUB_REPO=file-hanswy
   NEXT_PUBLIC_GITHUB_REPO=file-hanswy
   ```

---

## 🌐 Panduan Deployment ke Vercel

1. Buka dashboard [Vercel](https://vercel.com) pada project **file-hanswy**.
2. Masuk ke **Settings -> Environment Variables**, lalu tambahkan:
   - `ADMIN_PASSWORD` : password admin Anda
   - `GITHUB_TOKEN` : Personal Access Token GitHub Anda
   - `NEXT_PUBLIC_GITHUB_TOKEN` : Personal Access Token GitHub Anda
   - `GITHUB_OWNER` : `Raihannn02`
   - `NEXT_PUBLIC_GITHUB_OWNER` : `Raihannn02`
   - `GITHUB_REPO` : `file-hanswy`
   - `NEXT_PUBLIC_GITHUB_REPO` : `file-hanswy`
3. Lakukan **Redeploy**. Website Anda kini terbebas dari kuota egress Supabase!

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
Buka browser di `http://localhost:3000`.
