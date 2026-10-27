import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import {
  getValidAccessToken,
  ensureDriveFolder,
  uploadFileToDrive,
} from '@/lib/google-drive/client';
import type { GoogleDriveConfig, PropertyMediaItem } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const { supabase, accountId } = await requireRole('agent');

    const formData = await req.formData();
    const propertyName = (formData.get('propertyName') as string) || 'Untitled Property';
    const rawFiles = formData.getAll('files') as File[];

    if (!rawFiles || rawFiles.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // 1. Check if Google Drive is connected for this account
    const { data: driveConfig } = await supabase
      .from('google_drive_configs')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    let driveFolderId: string | null = null;
    let driveFolderUrl: string | null = null;
    let accessToken: string | null = null;

    if (driveConfig?.is_connected) {
      try {
        accessToken = await getValidAccessToken(
          driveConfig as GoogleDriveConfig,
          async (newToken, newExpiresAt) => {
            await supabase
              .from('google_drive_configs')
              .update({
                access_token: newToken,
                access_token_expires_at: newExpiresAt.toISOString(),
              })
              .eq('account_id', accountId);
          }
        );

        if (accessToken) {
          // Check if property folder exists under rootFolderId; if not, create it
          const folderResult = await ensureDriveFolder(
            accessToken,
            propertyName,
            driveConfig.root_folder_id || null
          );
          driveFolderId = folderResult.folderId;
          driveFolderUrl = folderResult.folderUrl;
        }
      } catch (driveErr) {
        console.error('Google Drive folder resolution error:', driveErr);
      }
    }

    const uploadedMedia: PropertyMediaItem[] = [];

    // 2. Upload each file
    for (const file of rawFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = file.name || `media_${Date.now()}`;
      const mimeType = file.type || 'application/octet-stream';
      const isVideo = mimeType.startsWith('video/');
      const isImage = mimeType.startsWith('image/');
      const type: 'image' | 'video' | 'document' = isVideo
        ? 'video'
        : isImage
        ? 'image'
        : 'document';

      if (accessToken && driveFolderId) {
        // Upload to Google Drive folder
        try {
          const driveResult = await uploadFileToDrive(
            accessToken,
            driveFolderId,
            buffer,
            fileName,
            mimeType
          );

          uploadedMedia.push({
            id: driveResult.fileId,
            name: fileName,
            type,
            url: driveResult.webViewLink,
            thumbnail: driveResult.thumbnailLink || driveResult.webContentLink,
            driveFileId: driveResult.fileId,
            size: driveResult.size,
          });
          continue;
        } catch (uploadErr) {
          console.error('Failed uploading to Google Drive, falling back to storage:', uploadErr);
        }
      }

      // Fallback: Upload to Supabase Storage 'property-media'
      const storagePath = `${accountId}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { data: storageUpload, error: storageErr } = await supabase.storage
        .from('property-media')
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true,
        });

      if (!storageErr && storageUpload) {
        const { data: publicUrlData } = supabase.storage
          .from('property-media')
          .getPublicUrl(storageUpload.path);

        uploadedMedia.push({
          id: storageUpload.path,
          name: fileName,
          type,
          url: publicUrlData.publicUrl,
          thumbnail: isImage ? publicUrlData.publicUrl : undefined,
          size: buffer.length,
        });
      } else {
        console.error('Storage upload error:', storageErr);
      }
    }

    return NextResponse.json({
      success: true,
      media: uploadedMedia,
      folderId: driveFolderId,
      folderUrl: driveFolderUrl,
      storageUsed: driveFolderId ? 'google_drive' : 'supabase_storage',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
