import { NextRequest, NextResponse } from 'next/server';
import { uploadFileRecord, renameFile, deleteFile, toggleHideFile } from '@/lib/storage-engine';
import { isAdminAuthenticated } from '@/lib/auth';

// Increase max duration for large file uploads on Vercel
export const maxDuration = 60;

// Helper to safely return JSON responses even on error
function safeJson(data: object, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated(req)) {
      return safeJson(
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin untuk mengunggah file.' },
        403
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (formErr) {
      return safeJson(
        { success: false, error: `Gagal membaca form data: ${(formErr as Error).message}. Pastikan ukuran file tidak melebihi batas.` },
        400
      );
    }

    const file = formData.get('file') as File | null;
    const folderId = (formData.get('folderId') as string) || null;

    if (!file) {
      return safeJson(
        { success: false, error: 'Tidak ada file yang dipilih untuk diunggah.' },
        400
      );
    }

    // Limit check (100MB)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return safeJson(
        { success: false, error: `Ukuran file "${file.name}" (${(file.size / 1024 / 1024).toFixed(1)} MB) melebihi batas maksimal 100 MB.` },
        400
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const fileRecord = await uploadFileRecord({
      name: file.name,
      folderId,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      buffer,
    });

    return safeJson({
      success: true,
      message: `File "${file.name}" berhasil diunggah.`,
      data: fileRecord,
    });
  } catch (err) {
    const message = (err as Error).message || 'Terjadi kesalahan saat mengunggah file.';
    console.error('[POST /api/files] Error:', message);
    return safeJson({ success: false, error: message }, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!isAdminAuthenticated(req)) {
      return safeJson(
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin untuk mengubah file.' },
        403
      );
    }

    let body: { fileId?: string; id?: string; name?: string; is_hidden?: boolean };
    try {
      body = await req.json();
    } catch {
      return safeJson({ success: false, error: 'Request body harus berformat JSON yang valid.' }, 400);
    }

    const fileId = body.fileId || body.id;

    // Support toggle is_hidden
    if (typeof body.is_hidden === 'boolean') {
      if (!fileId) {
        return safeJson({ success: false, error: 'Parameter fileId wajib diisi.' }, 400);
      }
      const updated = await toggleHideFile(fileId, body.is_hidden);
      return safeJson({ success: true, data: updated });
    }

    const name = body.name;

    if (!fileId || !name || !name.trim()) {
      return safeJson(
        { success: false, error: 'Parameter fileId dan name wajib diisi.' },
        400
      );
    }

    const updated = await renameFile(fileId, name);
    return safeJson({ success: true, data: updated });
  } catch (err) {
    return safeJson({ success: false, error: (err as Error).message }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!isAdminAuthenticated(req)) {
      return safeJson(
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin untuk menghapus file.' },
        403
      );
    }

    const { searchParams } = new URL(req.url);
    let fileId = searchParams.get('fileId') || searchParams.get('id');

    if (!fileId) {
      try {
        const body = await req.json();
        fileId = body.fileId || body.id;
      } catch {
        // query param was empty and no json body
      }
    }

    if (!fileId) {
      return safeJson(
        { success: false, error: 'Parameter fileId wajib diisi.' },
        400
      );
    }

    await deleteFile(fileId);
    return safeJson({ success: true, message: 'File berhasil dihapus.' });
  } catch (err) {
    return safeJson({ success: false, error: (err as Error).message }, 500);
  }
}
