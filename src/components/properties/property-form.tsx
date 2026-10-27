'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Building,
  Upload,
  Image as ImageIcon,
  Video,
  FileText,
  X,
  ExternalLink,
  HardDrive,
  Landmark,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import type {
  Property,
  PropertyStatus,
  PropertyListingType,
  PropertyInterestStatus,
  PropertyMediaItem,
  Investor,
  Client,
} from '@/types';
import { useAuth } from '@/hooks/use-auth';

interface PropertyFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property?: Property | null;
  onSaved: () => void;
}

export function PropertyForm({
  open,
  onOpenChange,
  property,
  onSaved,
}: PropertyFormProps) {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reference data
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Form Fields
  const [title, setTitle] = useState('');
  const [propertyType, setPropertyType] = useState('flat');
  const [listingType, setListingType] = useState<PropertyListingType>('rent');
  const [status, setStatus] = useState<PropertyStatus>('interested');
  const [interestStatus, setInterestStatus] = useState<PropertyInterestStatus>('interested');
  const [price, setPrice] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [areaSqft, setAreaSqft] = useState('');
  const [investorId, setInvestorId] = useState<string>('none');
  const [clientId, setClientId] = useState<string>('none');
  const [description, setDescription] = useState('');

  // Media & Google Drive Folder
  const [mediaUrls, setMediaUrls] = useState<PropertyMediaItem[]>([]);
  const [googleDriveFolderId, setGoogleDriveFolderId] = useState<string | null>(null);
  const [googleDriveFolderUrl, setGoogleDriveFolderUrl] = useState<string | null>(null);

  // Load investors and clients
  useEffect(() => {
    if (!open || !accountId) return;
    async function loadRefs() {
      const { data: invs } = await supabase
        .from('investors')
        .select('*')
        .eq('account_id', accountId)
        .order('name');
      setInvestors((invs as Investor[]) || []);

      const { data: cls } = await supabase
        .from('clients')
        .select('*')
        .eq('account_id', accountId)
        .order('name');
      setClients((cls as Client[]) || []);
    }
    loadRefs();
  }, [open, accountId, supabase]);

  useEffect(() => {
    if (property) {
      setTitle(property.title || '');
      setPropertyType(property.property_type || 'flat');
      setListingType(property.listing_type || 'rent');
      setStatus(property.status || 'interested');
      setInterestStatus(property.interest_status || 'interested');
      setPrice(property.price ? String(property.price) : '');
      setAddress(property.address || '');
      setCity(property.city || '');
      setBedrooms(property.bedrooms ? String(property.bedrooms) : '');
      setBathrooms(property.bathrooms ? String(property.bathrooms) : '');
      setAreaSqft(property.area_sqft ? String(property.area_sqft) : '');
      setInvestorId(property.investor_id || 'none');
      setClientId(property.client_id || 'none');
      setDescription(property.description || '');
      setMediaUrls(property.media_urls || []);
      setGoogleDriveFolderId(property.google_drive_folder_id || null);
      setGoogleDriveFolderUrl(property.google_drive_folder_url || null);
    } else {
      setTitle('');
      setPropertyType('flat');
      setListingType('rent');
      setStatus('interested');
      setInterestStatus('interested');
      setPrice('');
      setAddress('');
      setCity('');
      setBedrooms('');
      setBathrooms('');
      setAreaSqft('');
      setInvestorId('none');
      setClientId('none');
      setDescription('');
      setMediaUrls([]);
      setGoogleDriveFolderId(null);
      setGoogleDriveFolderUrl(null);
    }
  }, [property, open]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!title.trim()) {
      toast.error('Please enter a Property Name/Title first so a dedicated folder can be created.');
      return;
    }

    setUploadingMedia(true);
    const formData = new FormData();
    formData.append('propertyName', title.trim());
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });

    try {
      const res = await fetch('/api/properties/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload media');
      }

      if (data.media && data.media.length > 0) {
        setMediaUrls((prev) => [...prev, ...data.media]);
        if (data.folderId) setGoogleDriveFolderId(data.folderId);
        if (data.folderUrl) setGoogleDriveFolderUrl(data.folderUrl);

        if (data.storageUsed === 'google_drive') {
          toast.success(
            `Uploaded ${data.media.length} files to Google Drive folder: "${title}"`
          );
        } else {
          toast.success(
            `Uploaded ${data.media.length} files. (Connect Google Drive in Settings for automatic cloud drive sync)`
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeMedia(index: number) {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Property title is required');
      return;
    }
    if (!accountId) {
      toast.error('Account not loaded');
      return;
    }

    setSaving(true);

    const payload = {
      account_id: accountId,
      title: title.trim(),
      property_type: propertyType,
      listing_type: listingType,
      status,
      interest_status: interestStatus,
      price: price ? parseFloat(price) : null,
      address: address.trim() || null,
      city: city.trim() || null,
      bedrooms: bedrooms ? parseInt(bedrooms) : null,
      bathrooms: bathrooms ? parseInt(bathrooms) : null,
      area_sqft: areaSqft ? parseFloat(areaSqft) : null,
      investor_id: investorId && investorId !== 'none' ? investorId : null,
      client_id: clientId && clientId !== 'none' ? clientId : null,
      description: description.trim() || null,
      media_urls: mediaUrls,
      google_drive_folder_id: googleDriveFolderId,
      google_drive_folder_url: googleDriveFolderUrl,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (property) {
      const res = await supabase
        .from('properties')
        .update(payload)
        .eq('id', property.id);
      error = res.error;
    } else {
      const res = await supabase.from('properties').insert(payload);
      error = res.error;
    }

    setSaving(false);

    if (error) {
      toast.error(`Failed to save property: ${error.message}`);
    } else {
      toast.success(property ? 'Property updated successfully' : 'Property added successfully');
      onOpenChange(false);
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Building className="size-5 text-primary" />
            {property ? 'Edit Property Details' : 'Add New Property Listing'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Save property specifications, interest status, videos, and images with automatic Google Drive sync.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-2">
          {/* Title & Type */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-medium">
                Property Name / Title <span className="text-destructive">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Skyline Residency 3BHK Flat 402"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                This name is used as the folder name in Google Drive for all uploaded media.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Property Type</Label>
              <Select
                value={propertyType}
                onValueChange={(val) => {
                  if (val) setPropertyType(val);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat</SelectItem>
                  <SelectItem value="apartment">Apartment</SelectItem>
                  <SelectItem value="villa">Villa / Bungalow</SelectItem>
                  <SelectItem value="commercial">Commercial Space</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="shop">Shop</SelectItem>
                  <SelectItem value="plot">Plot / Land</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Listing & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Listing Type</Label>
              <Select
                value={listingType}
                onValueChange={(val) => {
                  if (val) setListingType(val as PropertyListingType);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rent">For Rent</SelectItem>
                  <SelectItem value="sell">For Sale</SelectItem>
                  <SelectItem value="buy">Looking to Buy</SelectItem>
                  <SelectItem value="lease">Lease</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Current Status</Label>
              <Select
                value={status}
                onValueChange={(val) => {
                  if (val) setStatus(val as PropertyStatus);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                  <SelectItem value="already_visited">Already Visited</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="under_negotiation">Under Negotiation</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="rented">Rented</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Interest Status</Label>
              <Select
                value={interestStatus}
                onValueChange={(val) => {
                  if (val) setInterestStatus(val as PropertyInterestStatus);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                  <SelectItem value="already_visited">Already Visited</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Pricing & Dimensions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Price / Rent (₹)</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 35000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Bedrooms (BHK)</Label>
              <Input
                type="number"
                value={bedrooms}
                onChange={(e) => setBedrooms(e.target.value)}
                placeholder="e.g. 3"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Bathrooms</Label>
              <Input
                type="number"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                placeholder="e.g. 3"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Area (Sq. Ft.)</Label>
              <Input
                type="number"
                value={areaSqft}
                onChange={(e) => setAreaSqft(e.target.value)}
                placeholder="e.g. 1550"
              />
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-medium">Address / Location</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Near Iscon Cross Road, SG Highway"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">City</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Ahmedabad"
              />
            </div>
          </div>

          {/* Linked Parties: Investor (Owner) & Client */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
            <div className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Landmark className="size-4 text-primary" />
              Party Relationships
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Linked Investor (Flat Owner)</Label>
                <Select
                  value={investorId}
                  onValueChange={(val) => {
                    if (val) setInvestorId(val);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Owner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None / Independent</SelectItem>
                    {investors.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.name} ({inv.purchase_flat_details || inv.phone})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Interested / Linked Client</Label>
                <Select
                  value={clientId}
                  onValueChange={(val) => {
                    if (val) setClientId(val);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None / Open</SelectItem>
                    {clients.map((cl) => (
                      <SelectItem key={cl.id} value={cl.id}>
                        {cl.name} ({cl.phone})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Media & Google Drive Upload */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <HardDrive className="size-4 text-primary" />
                Property Photos &amp; Videos (Google Drive Sync)
              </div>
              {googleDriveFolderUrl && (
                <a
                  href={googleDriveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                >
                  <ExternalLink className="size-3" />
                  Open in Google Drive Folder
                </a>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              Files are automatically uploaded into your Google Drive inside a folder named &ldquo;{title || 'Property Name'}&rdquo;. If the folder exists, files are added to it; if not, a new folder is created.
            </p>

            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/*,video/*,application/pdf"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploadingMedia}
                onClick={() => fileInputRef.current?.click()}
                className="border-dashed border-primary/50 text-foreground"
              >
                {uploadingMedia ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin text-primary" />
                ) : (
                  <Upload className="size-4 mr-1.5 text-primary" />
                )}
                {uploadingMedia ? 'Uploading to Drive...' : 'Upload Images & Videos'}
              </Button>
              <span className="text-xs text-muted-foreground">
                {mediaUrls.length} file{mediaUrls.length === 1 ? '' : 's'} attached
              </span>
            </div>

            {/* Attached Media List / Thumbnails */}
            {mediaUrls.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                {mediaUrls.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="relative group rounded-lg border border-border overflow-hidden bg-card p-1.5 flex flex-col items-center justify-center text-center"
                  >
                    <button
                      type="button"
                      onClick={() => removeMedia(idx)}
                      className="absolute top-1 right-1 rounded-full bg-destructive text-white p-0.5 opacity-90 hover:opacity-100 transition-opacity z-10"
                    >
                      <X className="size-3" />
                    </button>

                    {item.type === 'video' ? (
                      <div className="flex flex-col items-center justify-center h-16 w-full bg-muted/60 rounded">
                        <Video className="size-6 text-primary" />
                        <span className="text-[10px] text-muted-foreground mt-1 truncate max-w-[100px]">
                          {item.name}
                        </span>
                      </div>
                    ) : item.type === 'image' && item.thumbnail ? (
                      <div className="relative h-16 w-full rounded overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.thumbnail}
                          alt={item.name}
                          className="h-full w-full object-cover rounded"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-16 w-full bg-muted/60 rounded">
                        <ImageIcon className="size-6 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-1 truncate max-w-[100px]">
                          {item.name}
                        </span>
                      </div>
                    )}

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 text-[10px] text-primary truncate hover:underline max-w-[110px]"
                    >
                      {item.name}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Description & Highlights</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Garden facing, fully furnished, modular kitchen, 2 covered car parkings..."
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              {property ? 'Update Property' : 'Save Property'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
