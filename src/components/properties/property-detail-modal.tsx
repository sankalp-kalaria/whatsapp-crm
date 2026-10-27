'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Building,
  HardDrive,
  ExternalLink,
  MapPin,
  Landmark,
  UserCheck,
  Video,
  Image as ImageIcon,
  MessageSquare,
  Pencil,
  BedDouble,
  Bath,
  Maximize2,
  Share2,
} from 'lucide-react';
import type { Property } from '@/types';

interface PropertyDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property | null;
  onEdit: (property: Property) => void;
}

export function PropertyDetailModal({
  open,
  onOpenChange,
  property,
  onEdit,
}: PropertyDetailModalProps) {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);

  if (!property) return null;

  const mediaList = property.media_urls || [];
  const activeMedia = mediaList[activeMediaIndex] || null;

  function shareOnWhatsApp() {
    if (!property) return;
    const lines = [
      `*${property.title}* (${property.property_type.toUpperCase()})`,
      property.price ? `💰 Price/Rent: ₹${property.price.toLocaleString('en-IN')}` : null,
      property.bedrooms ? `🛏️ Bedrooms: ${property.bedrooms} BHK` : null,
      property.area_sqft ? `📐 Area: ${property.area_sqft} sq.ft.` : null,
      property.address ? `📍 Location: ${property.address}${property.city ? `, ${property.city}` : ''}` : null,
      property.description ? `\n📝 Details: ${property.description}` : null,
      property.google_drive_folder_url
        ? `\n📁 Photos & Videos (Drive): ${property.google_drive_folder_url}`
        : null,
    ].filter(Boolean);

    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Building className="size-5 text-primary" />
              {property.title}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={shareOnWhatsApp}
                className="text-xs text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20"
              >
                <Share2 className="size-3.5 mr-1" />
                Share on WhatsApp
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(property);
                }}
                className="text-xs"
              >
                <Pencil className="size-3.5 mr-1" />
                Edit
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Status & Google Drive Link Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-semibold uppercase">
                {property.listing_type}
              </span>
              <span className="rounded-full bg-muted text-foreground px-2.5 py-0.5 text-xs font-medium uppercase">
                {property.status.replace(/_/g, ' ')}
              </span>
              {property.interest_status && (
                <span className="rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium">
                  Interest: {property.interest_status.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            {property.google_drive_folder_url && (
              <a
                href={property.google_drive_folder_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                <HardDrive className="size-3.5" />
                Open Google Drive Folder
                <ExternalLink className="size-3 ml-0.5" />
              </a>
            )}
          </div>

          {/* Media Player / Lightbox Area */}
          {mediaList.length > 0 && (
            <div className="rounded-xl border border-border bg-black/40 overflow-hidden space-y-2 p-2">
              {activeMedia ? (
                <div className="relative aspect-video max-h-72 w-full flex items-center justify-center bg-black/80 rounded-lg overflow-hidden">
                  {activeMedia.type === 'video' ? (
                    <video
                      src={activeMedia.url}
                      controls
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeMedia.url}
                      alt={activeMedia.name}
                      className="h-full w-full object-contain"
                    />
                  )}
                  <div className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-white">
                    {activeMedia.name}
                  </div>
                </div>
              ) : null}

              {/* Thumbnails rail */}
              {mediaList.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {mediaList.map((m, idx) => (
                    <button
                      key={m.id || idx}
                      type="button"
                      onClick={() => setActiveMediaIndex(idx)}
                      className={`relative h-14 w-20 shrink-0 rounded border overflow-hidden transition-all ${
                        activeMediaIndex === idx
                          ? 'border-primary ring-2 ring-primary/40'
                          : 'border-border opacity-70 hover:opacity-100'
                      }`}
                    >
                      {m.type === 'video' ? (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <Video className="size-5 text-primary" />
                        </div>
                      ) : m.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.thumbnail}
                          alt={m.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <ImageIcon className="size-5 text-muted-foreground" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Key Specifications Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div>
              <span className="text-xs text-muted-foreground block">Price / Rent</span>
              <p className="text-base font-bold text-emerald-400">
                {property.price ? `₹${property.price.toLocaleString('en-IN')}` : 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <BedDouble className="size-3" /> Bedrooms
              </span>
              <p className="text-base font-semibold text-foreground">
                {property.bedrooms ? `${property.bedrooms} BHK` : '-'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Bath className="size-3" /> Bathrooms
              </span>
              <p className="text-base font-semibold text-foreground">
                {property.bathrooms || '-'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Maximize2 className="size-3" /> Super Area
              </span>
              <p className="text-base font-semibold text-foreground">
                {property.area_sqft ? `${property.area_sqft} sq.ft.` : '-'}
              </p>
            </div>
          </div>

          {/* Address */}
          {property.address && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="size-3.5 text-primary shrink-0 mt-0.5" />
              <span>
                {property.address}
                {property.city ? `, ${property.city}` : ''}
              </span>
            </div>
          )}

          {/* Linked Parties */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card p-3 space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                <Landmark className="size-3.5 text-primary" />
                Property Owner (Investor)
              </span>
              {property.investor ? (
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {property.investor.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {property.investor.phone}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No investor assigned</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-3 space-y-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium">
                <UserCheck className="size-3.5 text-primary" />
                Interested / Linked Client
              </span>
              {property.client ? (
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {property.client.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {property.client.phone}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No client assigned</p>
              )}
            </div>
          </div>

          {/* Description */}
          {property.description && (
            <div className="text-xs space-y-1">
              <span className="text-muted-foreground font-medium">Property Description:</span>
              <p className="text-foreground bg-muted/40 p-3 rounded-lg border border-border leading-relaxed">
                {property.description}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
