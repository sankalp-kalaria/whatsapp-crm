'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  FolderSync,
  Key,
  Shield,
  Trash2,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';
import type { GoogleDriveConfig } from '@/types';

export function GoogleDriveSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [config, setConfig] = useState<GoogleDriveConfig | null>(null);

  // Form fields
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [rootFolderName, setRootFolderName] = useState('WACRM Properties');

  async function fetchConfig() {
    setLoading(true);
    try {
      const res = await fetch('/api/google-drive/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(data.config);
          setClientId(data.config.client_id || '');
          setClientSecret(data.config.client_secret || '');
          setRefreshToken(data.config.refresh_token || '');
          setAccessToken(data.config.access_token || '');
          setRootFolderName(data.config.root_folder_name || 'WACRM Properties');
        }
      }
    } catch {
      toast.error('Failed to load Google Drive configuration');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchConfig();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/google-drive/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId.trim() || null,
          client_secret: clientSecret.trim() || null,
          refresh_token: refreshToken.trim() || null,
          access_token: accessToken.trim() || null,
          root_folder_name: rootFolderName.trim() || 'WACRM Properties',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save configuration');
      }

      setConfig(data.config);
      if (data.isConnected) {
        toast.success(
          `Connected to Google Drive (${data.connectedEmail || 'Account active'})`
        );
      } else {
        toast.success(
          'Settings saved. Please provide valid tokens or client credentials to connect.'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save error';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch('/api/google-drive/config', {
        method: 'DELETE',
      });
      if (res.ok) {
        setConfig(null);
        setClientId('');
        setClientSecret('');
        setRefreshToken('');
        setAccessToken('');
        toast.success('Google Drive disconnected');
      }
    } catch {
      toast.error('Failed to disconnect Google Drive');
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Google Drive Integration"
        description="Connect your Google Drive account so all property photos, videos, and documents are automatically organized and stored inside dedicated folders."
      />

      {/* Connection Status Card */}
      <Card className="border-border bg-card">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  config?.is_connected
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                <HardDrive className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-foreground">
                    Google Drive Status:
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      config?.is_connected
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    {config?.is_connected ? (
                      <>
                        <CheckCircle2 className="size-3" />
                        Connected
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="size-3" />
                        Disconnected
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {config?.is_connected
                    ? `Connected Account: ${config.connected_email || 'Active'} • Root Folder: "${config.root_folder_name}"`
                    : 'Configure your Google Drive credentials below to enable cloud drive file uploads for property listings.'}
                </p>
              </div>
            </div>

            {config?.is_connected && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                {disconnecting ? (
                  <Loader2 className="size-3 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="size-3 mr-1" />
                )}
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Configuration Form */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderSync className="size-4 text-primary" />
            Drive Storage &amp; Credentials
          </CardTitle>
          <CardDescription className="text-xs">
            Enter your Google OAuth Client ID, Secret, and Refresh Token or Access Token.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Root Folder Name</Label>
              <Input
                value={rootFolderName}
                onChange={(e) => setRootFolderName(e.target.value)}
                placeholder="e.g. WACRM Properties"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                All property folders (e.g. &ldquo;Sunrise Heights Flat 402&rdquo;) will be created under this root folder in your Drive.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Key className="size-3 text-muted-foreground" />
                  Google Client ID
                </Label>
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Shield className="size-3 text-muted-foreground" />
                  Google Client Secret
                </Label>
                <Input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="••••••••••••••••"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Refresh Token (Recommended for persistent access)
                </Label>
                <Input
                  type="password"
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  placeholder="••••••••••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Direct Access Token (Bearer)
                </Label>
                <Input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="••••••••••••••••"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4 mr-2" />
                )}
                Save &amp; Test Connection
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Guide Card */}
      <Card className="border-border bg-card/60">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Info className="size-4 text-primary" />
            How to get Google Drive API Credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
            <li>
              Open the{' '}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                Google Cloud Console
                <ExternalLink className="size-3" />
              </a>{' '}
              and create or select a project.
            </li>
            <li>
              Navigate to <strong>APIs &amp; Services</strong> &rarr; <strong>Library</strong> and enable{' '}
              <strong>Google Drive API</strong>.
            </li>
            <li>
              Under <strong>APIs &amp; Services</strong> &rarr; <strong>Credentials</strong>, click{' '}
              <strong>Create Credentials</strong> &rarr; <strong>OAuth client ID</strong>.
            </li>
            <li>
              Select application type (Web or Desktop), configure authorized redirect URIs, and copy your{' '}
              <strong>Client ID</strong> and <strong>Client Secret</strong>.
            </li>
            <li>
              Paste the keys above and click <strong>Save &amp; Test Connection</strong>.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
