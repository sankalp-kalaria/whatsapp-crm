'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Investor } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Landmark,
  Building,
  AlertTriangle,
  Clock,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { InvestorForm } from '@/components/investors/investor-form';
import { InvestorDetailView } from '@/components/investors/investor-detail-view';
import { ExpiryBanner } from '@/components/investors/expiry-banner';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import type { ExpiryItem } from '@/lib/investors/check-expiries';

const PAGE_SIZE = 25;

type FilterTab = 'all' | 'pending_for_rent' | 'rented' | 'expiring_soon' | 'expired' | 'vacant';

export default function InvestorsPage() {
  const supabase = createClient();
  const canEdit = useCan('send-messages');

  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editInvestor, setEditInvestor] = useState<Investor | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailInvestorId, setDetailInvestorId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Investor | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Expiry alerts
  const [expiryItems, setExpiryItems] = useState<ExpiryItem[]>([]);

  const fetchSeq = useRef(0);

  // Load expiry alerts and trigger automated notification checks
  const checkExpiries = useCallback(async () => {
    try {
      const res = await fetch('/api/investors/check-expiries');
      if (res.ok) {
        const data = await res.json();
        if (data.items) {
          const investorItems = data.items.filter((i: ExpiryItem) => i.type === 'investor');
          setExpiryItems(investorItems);
        }
      }
    } catch {
      // Non-fatal
    }
  }, []);

  const fetchInvestors = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setSelected(new Set());

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    const todayStr = new Date().toISOString().split('T')[0];
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);
    const thirtyDaysStr = thirtyDaysAhead.toISOString().split('T')[0];

    let query = supabase
      .from('investors')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (term) {
      const like = `%${term}%`;
      query = query.or(`name.ilike.${like},phone.ilike.${like},purchase_flat_details.ilike.${like}`);
    }

    if (activeTab === 'pending_for_rent') {
      query = query.eq('rental_status', 'pending_for_rent');
    } else if (activeTab === 'rented') {
      query = query.eq('rental_status', 'rented');
    } else if (activeTab === 'vacant') {
      query = query.eq('rental_status', 'vacant');
    } else if (activeTab === 'expiring_soon') {
      query = query
        .gte('agreement_end_date', todayStr)
        .lte('agreement_end_date', thirtyDaysStr);
    } else if (activeTab === 'expired') {
      query = query.lt('agreement_end_date', todayStr);
    }

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (seq !== fetchSeq.current) return;

    if (error) {
      toast.error('Failed to load investors');
      setLoading(false);
      return;
    }

    setInvestors(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [supabase, page, search, activeTab]);

  useEffect(() => {
    fetchInvestors();
  }, [fetchInvestors]);

  useEffect(() => {
    checkExpiries();
  }, [checkExpiries]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('investors-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'investors' },
        () => {
          fetchInvestors();
          checkExpiries();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchInvestors, checkExpiries]);

  function openAddForm() {
    setEditInvestor(null);
    setFormOpen(true);
  }

  function openEditForm(inv: Investor) {
    setEditInvestor(inv);
    setFormOpen(true);
  }

  function openDetail(id: string) {
    setDetailInvestorId(id);
    setDetailOpen(true);
  }

  function confirmDelete(inv: Investor) {
    setDeleteTarget(inv);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('investors')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error('Failed to delete investor');
    } else {
      toast.success('Investor deleted');
      fetchInvestors();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const allOnPageSelected =
    investors.length > 0 && investors.every((i) => selected.has(i.id));
  const someOnPageSelected = investors.some((i) => selected.has(i.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        investors.forEach((i) => next.delete(i.id));
      } else {
        investors.forEach((i) => next.add(i.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);

    const { error } = await supabase.from('investors').delete().in('id', ids);

    if (error) {
      toast.error('Failed to delete selected investors');
    } else {
      toast.success(`Deleted ${ids.length} investors`);
      setSelected(new Set());
      fetchInvestors();
    }

    setDeleting(false);
    setBulkDeleteOpen(false);
  }

  function sendWhatsAppNotification(phone: string, message: string) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
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
            <Landmark className="size-6 text-primary" />
            Investors (Flat Owners)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track flat owners, rental commitments, agreement timelines, and automated expiry alerts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GatedButton
            canAct={canEdit}
            gateReason="Only agents and admins can add investors"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4 mr-1.5" />
            Add Investor
          </GatedButton>
        </div>
      </div>

      {/* Expiry Alert Banner */}
      <ExpiryBanner
        items={expiryItems}
        onNotifyWhatsApp={sendWhatsAppNotification}
      />

      {/* Filter Tabs & Search */}
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
            All Investors
          </Button>
          <Button
            variant={activeTab === 'pending_for_rent' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('pending_for_rent');
              setPage(0);
            }}
            className="text-xs"
          >
            Pending for Rent
          </Button>
          <Button
            variant={activeTab === 'rented' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('rented');
              setPage(0);
            }}
            className="text-xs"
          >
            Rented
          </Button>
          <Button
            variant={activeTab === 'expiring_soon' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('expiring_soon');
              setPage(0);
            }}
            className="text-xs flex items-center gap-1"
          >
            <Clock className="size-3 text-amber-400" />
            Expiring Soon (&lt;30d)
          </Button>
          <Button
            variant={activeTab === 'expired' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('expired');
              setPage(0);
            }}
            className="text-xs flex items-center gap-1"
          >
            <AlertTriangle className="size-3 text-red-400" />
            Agreement Expired
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search by name, phone, flat..."
              className="pl-8 bg-card border-border text-foreground"
            />
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-2">
          <p className="text-sm text-foreground">
            {selected.size} selected
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={canEdit}
              gateReason="Permission required"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-4 mr-1" />
              Delete Selected
            </GatedButton>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  indeterminate={!allOnPageSelected && someOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={investors.length === 0}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="text-muted-foreground">Investor Name</TableHead>
              <TableHead className="text-muted-foreground">Phone</TableHead>
              <TableHead className="text-muted-foreground">Flat / Unit Details</TableHead>
              <TableHead className="text-muted-foreground">Rental Status</TableHead>
              <TableHead className="text-muted-foreground">Agreement End Date</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">Rent</TableHead>
              <TableHead className="text-muted-foreground w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading investors...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : investors.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Building className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No investors found matching criteria
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openAddForm}
                      className="mt-2"
                    >
                      <Plus className="size-3.5 mr-1" />
                      Add First Investor
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              investors.map((inv) => {
                const today = new Date();
                const targetDateStr = inv.agreement_end_date || inv.rent_end_date;
                let isExp = false;
                let isNear = false;
                let days = 0;

                if (targetDateStr) {
                  const targetDate = new Date(targetDateStr);
                  const diff = targetDate.getTime() - today.getTime();
                  days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                  isExp = days < 0;
                  isNear = days >= 0 && days <= 30;
                }

                return (
                  <TableRow
                    key={inv.id}
                    className="border-border hover:bg-muted/50 cursor-pointer"
                    onClick={() => openDetail(inv.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(inv.id)}
                        onCheckedChange={() => toggleSelect(inv.id)}
                        aria-label={`Select ${inv.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-foreground font-medium">
                      {inv.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {inv.phone}
                    </TableCell>
                    <TableCell className="text-foreground text-sm max-w-[200px] truncate">
                      {inv.purchase_flat_details || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          inv.rental_status === 'rented'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : inv.rental_status === 'pending_for_rent'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {inv.rental_status.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell>
                      {targetDateStr ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-foreground font-medium">
                            {targetDateStr}
                          </span>
                          {isExp && (
                            <span className="rounded bg-red-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-red-400">
                              Expired
                            </span>
                          )}
                          {isNear && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-amber-400">
                              {days}d left
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs hidden md:table-cell">
                      {inv.rent_amount ? `₹${inv.rent_amount.toLocaleString('en-IN')}` : '-'}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="xs"
                          className="h-7 px-2.5 text-xs font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditForm(inv);
                          }}
                        >
                          <Pencil className="size-3 mr-1" />
                          Edit
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-foreground"
                                onClick={(e) => e.stopPropagation()}
                              />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                sendWhatsAppNotification(
                                  inv.phone,
                                  `Hello ${inv.name}, updating you regarding flat ${inv.purchase_flat_details || ''}.`
                                );
                              }}
                            >
                              <MessageSquare className="size-4 mr-2 text-emerald-400" />
                              WhatsApp Message
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditForm(inv);
                              }}
                            >
                              <Pencil className="size-4 mr-2" />
                              Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDelete(inv);
                              }}
                            >
                              <Trash2 className="size-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

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
      <InvestorForm
        open={formOpen}
        onOpenChange={setFormOpen}
        investor={editInvestor}
        onSaved={fetchInvestors}
      />

      {/* Detail View Drawer */}
      <InvestorDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        investorId={detailInvestorId}
        onEdit={openEditForm}
      />

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Investor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete investor &ldquo;{deleteTarget?.name}&rdquo;?
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

      {/* Bulk Delete Confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Selected Investors</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selected.size} selected investors?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Delete All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
