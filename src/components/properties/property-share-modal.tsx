'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Share2,
  Search,
  Send,
  Loader2,
  Check,
  Image as ImageIcon,
  Video,
  HardDrive,
  UserPlus,
  Users,
  UserCheck,
  Landmark,
  Sparkles,
  ExternalLink,
  Building,
  Phone,
} from 'lucide-react';
import type {
  Property,
  PropertyMediaItem,
  Contact,
  Client,
  Investor,
  MessageTemplate,
} from '@/types';

interface PropertyShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property | null;
}

interface RecipientItem {
  key: string;
  id?: string;
  name: string;
  phone: string;
  source: 'contact' | 'client' | 'investor' | 'custom';
}

type SourceFilter = 'all' | 'contact' | 'client' | 'investor';

export function buildDefaultPropertyShareText(
  prop: Property,
  selectedMedia: PropertyMediaItem[]
): string {
  const title = prop.title || 'Property Listing';
  const typeLabel = prop.property_type
    ? prop.property_type.toUpperCase()
    : 'PROPERTY';
  const bhkLabel = prop.bedrooms ? `${prop.bedrooms} BHK ` : '';
  const titleSummary = `${title} (${bhkLabel}${typeLabel})`;

  const listingKind = prop.listing_type === 'rent' ? 'Monthly Rent' : 'Sell Price';
  const priceStr = prop.price
    ? `₹${Number(prop.price).toLocaleString('en-IN')}`
    : 'Price on Request';

  const mediaLinks: string[] = [];
  selectedMedia.forEach((m, idx) => {
    if (m.url) {
      const label = m.type === 'video' ? `Video ${idx + 1}` : `Photo ${idx + 1}`;
      mediaLinks.push(`• ${label}: ${m.url}`);
    }
  });
  if (prop.google_drive_folder_url) {
    mediaLinks.push(`• Google Drive Media Folder: ${prop.google_drive_folder_url}`);
  }

  const lines = [
    `🏢 *${titleSummary}*`,
    `💰 *${listingKind}:* ${priceStr}`,
    prop.bedrooms ? `🛏️ *Configuration:* ${prop.bedrooms} BHK` : null,
    prop.bathrooms ? `🚿 *Bathrooms:* ${prop.bathrooms}` : null,
    prop.area_sqft ? `📐 *Area:* ${prop.area_sqft} sq.ft.` : null,
    prop.address || prop.city
      ? `📍 *Location:* ${[prop.address, prop.city].filter(Boolean).join(', ')}`
      : null,
    prop.description ? `\n📝 *Details:*\n${prop.description}` : null,
    mediaLinks.length > 0
      ? `\n🖼️ *Property Photos & Videos:*\n${mediaLinks.join('\n')}`
      : null,
    `\nPlease reply if you would like to schedule a site visit or need more details!`,
  ].filter(Boolean);

  return lines.join('\n');
}

