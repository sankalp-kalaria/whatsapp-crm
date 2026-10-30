'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Client, Investor } from '@/types';
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
  UserCheck,
  CreditCard,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Clock,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { ClientForm } from '@/components/clients/client-form';
import { ClientDetailView } from '@/components/clients/client-detail-view';
import { ExpiryBanner } from '@/components/investors/expiry-banner';
import type { ExpiryItem } from '@/lib/investors/check-expiries';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { SiteVisitsView } from '@/components/site-visits/site-visits-view';

const PAGE_SIZE = 25;

type ClientFilterTab = 'all' | 'active' | 'agreement_signed' | 'in_process' | 'expired';

export default function ClientsPage() {
  const supabase = createClient();
  const canEdit = useCan('send-messages');

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [activeTab, setActiveTab] = useState<ClientFilterTab>('all');

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailClientId, setDetailClientId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // Client agreement expiry alerts
  const [expiryItems, setExpiryItems] = useState<ExpiryItem[]>([]);

  const fetchSeq = useRef(0);

  // Trigger expiry check — inserts notifications into the DB for clients
  // that have agreements expiring within 30 days, mirroring the investors page.
  const checkExpiries = useCallback(async () => {
    try {
      const res = await fetch('/api/investors/check-expiries');
      if (res.ok) {
        const data = await res.json();
        if (data.items) {
          // Only show client-type items on this page
          const clientItems = (data.items as ExpiryItem[]).filter(
            (i) => i.type === 'client'
          );
          setExpiryItems(clientItems);
        }
      }
    } catch {
      // Non-fatal — notifications still persist from last successful run
    }
  }, []);

  const fetchClients = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    setSelected(new Set());

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    let query = supabase
      .from('clients')
      .select('*, investor:investors(id, name, phone, purchase_flat_details)', {
        count: 'exact',
      })
      .order('created_at', { ascending: false });

    if (term) {
      const like = `%${term}%`;
      query = query.or(
        `name.ilike.${like},phone.ilike.${like},id_proof_number.ilike.${like}`
      );
    }

    if (activeTab === 'active') {
      query = query.eq('status', 'active');
    } else if (activeTab === 'agreement_signed') {
      query = query.eq('status', 'agreement_signed');
    } else if (activeTab === 'in_process') {
      query = query.eq('status', 'in_process');
    } else if (activeTab === 'expired') {
      query = query.eq('status', 'expired');
    }

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (seq !== fetchSeq.current) return;

    if (error) {
      toast.error('Failed to load clients');
      setLoading(false);
      return;
    }

    setClients((data as Client[]) || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [supabase, page, search, activeTab]);

  useEffect(() => {
    fetchClients();
    checkExpiries();
  }, [fetchClients, checkExpiries]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('clients-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        () => {
          fetchClients();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchClients]);

  function openAddForm() {
    setEditClient(null);
    setFormOpen(true);
  }

  function openEditForm(cl: Client) {
    setEditClient(cl);
    setFormOpen(true);
  }

  function openDetail(id: string) {
    setDetailClientId(id);
    setDetailOpen(true);
  }

  function confirmDelete(cl: Client) {
    setDeleteTarget(cl);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error('Failed to delete client');
    } else {
      toast.success('Client deleted');
      fetchClients();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const allOnPageSelected =
    clients.length > 0 && clients.every((c) => selected.has(c.id));
  const someOnPageSelected = clients.some((c) => selected.has(c.id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        clients.forEach((c) => next.delete(c.id));
      } else {
        clients.forEach((c) => next.add(c.id));
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

    const { error } = await supabase.from('clients').delete().in('id', ids);

    if (error) {
      toast.error('Failed to delete selected clients');
    } else {
      toast.success(`Deleted ${ids.length} clients`);
      setSelected(new Set());
      fetchClients();
    }

    setDeleting(false);
    setBulkDeleteOpen(false);
  }

  function sendWhatsApp(phone: string, name: string) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    window.open(
      `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hello ${name}, connecting regarding your property rental/agreement.`)}`,
      '_blank'
    );
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
            <UserCheck className="size-6 text-primary" />
            Clients (Tenants &amp; Buyers)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage clients, Aadhar/PAN proof documents, linked flat owners, and agreement tracking.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GatedButton
            canAct={canEdit}
            gateReason="Only agents and admins can add clients"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <Plus className="size-4 mr-1.5" />
            Add Client
          </GatedButton>
        </div>
      </div>

      {/* Client Agreement Expiry Alerts */}
      {expiryItems.length > 0 && (
        <ExpiryBanner
          items={expiryItems}
          onNotifyWhatsApp={(phone, message) => {
            const cleanPhone = phone.replace(/[^0-9]/g, '');
            window.open(
              `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`,
              '_blank'
            );
          }}
        />
      )}

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
            All Clients
          </Button>
          <Button
            variant={activeTab === 'active' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('active');
              setPage(0);
            }}
            className="text-xs"
          >
            Active
          </Button>
          <Button
            variant={activeTab === 'agreement_signed' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('agreement_signed');
              setPage(0);
            }}
            className="text-xs"
          >
            Agreement Signed
          </Button>
          <Button
            variant={activeTab === 'in_process' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('in_process');
              setPage(0);
            }}
            className="text-xs"
          >
            In Process
          </Button>
          <Button
            variant={activeTab === 'expired' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab('expired');
              setPage(0);
            }}
            className="text-xs"
          >
            Expired
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
              placeholder="Search by name, phone, Aadhar/PAN..."
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
                  disabled={clients.length === 0}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="text-muted-foreground">Client Name</TableHead>
              <TableHead className="text-muted-foreground">Phone</TableHead>
              <TableHead className="text-muted-foreground">ID Proof (Aadhar/PAN)</TableHead>
              <TableHead className="text-muted-foreground">Linked Investor / Flat</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Agreement End</TableHead>
              <TableHead className="text-muted-foreground w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading clients...</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <UserCheck className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No clients found
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openAddForm}
                      className="mt-2"
                    >
                      <Plus className="size-3.5 mr-1" />
                      Add First Client
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => {
                const investor = (client as unknown as { investor?: Investor | null }).investor;
                return (
                  <TableRow
                    key={client.id}
                    className="border-border hover:bg-muted/50 cursor-pointer"
                    onClick={() => openDetail(client.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(client.id)}
                        onCheckedChange={() => toggleSelect(client.id)}
                        aria-label={`Select ${client.name}`}
                      />
                    </TableCell>
                    <TableCell className="text-foreground font-medium">
                      {client.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {client.phone}
                    </TableCell>
                    <TableCell>
                      {client.id_proof_number ? (
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs text-foreground">
                            {client.id_proof_number}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            ({client.id_proof_type || 'Aadhar'})
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">Pending</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {investor ? (
                        <div className="flex flex-col text-xs">
                          <span className="font-medium text-foreground flex items-center gap-1">
                            <Landmark className="size-3 text-primary" />
                            {investor.name}
                          </span>
                          <span className="text-muted-foreground truncate max-w-[150px]">
                            {investor.purchase_flat_details || 'Flat'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          client.status === 'active' || client.status === 'agreement_signed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : client.status === 'in_process'
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {client.status.replace(/_/g, ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {client.agreement_end_date || '-'}
                    </TableCell>
                    <TableCell>
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
                              sendWhatsApp(client.phone, client.name);
                            }}
                          >
                            <MessageSquare className="size-4 mr-2 text-emerald-400" />
                            WhatsApp Message
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditForm(client);
                            }}
                          >
                            <Pencil className="size-4 mr-2" />
                            Edit Client
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDelete(client);
                            }}
                          >
                            <Trash2 className="size-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
      <ClientForm
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editClient}
        onSaved={fetchClients}
      />

      {/* Detail View Drawer */}
      <ClientDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        clientId={detailClientId}
        onEdit={openEditForm}
      />

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete client &ldquo;{deleteTarget?.name}&rdquo;?
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
            <DialogTitle>Delete Selected Clients</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selected.size} selected clients?
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
