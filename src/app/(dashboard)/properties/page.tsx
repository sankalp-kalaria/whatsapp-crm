'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Property, GoogleDriveConfig } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Building,
  Plus,
  Search,
  HardDrive,
  LayoutGrid,
  Table as TableIcon,
  Loader2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { PropertyCard } from '@/components/properties/property-card';
import { PropertyForm } from '@/components/properties/property-form';
import { PropertyDetailModal } from '@/components/properties/property-detail-modal';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';

const PAGE_SIZE = 24;

type PropertyFilterTab =
  | 'all'
  | 'interested'
  | 'buy'
  | 'sell'
  | 'already_visited'
  | 'not_interested'
  | 'available'
  | 'rented';

export default function PropertiesPage() {
  const supabase = createClient();
  const canEdit = useCan('send-messages');

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [activeTab, setActiveTab] = useState<PropertyFilterTab>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Google Drive config status
  const [driveConfig, setDriveConfig] = useState<GoogleDriveConfig | null>(null);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProperty, setDetailProperty] = useState<Property | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Property | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSeq = useRef(0);

  // Load Google Drive connection status
  useEffect(() => {
    async function checkDrive() {
      try {
        const res = await fetch('/api/google-drive/config');
        if (res.ok) {
          const data = await res.json();
          setDriveConfig(data.config || null);
        }
      } catch {
        // Non-fatal
      }
    }
    checkDrive();
  }, []);

  const fetchProperties = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    let query = supabase
      .from('properties')
      .select('*, investor:investors(*), client:clients(*)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (term) {
      const like = `%${term}%`;
      query = query.or(`title.ilike.${like},address.ilike.${like},city.ilike.${like}`);
    }

    if (activeTab === 'interested') {
      query = query.or('status.eq.interested,interest_status.eq.interested');
    } else if (activeTab === 'buy') {
      query = query.or('status.eq.buy,interest_status.eq.buy');
    } else if (activeTab === 'sell') {
      query = query.or('status.eq.sell,interest_status.eq.sell');
    } else if (activeTab === 'already_visited') {
      query = query.or('status.eq.already_visited,interest_status.eq.already_visited');
    } else if (activeTab === 'not_interested') {
      query = query.or('status.eq.not_interested,interest_status.eq.not_interested');
    } else if (activeTab === 'available') {
      query = query.eq('status', 'available');
    } else if (activeTab === 'rented') {
      query = query.or('status.eq.rented,status.eq.sold');
    }

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (seq !== fetchSeq.current) return;

    if (error) {
      toast.error('Failed to load properties');
      setLoading(false);
      return;
    }

    setProperties((data as Property[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [supabase, page, search, activeTab]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('properties-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'properties' },
        () => {
          fetchProperties();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchProperties]);

  function openAddForm() {
    setEditProperty(null);
    setFormOpen(true);
  }

  function openEdit(prop: Property) {
    setEditProperty(prop);
    setFormOpen(true);
  }

  function openDetail(prop: Property) {
    setDetailProperty(prop);
    setDetailOpen(true);
  }

  function confirmDelete(prop: Property) {
    setDeleteTarget(prop);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error('Failed to delete property');
    } else {
      toast.success('Property deleted');
      fetchProperties();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building className="size-6 text-primary" />
            Properties
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage real estate listings, photos, videos, and client/investor interest statuses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GatedButton
            canAct={canEdit}
            gateReason="Only agents and admins can add properties"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4 mr-1.5" />
            Add Property
          </GatedButton>
        </div>
      </div>

      {/* Google Drive Status Strip */}
      <div className="rounded-xl border border-border bg-card/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              driveConfig?.is_connected
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <HardDrive className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 font-semibold text-foreground">
              Google Drive Cloud Sync
              <span
                className={`rounded-full px-2 py-0.2 text-[10px] ${
                  driveConfig?.is_connected
                    ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                    : 'bg-amber-500/20 text-amber-400 font-medium'
                }`}
              >
                {driveConfig?.is_connected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
            <p className="text-muted-foreground mt-0.5">
              {driveConfig?.is_connected ? (
                <span>
                  Syncing to folder &ldquo;{driveConfig.root_folder_name}&rdquo; ({driveConfig.connected_email || 'Active'})
                </span>
              ) : (
                <span>
                  Connect Google Drive in Settings to automatically create property folders and sync all videos and photos.
                </span>
              )}
            </p>
          </div>
        </div>

        <Link
          href="/settings?tab=google-drive"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline self-end sm:self-center"
        >
          {driveConfig?.is_connected ? 'Manage Drive Settings' : 'Connect Google Drive'}
          <ExternalLink className="size-3" />
        </Link>
      </div>

      {/* Filter Tabs & Search & View Mode */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-2">
          <Button
            variant={activeTab === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('all');
              setPage(0);
            }}
            className="text-xs"
          >
            All Properties
          </Button>
          <Button
            variant={activeTab === 'interested' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('interested');
              setPage(0);
            }}
            className="text-xs"
          >
            Interested
          </Button>
          <Button
            variant={activeTab === 'buy' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('buy');
              setPage(0);
            }}
            className="text-xs"
          >
            Buy
          </Button>
          <Button
            variant={activeTab === 'sell' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('sell');
              setPage(0);
            }}
            className="text-xs"
          >
            Sell
          </Button>
          <Button
            variant={activeTab === 'already_visited' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('already_visited');
              setPage(0);
            }}
            className="text-xs"
          >
            Already Visited
          </Button>
          <Button
            variant={activeTab === 'not_interested' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('not_interested');
              setPage(0);
            }}
            className="text-xs"
          >
            Not Interested
          </Button>
          <Button
            variant={activeTab === 'available' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('available');
              setPage(0);
            }}
            className="text-xs"
          >
            Available
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search by name, address, city..."
              className="pl-8 bg-card border-border text-foreground"
            />
          </div>

          <div className="flex items-center gap-1 self-end sm:self-auto">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size="icon-sm"
              onClick={() => setViewMode('table')}
              aria-label="Table view"
            >
              <TableIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Property Listings Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading properties...</p>
        </div>
      ) : properties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-border bg-card/40 text-center">
          <Building className="size-10 text-muted-foreground opacity-40 mb-2" />
          <h3 className="text-sm font-semibold text-foreground">No properties found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1">
            {search.trim()
              ? 'No listings match your search keywords or active filters.'
              : 'Add your first property listing to start uploading photos, videos, and managing interest statuses.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={openAddForm}
            className="mt-4"
          >
            <Plus className="size-3.5 mr-1" />
            Add Property
          </Button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {properties.map((prop) => (
            <PropertyCard
              key={prop.id}
              property={prop}
              onClick={() => openDetail(prop)}
              onEdit={() => openEdit(prop)}
              onDelete={() => confirmDelete(prop)}
            />
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-lg border border-border overflow-hidden bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="p-3">Title</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Price</th>
                <th className="p-3">Media</th>
                <th className="p-3">Drive</th>
                <th className="p-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {properties.map((prop) => (
                <tr
                  key={prop.id}
                  onClick={() => openDetail(prop)}
                  className="hover:bg-muted/40 cursor-pointer"
                >
                  <td className="p-3 font-medium text-foreground">{prop.title}</td>
                  <td className="p-3 text-xs uppercase text-muted-foreground">{prop.property_type}</td>
                  <td className="p-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">
                      {prop.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-3 font-bold text-emerald-400 text-xs">
                    {prop.price ? `₹${prop.price.toLocaleString('en-IN')}` : '-'}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {prop.media_urls?.length || 0} files
                  </td>
                  <td className="p-3">
                    {prop.google_drive_folder_url ? (
                      <a
                        href={prop.google_drive_folder_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary hover:underline text-xs flex items-center gap-1"
                      >
                        <HardDrive className="size-3" /> Drive
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(prop)}
                      className="text-xs h-7"
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add / Edit Form Modal */}
      <PropertyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        property={editProperty}
        onSaved={fetchProperties}
      />

      {/* Detail Modal */}
      <PropertyDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        property={detailProperty}
        onEdit={openEdit}
      />

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Property</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.title}&rdquo;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
