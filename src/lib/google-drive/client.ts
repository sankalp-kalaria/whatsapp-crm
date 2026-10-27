import type { GoogleDriveConfig } from '@/types';

export interface DriveFolderResult {
  folderId: string;
  folderUrl: string;
}

export interface DriveUploadResult {
  fileId: string;
  name: string;
  webViewLink: string;
  webContentLink?: string;
  thumbnailLink?: string;
  mimeType: string;
  size?: number;
}

/**
 * Refreshes an expired Google Drive access token using the stored refresh_token.
 */
export async function refreshGoogleToken(config: GoogleDriveConfig): Promise<{
  accessToken: string;
  expiresIn: number;
} | null> {
  if (!config.refresh_token || !config.client_id || !config.client_secret) {
    return null;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Google token refresh failed:', errorText);
    return null;
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Gets a valid access token, auto-refreshing if expired.
 */
export async function getValidAccessToken(
  config: GoogleDriveConfig,
  onRefreshed?: (newToken: string, expiresAt: Date) => Promise<void>
): Promise<string | null> {
  const now = new Date();
  const expiresAt = config.access_token_expires_at
    ? new Date(config.access_token_expires_at)
    : null;

  // If token is still valid for > 2 minutes
  if (config.access_token && expiresAt && expiresAt.getTime() - now.getTime() > 120000) {
    return config.access_token;
  }

  // Token expired or not set, refresh it
  const refresh = await refreshGoogleToken(config);
  if (!refresh) {
    return config.access_token || null;
  }

  const newExpiresAt = new Date(Date.now() + refresh.expiresIn * 1000);
  if (onRefreshed) {
    await onRefreshed(refresh.accessToken, newExpiresAt);
  }

  return refresh.accessToken;
}

/**
 * Tests Google Drive credentials and returns account user info.
 */
export async function testDriveConnection(accessToken: string): Promise<{
  email: string;
  displayName: string;
  storageQuota?: { limit?: string; usage?: string };
}> {
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/about?fields=user,storageQuota',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Drive API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    email: data.user?.emailAddress || 'Unknown',
    displayName: data.user?.displayName || 'Connected Account',
    storageQuota: data.storageQuota,
  };
}

/**
 * Checks if a folder exists by name (under optional parent); creates it if not.
 */
export async function ensureDriveFolder(
  accessToken: string,
  folderName: string,
  parentFolderId?: string | null
): Promise<DriveFolderResult> {
  const sanitizedName = folderName.replace(/'/g, "\\'");
  let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${sanitizedName}' and trashed = false`;
  if (parentFolderId) {
    query += ` and '${parentFolderId}' in parents`;
  }

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      const existing = data.files[0];
      return {
        folderId: existing.id,
        folderUrl: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
      };
    }
  }

  // Folder doesn't exist, create it
  const body: Record<string, unknown> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentFolderId) {
    body.parents = [parentFolderId];
  }

  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Failed to create Google Drive folder: ${err}`);
  }

  const newFolder = await createRes.json();

  // Try making folder readable by link
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${newFolder.id}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      }
    );
  } catch (permErr) {
    // Non-fatal if organization restricts public sharing
    console.warn('Could not set public permissions on Drive folder:', permErr);
  }

  return {
    folderId: newFolder.id,
    folderUrl: newFolder.webViewLink || `https://drive.google.com/drive/folders/${newFolder.id}`,
  };
}

/**
 * Uploads a file (image, video, document) into a specific Google Drive folder.
 */
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<DriveUploadResult> {
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  const multipartRequestBody = Buffer.concat([
    Buffer.from(
      delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\n\r\n`
    ),
    fileBuffer,
    Buffer.from(closeDelimiter),
  ]);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink,thumbnailLink,mimeType,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Failed to upload file to Google Drive: ${err}`);
  }

  const uploaded = await uploadRes.json();

  // Set file viewable with link for thumbnail/preview
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${uploaded.id}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      }
    );
  } catch {
    // Non-fatal
  }

  return {
    fileId: uploaded.id,
    name: uploaded.name || fileName,
    webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
    webContentLink: uploaded.webContentLink,
    thumbnailLink: uploaded.thumbnailLink,
    mimeType: uploaded.mimeType || mimeType,
    size: uploaded.size ? Number(uploaded.size) : fileBuffer.length,
  };
}
