'use client';

import { useState, useEffect } from 'react';
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
  UserCheck,
  CreditCard,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Landmark,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import type { Client, ClientStatus, Investor } from '@/types';
import { useAuth } from '@/hooks/use-auth';

interface ClientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
  onSaved: () => void;
}

export function ClientForm({
  open,
  onOpenChange,
  client,
  onSaved,
}: ClientFormProps) {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [saving, setSaving] = useState(false);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loadingInvestors, setLoadingInvestors] = useState(false);
  const [autoFilledFromInvestor, setAutoFilledFromInvestor] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [idProofType, setIdProofType] = useState('Aadhar Card');
  const [idProofNumber, setIdProofNumber] = useState('');
  const [idProofDetails, setIdProofDetails] = useState('');
  const [investorId, setInvestorId] = useState<string>('none');
  const [agreementDetails, setAgreementDetails] = useState('');
  const [agreementStartDate, setAgreementStartDate] = useState('');
  const [agreementEndDate, setAgreementEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [status, setStatus] = useState<ClientStatus>('active');
  const [notes, setNotes] = useState('');

  // Fetch investors for dropdown
  useEffect(() => {
    if (!open || !accountId) return;
    setLoadingInvestors(true);
    async function loadInvestors() {
      const { data } = await supabase
        .from('investors')
        .select('*')
        .eq('account_id', accountId)
        .order('name');
      setInvestors((data as Investor[]) || []);
      setLoadingInvestors(false);
    }
    loadInvestors();
  }, [open, accountId, supabase]);

  useEffect(() => {
    // Reset auto-fill indicator whenever the form opens/changes
    setAutoFilledFromInvestor(false);

    if (client) {
      setName(client.name || '');
      setPhone(client.phone || '');
      setEmail(client.email || '');
      setAddress(client.address || '');
      setIdProofType(client.id_proof_type || 'Aadhar Card');
      setIdProofNumber(client.id_proof_number || '');
      setIdProofDetails(client.id_proof_details || '');
      setInvestorId(client.investor_id || 'none');
      setAgreementDetails(client.agreement_details || '');
      setAgreementStartDate(client.agreement_start_date || '');
      setAgreementEndDate(client.agreement_end_date || '');
      setRentAmount(client.rent_amount ? String(client.rent_amount) : '');
      setDepositAmount(client.deposit_amount ? String(client.deposit_amount) : '');
      setStatus(client.status || 'active');
      setNotes(client.notes || '');
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setIdProofType('Aadhar Card');
      setIdProofNumber('');
      setIdProofDetails('');
      setInvestorId('none');
      setAgreementDetails('');
      setAgreementStartDate('');
      setAgreementEndDate('');
      setRentAmount('');
      setDepositAmount('');
      setStatus('active');
      setNotes('');
    }
  }, [client, open]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Client name is required');
      return;
    }
    if (!phone.trim()) {
      toast.error('Client phone number is required');
      return;
    }
    if (!accountId) {
      toast.error('Account not loaded');
      return;
    }

    setSaving(true);

    const payload = {
      account_id: accountId,
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      address: address.trim() || null,
      id_proof_type: idProofType || 'Aadhar Card',
      id_proof_number: idProofNumber.trim() || null,
      id_proof_details: idProofDetails.trim() || null,
      investor_id: investorId && investorId !== 'none' ? investorId : null,
      agreement_details: agreementDetails.trim() || null,
      agreement_start_date: agreementStartDate || null,
      agreement_end_date: agreementEndDate || null,
      rent_amount: rentAmount ? parseFloat(rentAmount) : null,
      deposit_amount: depositAmount ? parseFloat(depositAmount) : null,
      status,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (client) {
      const res = await supabase
        .from('clients')
        .update(payload)
        .eq('id', client.id);
      error = res.error;
    } else {
      const res = await supabase.from('clients').insert(payload);
      error = res.error;
    }

    setSaving(false);

    if (error) {
      toast.error(`Failed to save client: ${error.message}`);
    } else {
      toast.success(client ? 'Client updated successfully' : 'Client added successfully');

      // If investor linked and agreement end date set, prompt WhatsApp notifications for both parties
      const linkedInvestor =
        investorId && investorId !== 'none'
          ? investors.find((inv) => inv.id === investorId)
          : null;

      if (linkedInvestor && agreementEndDate) {
        const today = new Date();
        const targetDate = new Date(agreementEndDate);
        const diffTime = targetDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const isExpired = daysRemaining < 0;
        const flatDetails = linkedInvestor.purchase_flat_details || 'your flat';

        const clientMsg = isExpired
          ? `Hello ${name.trim()}, your tenancy agreement for ${flatDetails} ended on ${agreementEndDate}. Please contact us regarding agreement renewal or move-out formalities.`
          : `Hello ${name.trim()}, gentle reminder that your tenancy agreement for ${flatDetails} is due to expire in ${daysRemaining} days on ${agreementEndDate}. Please let us know if you wish to renew.`;

        const investorMsg = isExpired
          ? `Hello ${linkedInvestor.name}, the tenancy agreement for ${flatDetails} with your tenant has ended on ${agreementEndDate}. We are assisting with renewal or finding a new tenant.`
          : `Hello ${linkedInvestor.name}, your tenant's agreement for ${flatDetails} is expiring in ${daysRemaining} days on ${agreementEndDate}. We will assist with renewal or re-listing if needed.`;

        const cleanClientPhone = phone.trim().replace(/[^0-9]/g, '');
        const cleanInvestorPhone = linkedInvestor.phone.replace(/[^0-9]/g, '');

        // Show toast actions to open WhatsApp for both parties
        toast(
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Agreement linked! Notify parties on WhatsApp?</p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() =>
                  window.open(
                    `https://wa.me/${cleanClientPhone}?text=${encodeURIComponent(clientMsg)}`,
                    '_blank'
                  )
                }
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded px-2 py-1 text-left"
              >
                💬 Notify Client ({name.trim()})
              </button>
              <button
                onClick={() =>
                  window.open(
                    `https://wa.me/${cleanInvestorPhone}?text=${encodeURIComponent(investorMsg)}`,
                    '_blank'
                  )
                }
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded px-2 py-1 text-left"
              >
                💬 Notify Investor ({linkedInvestor.name})
              </button>
            </div>
          </div>,
          { duration: 12000 }
        );
      }

      onOpenChange(false);
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl sm:max-w-4xl max-h-[92vh] overflow-y-auto bg-card border-border text-foreground p-6 sm:p-8 gap-6">
        <DialogHeader className="border-b border-border pb-4">
          <DialogTitle className="flex items-center gap-2.5 text-2xl font-bold">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <UserCheck className="size-5" />
            </div>
            {client ? 'Edit Client (Tenant / Buyer) Details' : 'Add New Client (Tenant / Buyer)'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm mt-1">
            Capture tenant credentials, Aadhar/PAN ID proofs, linked flat owner (investor), and agreement schedule.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Identity & Contact */}
          <div className="rounded-xl border border-border/80 bg-muted/15 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <UserCheck className="size-4 text-primary" />
                Client Contact & Tenancy Status
              </span>
              <span className="text-xs text-muted-foreground">Required fields marked with *</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Client Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Vikram Verma"
                  className="h-10 text-sm"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Phone className="size-3.5 text-muted-foreground" />
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 9988776655"
                  className="h-10 text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Mail className="size-3.5 text-muted-foreground" />
                  Email Address
                </Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. vikram@example.com"
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Client Status</Label>
                <Select
                  value={status}
                  onValueChange={(val) => {
                    if (val) setStatus(val as ClientStatus);
                  }}
                >
                  <SelectTrigger className="h-10 text-sm w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="in_process">In Process</SelectItem>
                    <SelectItem value="agreement_signed">Agreement Signed</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground" />
                Client Permanent Address
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 104, Sunrise Residency, Vadodara, Gujarat"
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Section 2: ID Proof & KYC */}
          <div className="rounded-xl border border-border/80 bg-muted/15 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border/60 pb-2.5">
              <CreditCard className="size-4 text-primary" />
              Identity Proof & KYC Details
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Proof Document Type</Label>
                <Select
                  value={idProofType}
                  onValueChange={(val) => {
                    if (val) setIdProofType(val);
                  }}
                >
                  <SelectTrigger className="h-10 text-sm w-full">
                    <SelectValue placeholder="Select ID Proof" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aadhar Card">Aadhar Card</SelectItem>
                    <SelectItem value="PAN Card">PAN Card</SelectItem>
                    <SelectItem value="Passport">Passport</SelectItem>
                    <SelectItem value="Driving License">Driving License</SelectItem>
                    <SelectItem value="Voter ID">Voter ID</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Document / Card Number</Label>
                <Input
                  value={idProofNumber}
                  onChange={(e) => setIdProofNumber(e.target.value)}
                  placeholder="e.g. 1234 5678 9012 (Aadhar) or ABCDE1234F (PAN)"
                  className="h-10 text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Document Details / Verification Notes</Label>
              <Input
                value={idProofDetails}
                onChange={(e) => setIdProofDetails(e.target.value)}
                placeholder="e.g. Verified original physical card, signed copy on file"
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Section 3: Linked Investor (Flat Owner) */}
          <div className="rounded-xl border border-border/80 bg-muted/15 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border/60 pb-2.5">
              <Landmark className="size-4 text-primary" />
              Linked Investor (Flat Owner & Unit)
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Select Owner & Flat
              </Label>
              <Select
                value={investorId}
                onValueChange={(val) => {
                  if (!val) return;
                  setInvestorId(val);
                  // Auto-fill agreement details from selected investor
                  if (val !== 'none') {
                    const selectedInvestor = investors.find((inv) => inv.id === val);
                    if (selectedInvestor) {
                      // Only overwrite blank fields so manual entries are preserved
                      if (!agreementStartDate && selectedInvestor.agreement_start_date) {
                        setAgreementStartDate(selectedInvestor.agreement_start_date);
                      }
                      if (!agreementEndDate && selectedInvestor.agreement_end_date) {
                        setAgreementEndDate(selectedInvestor.agreement_end_date);
                      }
                      if (!rentAmount && selectedInvestor.rent_amount) {
                        setRentAmount(String(selectedInvestor.rent_amount));
                      }
                      if (!agreementDetails && selectedInvestor.agreement_details) {
                        setAgreementDetails(selectedInvestor.agreement_details);
                      }
                      setAutoFilledFromInvestor(true);
                    }
                  } else {
                    setAutoFilledFromInvestor(false);
                  }
                }}
              >
                <SelectTrigger className="h-10 text-sm w-full">
                  <SelectValue
                    placeholder={loadingInvestors ? 'Loading investors...' : 'Choose Investor'}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / Not Linked Yet</SelectItem>
                  {investors.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.name} — {inv.purchase_flat_details || 'Flat'} ({inv.phone})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {autoFilledFromInvestor && (
                <p className="text-xs flex items-center gap-1.5 text-emerald-400 font-medium pt-1">
                  <Sparkles className="size-3.5" />
                  Agreement details auto-filled from investor record. You can still edit them below.
                </p>
              )}
              {!autoFilledFromInvestor && (
                <p className="text-xs text-muted-foreground pt-1">
                  Associating this client with an investor allows tracking tenant-owner relationships and agreement renewals.
                </p>
              )}
            </div>
          </div>

          {/* Section 4: Agreement & Financials */}
          <div className={`rounded-xl border p-4 sm:p-5 space-y-4 transition-colors ${
            autoFilledFromInvestor
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-border/80 bg-muted/15'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calendar className="size-4 text-primary" />
                Agreement & Tenancy Schedule
              </div>
              {autoFilledFromInvestor && (
                <span className="text-xs flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-0.5 font-semibold">
                  <Sparkles className="size-3" />
                  Auto-filled
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Agreement Start Date</Label>
                <Input
                  type="date"
                  value={agreementStartDate}
                  onChange={(e) => setAgreementStartDate(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Agreement End Date</Label>
                <Input
                  type="date"
                  value={agreementEndDate}
                  onChange={(e) => setAgreementEndDate(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Monthly Rent (₹)</Label>
                <Input
                  type="number"
                  value={rentAmount}
                  onChange={(e) => setRentAmount(e.target.value)}
                  placeholder="e.g. 20000"
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Security Deposit Held (₹)</Label>
                <Input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Agreement Terms & Details</Label>
              <Textarea
                rows={3}
                value={agreementDetails}
                onChange={(e) => setAgreementDetails(e.target.value)}
                placeholder="e.g. Registered rent agreement with lock-in period of 6 months."
                className="text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Notes & Remarks</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remarks regarding tenant references, family members, or move-in details..."
              className="text-sm"
            />
          </div>

          <DialogFooter className="gap-3 pt-4 border-t border-border -mx-6 -mb-6 sm:-mx-8 sm:-mb-8 px-6 py-4 sm:px-8">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={saving} className="min-w-[160px]">
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              {client ? 'Update Client' : 'Save Client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
