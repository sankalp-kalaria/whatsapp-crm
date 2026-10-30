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
import { Loader2, Landmark, Building, Calendar, Phone, Mail, MapPin } from 'lucide-react';
import type { Investor, InvestorRentalStatus } from '@/types';
import { useAuth } from '@/hooks/use-auth';

interface InvestorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investor?: Investor | null;
  onSaved: () => void;
}

export function InvestorForm({
  open,
  onOpenChange,
  investor,
  onSaved,
}: InvestorFormProps) {
  const supabase = createClient();
  const { accountId } = useAuth();

  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [purchaseFlatDetails, setPurchaseFlatDetails] = useState('');
  const [rentalStatus, setRentalStatus] = useState<InvestorRentalStatus>('pending_for_rent');
  const [rentAmount, setRentAmount] = useState<string>('');
  const [rentStartDate, setRentStartDate] = useState('');
  const [rentEndDate, setRentEndDate] = useState('');
  const [agreementDetails, setAgreementDetails] = useState('');
  const [agreementStartDate, setAgreementStartDate] = useState('');
  const [agreementEndDate, setAgreementEndDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (investor) {
      setName(investor.name || '');
      setPhone(investor.phone || '');
      setEmail(investor.email || '');
      setAddress(investor.address || '');
      setPurchaseFlatDetails(investor.purchase_flat_details || '');
      setRentalStatus(investor.rental_status || 'pending_for_rent');
      setRentAmount(investor.rent_amount ? String(investor.rent_amount) : '');
      setRentStartDate(investor.rent_start_date || '');
      setRentEndDate(investor.rent_end_date || '');
      setAgreementDetails(investor.agreement_details || '');
      setAgreementStartDate(investor.agreement_start_date || '');
      setAgreementEndDate(investor.agreement_end_date || '');
      setNotes(investor.notes || '');
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setPurchaseFlatDetails('');
      setRentalStatus('pending_for_rent');
      setRentAmount('');
      setRentStartDate('');
      setRentEndDate('');
      setAgreementDetails('');
      setAgreementStartDate('');
      setAgreementEndDate('');
      setNotes('');
    }
  }, [investor, open]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Investor name is required');
      return;
    }
    if (!phone.trim()) {
      toast.error('Investor phone number is required');
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
      purchase_flat_details: purchaseFlatDetails.trim() || null,
      rental_status: rentalStatus,
      rent_amount: rentAmount ? parseFloat(rentAmount) : null,
      rent_start_date: rentStartDate || null,
      rent_end_date: rentEndDate || null,
      agreement_details: agreementDetails.trim() || null,
      agreement_start_date: agreementStartDate || null,
      agreement_end_date: agreementEndDate || null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (investor) {
      const res = await supabase
        .from('investors')
        .update(payload)
        .eq('id', investor.id);
      error = res.error;
    } else {
      const res = await supabase.from('investors').insert(payload);
      error = res.error;
    }

    setSaving(false);

    if (error) {
      toast.error(`Failed to save investor: ${error.message}`);
    } else {
      toast.success(
        investor ? 'Investor updated successfully' : 'Investor added successfully'
      );
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
              <Landmark className="size-5" />
            </div>
            {investor ? 'Edit Investor (Flat Owner) Details' : 'Add New Investor (Flat Owner)'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm mt-1">
            Capture flat purchase details, rental status, and agreement expiry dates for automated tracking and notifications.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Personal & Contact Information */}
          <div className="rounded-xl border border-border/80 bg-muted/15 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Landmark className="size-4 text-primary" />
                Owner Contact & Status
              </span>
              <span className="text-xs text-muted-foreground">Required fields marked with *</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Investor Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Shah"
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
                  placeholder="e.g. +91 9876543210"
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
                  placeholder="e.g. ramesh@example.com"
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Rental Status</Label>
                <Select
                  value={rentalStatus}
                  onValueChange={(val) => {
                    if (val) setRentalStatus(val as InvestorRentalStatus);
                  }}
                >
                  <SelectTrigger className="h-10 text-sm w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending_for_rent">Pending for Rent</SelectItem>
                    <SelectItem value="rented">Rented</SelectItem>
                    <SelectItem value="vacant">Vacant</SelectItem>
                    <SelectItem value="self_occupied">Self Occupied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground" />
                Investor Residence Address
              </Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. B-12, Royal Palms, Satellite, Ahmedabad"
                className="h-10 text-sm"
              />
            </div>
          </div>

          {/* Section 2: Property / Flat Details */}
          <div className="rounded-xl border border-border/80 bg-muted/15 p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b border-border/60 pb-2.5">
              <Building className="size-4 text-primary" />
              Purchase Flat & Rental Details
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Flat / Unit Specification (Wing, Flat No, Building Name, Area)
              </Label>
              <Input
                value={purchaseFlatDetails}
                onChange={(e) => setPurchaseFlatDetails(e.target.value)}
                placeholder="e.g. Flat 502, Tower C, Godrej Garden City (3 BHK, 1450 sqft)"
                className="h-10 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Expected / Rent Amount (₹)</Label>
                <Input
                  type="number"
                  value={rentAmount}
                  onChange={(e) => setRentAmount(e.target.value)}
                  placeholder="e.g. 25000"
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  Rent Start Date
                </Label>
                <Input
                  type="date"
                  value={rentStartDate}
                  onChange={(e) => setRentStartDate(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-muted-foreground" />
                  Rent End Date
                </Label>
                <Input
                  type="date"
                  value={rentEndDate}
                  onChange={(e) => setRentEndDate(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Agreement Tracking */}
          <div className="rounded-xl border border-border/80 bg-muted/15 p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calendar className="size-4 text-primary" />
                Agreement & Notification Tracking
              </span>
              <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-xs text-amber-400 font-medium">
                1-Month Auto Expiry Alert
              </span>
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

            <div className="space-y-2">
              <Label className="text-sm font-medium">Agreement Details & Terms</Label>
              <Textarea
                rows={3}
                value={agreementDetails}
                onChange={(e) => setAgreementDetails(e.target.value)}
                placeholder="e.g. 11 months registered agreement, 2 months deposit held, 10% annual escalation."
                className="text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Internal Notes & Preferences</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific preference or contact notes..."
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
              {investor ? 'Update Investor' : 'Save Investor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
