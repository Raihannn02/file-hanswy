import { NextRequest, NextResponse } from 'next/server';
import {
  getFolderContents,
  createFolder,
  renameFolder,
  deleteFolder,
  toggleHideFolder,
} from '@/lib/storage-engine';
import { isAdminAuthenticated } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId');
    const isAdmin = isAdminAuthenticated(req);
    const contents = await getFolderContents(folderId, isAdmin);
    return NextResponse.json({ success: true, data: contents });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isAdminAuthenticated(req)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin untuk membuat folder.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, parentId } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Nama folder tidak boleh kosong.' },
        { status: 400 }
      );
    }

    const folder = await createFolder(name, parentId || null);
    return NextResponse.json({ success: true, data: folder });
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
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin untuk mengubah folder.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const folderId = (body.folderId || body.id) as string;

    // Support toggle is_hidden
    if (typeof body.is_hidden === 'boolean') {
      if (!folderId) {
        return NextResponse.json(
          { success: false, error: 'Parameter folderId wajib diisi.' },
          { status: 400 }
        );
      }
      const updated = await toggleHideFolder(folderId, body.is_hidden);
      return NextResponse.json({ success: true, data: updated });
    }

    const name = body.name as string;

    if (!folderId || !name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Parameter folderId dan name wajib diisi.' },
        { status: 400 }
      );
    }

    const updated = await renameFolder(folderId, name);
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
        { success: false, error: 'Akses ditolak: Anda harus login sebagai Admin untuk menghapus folder.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    let folderId = searchParams.get('folderId') || searchParams.get('id');

    if (!folderId) {
      try {
        const body = await req.json();
        folderId = (body.folderId || body.id) as string;
      } catch {
        // query param was empty and no json body
      }
    }

    if (!folderId) {
      return NextResponse.json(
        { success: false, error: 'Parameter folderId wajib diisi.' },
        { status: 400 }
      );
    }

    await deleteFolder(folderId);
    return NextResponse.json({ success: true, message: 'Folder berhasil dihapus.' });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
