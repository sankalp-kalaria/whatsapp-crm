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
  UserCheck,
  CreditCard,
  Building,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Clock,
  MessageSquare,
  Landmark,
  ShieldCheck,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import type { Client, Investor } from '@/types';

interface ClientDetailViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  onEdit: (client: Client) => void;
}

export function ClientDetailView({
  open,
  onOpenChange,
  clientId,
  onEdit,
}: ClientDetailViewProps) {
  const supabase = createClient();
  const [client, setClient] = useState<Client | null>(null);
  const [investor, setInvestor] = useState<Investor | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId || !open) return;
    setLoading(true);

    async function load() {
      const { data: cl } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();

      setClient(cl);

      if (cl?.investor_id) {
        const { data: inv } = await supabase
          .from('investors')
          .select('*')
          .eq('id', cl.investor_id)
          .maybeSingle();
        setInvestor(inv);
      } else {
        setInvestor(null);
      }
      setLoading(false);
    }

    load();
  }, [clientId, open, supabase]);

  if (!client) return null;

  // Calculate agreement countdown
  const today = new Date();
  let daysRemaining: number | null = null;
  let isExpired = false;
  let isExpiringSoon = false;

  if (client.agreement_end_date) {
    const targetDate = new Date(client.agreement_end_date);
    const diffTime = targetDate.getTime() - today.getTime();
    daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    isExpired = daysRemaining < 0;
    isExpiringSoon = daysRemaining >= 0 && daysRemaining <= 30;
  }

  const clientMsg = isExpired
    ? `Hello ${client.name}, your tenancy agreement ended on ${client.agreement_end_date}. Please contact us regarding agreement renewal or move-out formalities.`
    : `Hello ${client.name}, gentle reminder that your tenancy agreement will expire in ${daysRemaining} days on ${client.agreement_end_date}. Please let us know if you wish to renew.`;

  function openWhatsApp(phone: string, msg: string) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground p-6 sm:p-8 gap-5">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2.5 text-2xl font-bold">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <UserCheck className="size-5" />
              </div>
              {client.name}
            </DialogTitle>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onEdit(client);
              }}
              className="text-xs font-semibold"
            >
              <Pencil className="size-3.5 mr-1.5" />
              Edit Client Details
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Status Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                client.status === 'active' || client.status === 'agreement_signed'
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : client.status === 'in_process'
                  ? 'border border-blue-500/30 bg-blue-500/10 text-blue-400'
                  : 'border border-red-500/30 bg-red-500/10 text-red-400'
              }`}
            >
              {client.status.replace(/_/g, ' ')}
            </span>

            {client.agreement_end_date && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold flex items-center gap-1 ${
                  isExpired
                    ? 'border border-red-500/30 bg-red-500/10 text-red-400'
                    : isExpiringSoon
                    ? 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : 'border border-border bg-muted text-foreground'
                }`}
              >
                {isExpired ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
                {isExpired
                  ? `Expired (${Math.abs(daysRemaining || 0)}d ago)`
                  : isExpiringSoon
                  ? `Expires in ${daysRemaining} days`
                  : `Active (${daysRemaining} days left)`}
              </span>
            )}
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="space-y-1 text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Phone className="size-3" /> Phone Number
              </span>
              <p className="font-semibold text-foreground">{client.phone}</p>
            </div>
            {client.email && (
              <div className="space-y-1 text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Mail className="size-3" /> Email Address
                </span>
                <p className="font-semibold text-foreground">{client.email}</p>
              </div>
            )}
            {client.address && (
              <div className="space-y-1 text-xs sm:col-span-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="size-3" /> Client Address
                </span>
                <p className="text-foreground">{client.address}</p>
              </div>
            )}
          </div>

          {/* ID Proof Card */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck className="size-4 text-emerald-400" />
                Identity Proof ({client.id_proof_type || 'Aadhar Card'})
              </span>
              <span className="text-[11px] rounded bg-emerald-500/10 text-emerald-400 px-2 py-0.5 font-medium">
                KYC Document
              </span>
            </div>
            <div className="text-xs space-y-1">
              <p className="font-mono text-sm font-semibold text-foreground">
                {client.id_proof_number || 'No ID proof number recorded'}
              </p>
              {client.id_proof_details && (
                <p className="text-muted-foreground">{client.id_proof_details}</p>
              )}
            </div>
          </div>

          {/* Linked Investor (Flat Owner) */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Landmark className="size-4 text-primary" />
                Linked Flat Owner (Investor)
              </span>
              {investor && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    openWhatsApp(
                      investor.phone,
                      `Hello ${investor.name}, regarding your tenant ${client.name} at ${investor.purchase_flat_details || 'your flat'}.`
                    )
                  }
                  className="h-7 text-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                >
                  <MessageSquare className="size-3 mr-1" />
                  Chat Owner
                </Button>
              )}
            </div>

            {investor ? (
              <div className="rounded-lg border border-border bg-card p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-foreground">{investor.name}</span>
                  <span className="font-mono text-muted-foreground">{investor.phone}</span>
                </div>
                <p className="text-muted-foreground">
                  Flat: <span className="text-foreground font-medium">{investor.purchase_flat_details || 'N/A'}</span>
                </p>
                {investor.address && (
                  <p className="text-muted-foreground">Owner Address: {investor.address}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No investor linked to this client yet. Click Edit to link with a flat owner.
              </p>
            )}
          </div>

          {/* Agreement & Financials */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calendar className="size-4 text-primary" />
                Agreement Schedule & Financials
              </span>
              {client.agreement_end_date && (
                <span className="text-xs text-muted-foreground">
                  Ends on {client.agreement_end_date}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
              <div>
                <span className="text-muted-foreground block">Start Date:</span>
                <span className="font-medium text-foreground">{client.agreement_start_date || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">End Date:</span>
                <span className="font-medium text-foreground">{client.agreement_end_date || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Monthly Rent:</span>
                <span className="font-bold text-emerald-400">
                  {client.rent_amount ? `₹${client.rent_amount.toLocaleString('en-IN')}` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block">Deposit:</span>
                <span className="font-medium text-foreground">
                  {client.deposit_amount ? `₹${client.deposit_amount.toLocaleString('en-IN')}` : 'N/A'}
                </span>
              </div>
            </div>

            {client.agreement_details && (
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground block mb-0.5">Agreement Terms:</span>
                <p className="rounded bg-card p-2 text-muted-foreground border border-border">
                  {client.agreement_details}
                </p>
              </div>
            )}
          </div>

          {/* Quick WhatsApp Notification */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <MessageSquare className="size-3.5 text-emerald-400" />
                WhatsApp Client Communication
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Reach out to client directly on WhatsApp regarding rent, agreement, or tenancy queries.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => openWhatsApp(client.phone, clientMsg)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 text-xs"
            >
              <MessageSquare className="size-3.5 mr-1" />
              Chat on WhatsApp
            </Button>
          </div>

          {client.notes && (
            <div className="text-xs space-y-1">
              <span className="text-muted-foreground">Notes:</span>
              <p className="text-foreground bg-muted/40 p-2 rounded border border-border">
                {client.notes}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
