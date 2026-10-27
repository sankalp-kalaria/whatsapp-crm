import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';
import {
  testDriveConnection,
  ensureDriveFolder,
  getValidAccessToken,
} from '@/lib/google-drive/client';
import type { GoogleDriveConfig } from '@/types';

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent');

    const { data: config, error } = await supabase
      .from('google_drive_configs')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!config) {
      return NextResponse.json({ config: null });
    }

    // Mask secret and tokens for security
    const masked: Partial<GoogleDriveConfig> = {
      ...config,
      client_secret: config.client_secret ? '••••••••••••••••' : null,
      refresh_token: config.refresh_token ? '••••••••••••••••' : null,
      access_token: config.access_token ? '••••••••••••••••' : null,
    };

    return NextResponse.json({ config: masked });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, accountId } = await requireRole('admin');
    const body = await req.json();

    const {
      client_id,
      client_secret,
      refresh_token,
      access_token,
      root_folder_name = 'WACRM Properties',
      api_key,
    } = body;

    // Fetch existing config to retain secrets if masked or unchanged
    const { data: existing } = await supabase
      .from('google_drive_configs')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    const resolvedClientSecret =
      client_secret && !client_secret.includes('••••')
        ? client_secret
        : existing?.client_secret;

    const resolvedRefreshToken =
      refresh_token && !refresh_token.includes('••••')
        ? refresh_token
        : existing?.refresh_token;

    const resolvedAccessToken =
      access_token && !access_token.includes('••••')
        ? access_token
        : existing?.access_token;

    const payload: Partial<GoogleDriveConfig> = {
      account_id: accountId,
      client_id: client_id || existing?.client_id || null,
      client_secret: resolvedClientSecret || null,
      refresh_token: resolvedRefreshToken || null,
      access_token: resolvedAccessToken || null,
      root_folder_name: root_folder_name || 'WACRM Properties',
      api_key: api_key || existing?.api_key || null,
    };

    let connectedEmail: string | null = null;
    let isConnected = false;
    let rootFolderId: string | null = existing?.root_folder_id || null;

    // Try testing connection if token or refresh_token is provided
    try {
      const token = await getValidAccessToken(
        payload as GoogleDriveConfig,
        async (newToken, newExpiresAt) => {
          payload.access_token = newToken;
          payload.access_token_expires_at = newExpiresAt.toISOString();
        }
      );

      if (token) {
        const info = await testDriveConnection(token);
        connectedEmail = info.email;
        isConnected = true;

        // Ensure Root Folder exists
        const rootFolder = await ensureDriveFolder(
          token,
          payload.root_folder_name || 'WACRM Properties'
        );
        rootFolderId = rootFolder.folderId;
      }
    } catch (testErr) {
      console.warn('Google Drive connection test error:', testErr);
      // Still allow saving credentials so user can troubleshoot
    }

    payload.is_connected = isConnected;
    payload.connected_email = connectedEmail || existing?.connected_email || null;
    payload.root_folder_id = rootFolderId;
    payload.updated_at = new Date().toISOString();

    const { data: saved, error } = await supabase
      .from('google_drive_configs')
      .upsert(payload, { onConflict: 'account_id' })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      config: {
        ...saved,
        client_secret: saved.client_secret ? '••••••••••••••••' : null,
        refresh_token: saved.refresh_token ? '••••••••••••••••' : null,
        access_token: saved.access_token ? '••••••••••••••••' : null,
      },
      isConnected,
      connectedEmail,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const { supabase, accountId } = await requireRole('admin');

    const { error } = await supabase
      .from('google_drive_configs')
      .delete()
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