export function PropertyShareModal({
  open,
  onOpenChange,
  property,
}: PropertyShareModalProps) {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [directory, setDirectory] = useState<RecipientItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());

  // Quick custom number input
  const [customName, setCustomName] = useState('');
  const [customPhone, setCustomPhone] = useState('');

  // Media checkboxes (indices into property.media_urls)
  const [selectedMediaIndices, setSelectedMediaIndices] = useState<Set<number>>(
    new Set()
  );

  // Message text & template mode
  const [messageText, setMessageText] = useState('');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [deliveryMode, setDeliveryMode] = useState<string>('auto');
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [sending, setSending] = useState(false);

  const mediaList = useMemo(
    () => (property?.media_urls ? property.media_urls : []),
    [property]
  );

  // Initialize media selection and message text when property changes
  useEffect(() => {
    if (!property || !open) return;
    const allIndices = new Set<number>(mediaList.map((_, idx) => idx));
    setSelectedMediaIndices(allIndices);
    setMessageText(buildDefaultPropertyShareText(property, mediaList));

    // Pre-select linked client or investor if present on the property
    const initialSelected = new Set<string>();
    if (property.client?.phone) {
      initialSelected.add(property.client.phone.replace(/[^0-9]/g, ''));
    }
    setSelectedPhones(initialSelected);
  }, [property, open, mediaList]);

  // Load Contacts, Clients, Investors, and Templates
  const loadDirectoryAndTemplates = useCallback(async () => {
    if (!open || !accountId) return;
    setLoadingDirectory(true);

    const [contactsRes, clientsRes, investorsRes, templatesRes] =
      await Promise.all([
        supabase
          .from('contacts')
          .select('id, name, phone')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('clients')
          .select('id, name, phone')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('investors')
          .select('id, name, phone')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('message_templates')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
      ]);

    const items: RecipientItem[] = [];
    const seenPhones = new Set<string>();

    const normalizePhoneKey = (p: string) => {
      const digits = (p || '').replace(/[^0-9]/g, '');
      return digits.length === 10 ? `91${digits}` : digits;
    };

    for (const c of (contactsRes.data ?? []) as Pick<
      Contact,
      'id' | 'name' | 'phone'
    >[]) {
      const key = normalizePhoneKey(c.phone);
      if (!key || seenPhones.has(key)) continue;
      seenPhones.add(key);
      items.push({
        key,
        id: c.id,
        name: c.name || c.phone,
        phone: c.phone,
        source: 'contact',
      });
    }

    for (const cl of (clientsRes.data ?? []) as Pick<
      Client,
      'id' | 'name' | 'phone'
    >[]) {
      const key = normalizePhoneKey(cl.phone);
      if (!key || seenPhones.has(key)) continue;
      seenPhones.add(key);
      items.push({
        key,
        id: cl.id,
        name: cl.name || cl.phone,
        phone: cl.phone,
        source: 'client',
      });
    }

    for (const inv of (investorsRes.data ?? []) as Pick<
      Investor,
      'id' | 'name' | 'phone'
    >[]) {
      const key = normalizePhoneKey(inv.phone);
      if (!key || seenPhones.has(key)) continue;
      seenPhones.add(key);
      items.push({
        key,
        id: inv.id,
        name: inv.name || inv.phone,
        phone: inv.phone,
        source: 'investor',
      });
    }

    setDirectory(items);
    setTemplates((templatesRes.data ?? []) as MessageTemplate[]);
    setLoadingDirectory(false);
  }, [open, accountId, supabase]);

  useEffect(() => {
    loadDirectoryAndTemplates();
  }, [loadDirectoryAndTemplates]);

  const filteredDirectory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return directory.filter((item) => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.phone.toLowerCase().includes(q)
      );
    });
  }, [directory, searchQuery, sourceFilter]);

  const selectedRecipients = useMemo(
    () => directory.filter((item) => selectedPhones.has(item.key)),
    [directory, selectedPhones]
  );

  function toggleRecipient(phoneKey: string) {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phoneKey)) next.delete(phoneKey);
      else next.add(phoneKey);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      filteredDirectory.forEach((item) => next.add(item.key));
      return next;
    });
  }

  function clearSelected() {
    setSelectedPhones(new Set());
  }

  function handleAddCustomRecipient() {
    const rawPhone = customPhone.trim();
    const digits = rawPhone.replace(/[^0-9]/g, '');
    if (digits.length < 10) {
      toast.error('Please enter a valid 10-12 digit WhatsApp phone number');
      return;
    }
    const key = digits.length === 10 ? `91${digits}` : digits;
    const name = customName.trim() || `+${key}`;

    setDirectory((prev) => {
      if (prev.some((i) => i.key === key)) return prev;
      return [
        {
          key,
          name,
          phone: `+${key}`,
          source: 'custom',
        },
        ...prev,
      ];
    });
    setSelectedPhones((prev) => new Set(prev).add(key));
    setCustomName('');
    setCustomPhone('');
    toast.success(`Added ${name} to share recipients`);
  }

  function toggleMediaIndex(idx: number) {
    if (!property) return;
    setSelectedMediaIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      const chosenMedia = mediaList.filter((_, i) => next.has(i));
      setMessageText(buildDefaultPropertyShareText(property, chosenMedia));
      return next;
    });
  }

  async function handleSyncPropertyTemplate() {
    setSyncingTemplates(true);
    try {
      const res = await fetch('/api/notifications/templates', {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to sync property template');
        return;
      }
      if (Array.isArray(data.templates)) {
        setTemplates(data.templates);
      }
      toast.success(
        'Synced "property_listing_share" template with Meta WhatsApp API'
      );
    } catch {
      toast.error('Failed to sync templates');
    } finally {
      setSyncingTemplates(false);
    }
  }

  async function handleSendViaWhatsAppApi() {
    if (!property) return;
    if (selectedRecipients.length === 0) {
      toast.error('Please select at least one contact to share this property with');
      return;
    }

    setSending(true);
    try {
      const chosenMedia = mediaList.filter((_, idx) =>
        selectedMediaIndices.has(idx)
      );

      const res = await fetch('/api/properties/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: property.id,
          property,
          recipients: selectedRecipients.map((r) => ({
            name: r.name,
            phone: r.phone,
            contactId: r.source === 'contact' ? r.id : undefined,
          })),
          customMessage: messageText,
          mediaItems: chosenMedia,
          deliveryMode,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        toast.error(
          data.error ||
            data.results?.[0]?.error ||
            'Failed to send property details via WhatsApp API'
        );
        return;
      }

      const firstResult = data.results?.[0];
      const modeDesc =
        firstResult?.sentAs === 'media_and_text'
          ? `Full Property Info + ${firstResult.mediaSentCount} Photo/Video file(s)`
          : firstResult?.sentAs === 'template'
            ? `Approved Template (${firstResult.templateName})`
            : 'WhatsApp Message';

      toast.success(
        `Shared "${property.title}" with ${data.sentCount} contact${data.sentCount === 1 ? '' : 's'} via ${modeDesc}!`
      );
      onOpenChange(false);
    } catch {
      toast.error('Network error while sharing property');
    } finally {
      setSending(false);
    }
  }

  function handleOpenWhatsAppDirect() {
    if (!property) return;
    const text = encodeURIComponent(messageText);
    if (selectedRecipients.length === 1) {
      const cleanPhone = selectedRecipients[0].key;
      window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }
  }

  if (!property) return null;

  const approvedTemplates = templates.filter(
    (t) => (t.status || '').toUpperCase() === 'APPROVED'
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl sm:max-w-5xl max-h-[92vh] overflow-y-auto bg-card border-border text-foreground p-6 sm:p-8 gap-6">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="flex items-center gap-2.5 text-2xl font-bold">
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Share2 className="size-5" />
                </div>
                Share Property on WhatsApp — {property.title}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm mt-1">
                Select one or multiple contacts to send complete property specifications, images, and videos directly to their WhatsApp number anytime.
              </DialogDescription>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncingTemplates}
              onClick={handleSyncPropertyTemplate}
              className="shrink-0 text-xs"
            >
              {syncingTemplates ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5 mr-1.5 text-emerald-400" />
              )}
              Sync Property Share Template
            </Button>
          </div>
        </DialogHeader>

        {/* Main 2-Column Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN (5 cols): Select Contacts / Clients / Investors */}
          <div className="lg:col-span-5 flex flex-col rounded-xl border border-border bg-muted/15 p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users className="size-4 text-primary" />
                1. Select Contacts ({selectedPhones.size} selected)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Select All
                </button>
                {selectedPhones.size > 0 && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <button
                      type="button"
                      onClick={clearSelected}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts by name or phone..."
                className="pl-8 h-9 text-xs bg-background"
              />
            </div>

            {/* Source Filter Pills */}
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'contact', label: 'Contacts / Leads' },
                  { id: 'client', label: 'Clients' },
                  { id: 'investor', label: 'Investors' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSourceFilter(tab.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    sourceFilter === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:text-foreground border border-border'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Contact List */}
            <div className="flex-1 min-h-[220px] max-h-[280px] overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border">
              {loadingDirectory ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">
                    Loading contacts...
                  </span>
                </div>
              ) : filteredDirectory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <Users className="size-6 text-muted-foreground opacity-50 mb-1" />
                  <p className="text-xs text-muted-foreground">
                    No contacts match your search. You can also add any phone number below.
                  </p>
                </div>
              ) : (
                filteredDirectory.map((item) => {
                  const isChecked = selectedPhones.has(item.key);
                  return (
                    <label
                      key={item.key}
                      className={`flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer transition-colors hover:bg-muted/40 ${
                        isChecked ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleRecipient(item.key)}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                            <Phone className="size-2.5" />
                            {item.phone}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                          item.source === 'client'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : item.source === 'investor'
                              ? 'bg-amber-500/10 text-amber-400'
                              : item.source === 'custom'
                                ? 'bg-purple-500/10 text-purple-400'
                                : 'bg-blue-500/10 text-blue-400'
                        }`}
                      >
                        {item.source === 'contact' ? 'Lead' : item.source}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            {/* Quick Add Custom WhatsApp Number */}
            <div className="rounded-lg border border-border bg-background p-2.5 space-y-2">
              <Label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                <UserPlus className="size-3 text-primary" />
                Or Share to Any New WhatsApp Number:
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Name (optional)"
                  className="sm:col-span-5 h-8 text-xs"
                />
                <Input
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder="Phone e.g. 9876543210"
                  className="sm:col-span-4 h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddCustomRecipient}
                  className="sm:col-span-3 h-8 text-xs"
                >
                  + Add
                </Button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (7 cols): Property Media (Images/Videos), Message & Template Mode */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            {/* Property Media Attachments (Photos & Videos) */}
            <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ImageIcon className="size-4 text-primary" />
                  2. Property Images &amp; Videos to Send ({selectedMediaIndices.size} of {mediaList.length} selected)
                </span>
                {property.google_drive_folder_url && (
                  <a
                    href={property.google_drive_folder_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                  >
                    <HardDrive className="size-3.5" />
                    Google Drive Folder Included
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>

              {mediaList.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No uploaded photos or videos on this property yet. Edit the property to upload images/videos or attach a Google Drive folder.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-40 overflow-y-auto">
                  {mediaList.map((m, idx) => {
                    const isSelected = selectedMediaIndices.has(idx);
                    return (
                      <div
                        key={m.id || idx}
                        onClick={() => toggleMediaIndex(idx)}
                        className={`group relative flex items-center gap-2 rounded-lg border p-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-background opacity-60 hover:opacity-100'
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleMediaIndex(idx)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="h-10 w-12 shrink-0 rounded bg-muted overflow-hidden flex items-center justify-center">
                          {m.type === 'video' ? (
                            <Video className="size-5 text-primary" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.thumbnail || m.url}
                              alt={m.name}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium text-foreground truncate">
                            {m.name || `${m.type} ${idx + 1}`}
                          </p>
                          <span className="text-[10px] uppercase text-muted-foreground font-semibold">
                            {m.type}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Editable Property Details Message */}
            <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-2.5 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Building className="size-4 text-primary" />
                  3. Complete Property Information &amp; Media Message
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    const chosen = mediaList.filter((_, i) =>
                      selectedMediaIndices.has(i)
                    );
                    setMessageText(
                      buildDefaultPropertyShareText(property, chosen)
                    );
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Reset Default Text
                </button>
              </div>
              <Textarea
                rows={7}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                className="text-xs font-mono leading-relaxed bg-background flex-1"
              />
            </div>

            {/* Template / Anytime Delivery Mode Selector */}
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-emerald-400" />
                  Send Anytime (24h Media + Approved Template Auto-Fallback)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Sends native photos, videos &amp; text inside the 24h window, or automatically uses an Approved Template (<code className="text-emerald-400">property_listing_share</code>) outside 24h so it reaches any contact anytime.
                </p>
              </div>

              <select
                aria-label="Property share delivery mode"
                value={deliveryMode}
                onChange={(e) => setDeliveryMode(e.target.value)}
                className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground shrink-0 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="auto">
                  Auto (Photos/Videos + Template Fallback)
                </option>
                {approvedTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.name}>
                    Template: {tpl.name} ({tpl.status})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2.5 pt-4 border-t border-border -mx-6 -mb-6 sm:-mx-8 sm:-mb-8 px-6 py-4 sm:px-8 flex-wrap sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleOpenWhatsAppDirect}
            className="text-xs"
          >
            <ExternalLink className="size-3.5 mr-1.5" />
            Open in WhatsApp App / Web
          </Button>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSendViaWhatsAppApi}
              disabled={sending || selectedPhones.size === 0}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold min-w-[210px]"
            >
              {sending ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Sending Property &amp; Media...
                </>
              ) : (
                <>
                  <Send className="size-4 mr-2" />
                  Send on WhatsApp ({selectedPhones.size}{' '}
                  {selectedPhones.size === 1 ? 'Contact' : 'Contacts'})
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

