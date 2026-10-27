'use client';

import {
  Building,
  HardDrive,
  ExternalLink,
  MapPin,
  BedDouble,
  Maximize2,
  Share2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Video,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { Property } from '@/types';

interface PropertyCardProps {
  property: Property;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function PropertyCard({
  property,
  onClick,
  onEdit,
  onDelete,
}: PropertyCardProps) {
  const mediaList = property.media_urls || [];
  const primaryMedia = mediaList[0] || null;

  const imageCount = mediaList.filter((m) => m.type === 'image').length;
  const videoCount = mediaList.filter((m) => m.type === 'video').length;

  function shareOnWhatsApp(e: React.MouseEvent) {
    e.stopPropagation();
    const lines = [
      `*${property.title}* (${property.property_type.toUpperCase()})`,
      property.price ? `💰 Price/Rent: ₹${property.price.toLocaleString('en-IN')}` : null,
      property.bedrooms ? `🛏️ Bedrooms: ${property.bedrooms} BHK` : null,
      property.area_sqft ? `📐 Area: ${property.area_sqft} sq.ft.` : null,
      property.address ? `📍 Location: ${property.address}${property.city ? `, ${property.city}` : ''}` : null,
      property.google_drive_folder_url
        ? `📁 Drive Media: ${property.google_drive_folder_url}`
        : null,
    ].filter(Boolean);

    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-all cursor-pointer hover:shadow-md"
    >
      {/* Media Cover / Preview */}
      <div className="relative aspect-video w-full bg-muted/60 overflow-hidden flex items-center justify-center">
        {primaryMedia ? (
          primaryMedia.type === 'video' ? (
            <div className="flex flex-col items-center justify-center h-full w-full bg-slate-900 text-white">
              <Video className="size-8 text-primary" />
              <span className="text-[11px] mt-1 text-slate-300">Video Tour</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={primaryMedia.thumbnail || primaryMedia.url}
              alt={property.title}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground">
            <Building className="size-10 opacity-30" />
            <span className="text-xs mt-1">No media</span>
          </div>
        )}

        {/* Media Counts Badge */}
        {mediaList.length > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
            {imageCount > 0 && (
              <span className="flex items-center gap-0.5">
                <ImageIcon className="size-3" /> {imageCount}
              </span>
            )}
            {videoCount > 0 && (
              <span className="flex items-center gap-0.5">
                <Video className="size-3" /> {videoCount}
              </span>
            )}
          </div>
        )}

        {/* Google Drive Folder Badge */}
        {property.google_drive_folder_url && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-medium text-primary-foreground shadow">
            <HardDrive className="size-3" />
            <span>Drive</span>
          </div>
        )}

        {/* Status Badge */}
        <div className="absolute top-2 left-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider shadow-sm ${
              property.status === 'interested'
                ? 'bg-amber-500 text-white'
                : property.status === 'buy'
                ? 'bg-emerald-600 text-white'
                : property.status === 'sell'
                ? 'bg-blue-600 text-white'
                : property.status === 'already_visited'
                ? 'bg-purple-600 text-white'
                : property.status === 'not_interested'
                ? 'bg-red-600 text-white'
                : 'bg-slate-700 text-white'
            }`}
          >
            {property.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-foreground line-clamp-1">
              {property.title}
            </h3>
            {property.address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 line-clamp-1">
                <MapPin className="size-3 shrink-0" />
                {property.address}
                {property.city ? `, ${property.city}` : ''}
              </p>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={shareOnWhatsApp}>
                <Share2 className="size-4 mr-2 text-emerald-400" />
                Share WhatsApp
              </DropdownMenuItem>
              {property.google_drive_folder_url && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(property.google_drive_folder_url!, '_blank');
                  }}
                >
                  <HardDrive className="size-4 mr-2 text-primary" />
                  Open in Drive
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="size-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="size-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Specs Row */}
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground border-y border-border py-2">
          {property.bedrooms ? (
            <span className="flex items-center gap-1 font-medium text-foreground">
              <BedDouble className="size-3.5 text-primary" />
              {property.bedrooms} BHK
            </span>
          ) : null}
          {property.area_sqft ? (
            <span className="flex items-center gap-1">
              <Maximize2 className="size-3.5" />
              {property.area_sqft} sqft
            </span>
          ) : null}
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase font-medium">
            {property.property_type}
          </span>
        </div>

        {/* Footer: Price & WhatsApp Action */}
        <div className="mt-auto pt-3 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-muted-foreground block uppercase">
              {property.listing_type} Price
            </span>
            <span className="text-base font-bold text-emerald-400">
              {property.price ? `₹${property.price.toLocaleString('en-IN')}` : 'Price on request'}
            </span>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={shareOnWhatsApp}
            className="h-8 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
          >
            <Share2 className="size-3.5 mr-1" />
            Share
          </Button>
        </div>
      </div>
    </div>
  );
}
