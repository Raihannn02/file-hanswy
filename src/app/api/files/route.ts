import { NextRequest, NextResponse } from 'next/server';
import { uploadFileRecord, renameFile, deleteFile } from '@/lib/storage-engine';
import { isAdminAuthenticated } from '@/lib/auth';

// 100MB file size limit for server processing
export const maxDuration = 60; // 60 seconds on Vercel Pro/serverless

export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated(req)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin untuk mengunggah file.' },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folderId = (formData.get('folderId') as string) || null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Tidak ada file yang dipilih untuk diunggah.' },
        { status: 400 }
      );
    }

    // Limit check (e.g. 100MB)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: 'Ukuran file melebihi batas maksimal 100 MB.' },
        { status: 400 }
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

    return NextResponse.json({
      success: true,
      message: 'File berhasil diunggah.',
      data: fileRecord,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!isAdminAuthenticated(req)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin untuk mengubah file.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { fileId, name } = body;

    if (!fileId || !name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Parameter fileId dan name wajib diisi.' },
        { status: 400 }
      );
    }

    const updated = await renameFile(fileId, name);
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!isAdminAuthenticated(req)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin untuk menghapus file.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('fileId');

    if (!fileId) {
      return NextResponse.json(
        { success: false, error: 'Parameter fileId wajib diisi.' },
        { status: 400 }
      );
    }

    await deleteFile(fileId);
    return NextResponse.json({ success: true, message: 'File berhasil dihapus.' });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
