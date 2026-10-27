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
  Building,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Landmark,
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
      onOpenChange(false);
      onSaved();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <UserCheck className="size-5 text-primary" />
            {client ? 'Edit Client Details' : 'Add New Client (Tenant / Buyer)'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Capture tenant credentials, Aadhar/PAN ID proofs, linked flat owner (investor), and agreement schedule.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-2">
          {/* Identity & Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Client Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Vikram Verma"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Phone className="size-3 text-muted-foreground" />
                Phone Number <span className="text-destructive">*</span>
              </Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 9988776655"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Mail className="size-3 text-muted-foreground" />
                Email Address
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. vikram@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Client Status</Label>
              <Select
                value={status}
                onValueChange={(val) => {
                  if (val) setStatus(val as ClientStatus);
                }}
              >
                <SelectTrigger>
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

          {/* ID Proof Section */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CreditCard className="size-4 text-primary" />
              Identity Proof & KYC Details
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Proof Document Type</Label>
                <Select
                  value={idProofType}
                  onValueChange={(val) => {
                    if (val) setIdProofType(val);
                  }}
                >
                  <SelectTrigger>
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
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Document / Card Number</Label>
                <Input
                  value={idProofNumber}
                  onChange={(e) => setIdProofNumber(e.target.value)}
                  placeholder="e.g. 1234 5678 9012 (Aadhar) or ABCDE1234F (PAN)"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Document Details / Verification Notes</Label>
              <Input
                value={idProofDetails}
                onChange={(e) => setIdProofDetails(e.target.value)}
                placeholder="e.g. Verified original physical card, signed copy on file"
              />
            </div>
          </div>

          {/* Linked Investor (Flat Owner) */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Landmark className="size-4 text-primary" />
              Linked Investor (Flat Owner)
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Select Owner & Flat
              </Label>
              <Select
                value={investorId}
                onValueChange={(val) => {
                  if (val) setInvestorId(val);
                }}
              >
                <SelectTrigger>
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
              <p className="text-[11px] text-muted-foreground">
                Associating this client with an investor allows tracking tenant-owner relationships and agreement renewals.
              </p>
            </div>
          </div>

          {/* Agreement & Financials */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Calendar className="size-4 text-primary" />
              Agreement & Tenancy Schedule
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Agreement Start Date</Label>
                <Input
                  type="date"
                  value={agreementStartDate}
                  onChange={(e) => setAgreementStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Agreement End Date</Label>
                <Input
                  type="date"
                  value={agreementEndDate}
                  onChange={(e) => setAgreementEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Monthly Rent (₹)</Label>
                <Input
                  type="number"
                  value={rentAmount}
                  onChange={(e) => setRentAmount(e.target.value)}
                  placeholder="e.g. 20000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Security Deposit Held (₹)</Label>
                <Input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="e.g. 50000"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Agreement Terms & Details</Label>
              <Textarea
                rows={2}
                value={agreementDetails}
                onChange={(e) => setAgreementDetails(e.target.value)}
                placeholder="e.g. Registered rent agreement with lock-in period of 6 months."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <MapPin className="size-3 text-muted-foreground" />
              Client Permanent Address
            </Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 104, Sunrise Residency, Vadodara, Gujarat"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes & Remarks</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Remarks regarding tenant references, family members, or move-in details..."
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
              {client ? 'Update Client' : 'Save Client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
