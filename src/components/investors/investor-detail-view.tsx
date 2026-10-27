'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Landmark,
  Building,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  MessageSquare,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
  FileText,
  Pencil,
} from 'lucide-react';
import type { Investor, Client } from '@/types';

interface InvestorDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investorId: string | null;
  onEdit: (investor: Investor) => void;
}

export function InvestorDetailView({
  open,
  onOpenChange,
  investorId,
  onEdit,
}: InvestorDetailViewProps) {
  const supabase = createClient();
  const [investor, setInvestor] = useState<Investor | null>(null);
  const [linkedClients, setLinkedClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!investorId || !open) return;
    setLoading(true);

    async function load() {
      const { data: inv } = await supabase
        .from('investors')
        .select('*')
        .eq('id', investorId)
        .maybeSingle();

      setInvestor(inv);

      if (inv) {
        const { data: clients } = await supabase
          .from('clients')
          .select('*')
          .eq('investor_id', inv.id);
        setLinkedClients(clients || []);
      }
      setLoading(false);
    }

    load();
  }, [investorId, open, supabase]);

  if (!investor) return null;

  // Calculate agreement countdown
  const today = new Date();
  let daysRemaining: number | null = null;
  let isExpired = false;
  let isExpiringSoon = false;

  const targetDateStr = investor.agreement_end_date || investor.rent_end_date;
  if (targetDateStr) {
    const targetDate = new Date(targetDateStr);
    const diffTime = targetDate.getTime() - today.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    isExpired = daysRemaining < 0;
    isExpiringSoon = daysRemaining >= 0 && daysRemaining <= 30;
  }

  const suggestedMsg = isExpired
    ? `Hello ${investor.name}, your rental agreement for ${investor.purchase_flat_details || 'your flat'} ended on ${targetDateStr}. We are actively looking for a new tenant for your flat. Please let us know if you'd like to discuss.`
    : `Hello ${investor.name}, gentle reminder that your rental agreement for ${investor.purchase_flat_details || 'your flat'} is expiring on ${targetDateStr} (${daysRemaining} days left). We are preparing to assist with agreement renewal or finding a new tenant.`;

  function openWhatsApp() {
    if (!investor?.phone) return;
    const cleanPhone = investor.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(suggestedMsg)}`;
    window.open(url, '_blank');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Landmark className="size-5 text-primary" />
              {investor.name}
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onEdit(investor);
              }}
              className="text-xs"
            >
              <Pencil className="size-3.5 mr-1" />
              Edit
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Status Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                investor.rental_status === 'rented'
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : investor.rental_status === 'pending_for_rent'
                  ? 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border border-muted-foreground/30 bg-muted text-muted-foreground'
              }`}
            >
              {investor.rental_status.replace(/_/g, ' ')}
            </span>

            {targetDateStr && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold flex items-center gap-1 ${
                  isExpired
                    ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                    : isExpiringSoon
                    ? 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : 'border border-border bg-muted text-foreground'
                }`}
              >
                {isExpired ? (
                  <AlertTriangle className="size-3" />
                ) : (
                  <Clock className="size-3" />
                )}
                {isExpired
                  ? `Agreement Expired (${Math.abs(daysRemaining || 0)}d ago)`
                  : isExpiringSoon
                  ? `Expires in ${daysRemaining} days`
                  : `Active (${daysRemaining} days remaining)`}
              </span>
            )}
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="space-y-1 text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Phone className="size-3" /> Phone Number
              </span>
              <p className="font-semibold text-foreground">{investor.phone}</p>
            </div>
            {investor.email && (
              <div className="space-y-1 text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Mail className="size-3" /> Email Address
                </span>
                <p className="font-semibold text-foreground">{investor.email}</p>
              </div>
            )}
            {investor.address && (
              <div className="space-y-1 text-xs sm:col-span-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="size-3" /> Investor Address
                </span>
                <p className="text-foreground">{investor.address}</p>
              </div>
            )}
          </div>

          {/* Flat Purchase Details */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building className="size-4 text-primary" />
              Owned Flat / Property Details
            </div>
            <p className="text-sm font-medium text-foreground">
              {investor.purchase_flat_details || 'No flat details specified'}
            </p>
            {investor.rent_amount && (
              <p className="text-xs text-muted-foreground">
                Current / Expected Rent:{' '}
                <span className="font-semibold text-emerald-400">
                  ₹{investor.rent_amount.toLocaleString('en-IN')}/mo
                </span>
              </p>
            )}
          </div>

          {/* Agreement Information */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calendar className="size-4 text-primary" />
                Agreement Schedule & Terms
              </span>
              {targetDateStr && (
                <span className="text-xs text-muted-foreground">
                  Ends on {targetDateStr}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Start Date:</span>{' '}
                <span className="font-medium">
                  {investor.agreement_start_date || investor.rent_start_date || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">End Date:</span>{' '}
                <span className="font-medium">{targetDateStr || 'N/A'}</span>
              </div>
            </div>

            {investor.agreement_details && (
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground block mb-0.5">Terms:</span>
                <p className="rounded bg-card p-2 text-muted-foreground border border-border">
                  {investor.agreement_details}
                </p>
              </div>
            )}
          </div>

          {/* Quick WhatsApp Notification */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <MessageSquare className="size-3.5 text-emerald-400" />
                WhatsApp Agreement Notification
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Notify investor that agreement is ending and you are actively looking for new tenants.
              </p>
            </div>
            <Button
              size="sm"
              onClick={openWhatsApp}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 text-xs"
            >
              <MessageSquare className="size-3.5 mr-1" />
              Send on WhatsApp
            </Button>
          </div>

          {/* Linked Clients */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="size-3.5" />
              Linked Tenant / Clients ({linkedClients.length})
            </h4>
            {linkedClients.length === 0 ? (
              <p className="text-xs text-muted-foreground italic rounded-lg border border-dashed border-border p-3 text-center">
                No active clients linked to this investor yet. Link clients in the Client tab.
              </p>
            ) : (
              <div className="space-y-1.5">
                {linkedClients.map((cl) => (
                  <div
                    key={cl.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{cl.name}</p>
                      <p className="text-muted-foreground">{cl.phone}</p>
                    </div>
                    <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium text-[10px]">
                      {cl.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {investor.notes && (
            <div className="text-xs space-y-1">
              <span className="text-muted-foreground">Notes:</span>
              <p className="text-foreground bg-muted/40 p-2 rounded border border-border">
                {investor.notes}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
