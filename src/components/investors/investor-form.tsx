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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Landmark className="size-5 text-primary" />
            {investor ? 'Edit Investor Details' : 'Add New Investor (Flat Owner)'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Capture flat purchase details, rental status, and agreement expiry dates for automated tracking and notifications.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 pt-2">
          {/* Personal Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Investor Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Shah"
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
                placeholder="e.g. +91 9876543210"
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
                placeholder="e.g. ramesh@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Rental Status</Label>
              <Select
                value={rentalStatus}
                onValueChange={(val) => {
                  if (val) setRentalStatus(val as InvestorRentalStatus);
                }}
              >
                <SelectTrigger>
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

          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1">
              <MapPin className="size-3 text-muted-foreground" />
              Investor Residence Address
            </Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. B-12, Royal Palms, Satellite, Ahmedabad"
            />
          </div>

          {/* Property / Flat Details */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building className="size-4 text-primary" />
              Purchase Flat Details
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                Flat / Unit Specification
              </Label>
              <Input
                value={purchaseFlatDetails}
                onChange={(e) => setPurchaseFlatDetails(e.target.value)}
                placeholder="e.g. Flat 502, Tower C, Godrej Garden City (3 BHK, 1450 sqft)"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Expected / Rent Amount (₹)</Label>
                <Input
                  type="number"
                  value={rentAmount}
                  onChange={(e) => setRentAmount(e.target.value)}
                  placeholder="e.g. 25000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Calendar className="size-3 text-muted-foreground" />
                  Rent Start Date
                </Label>
                <Input
                  type="date"
                  value={rentStartDate}
                  onChange={(e) => setRentStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Calendar className="size-3 text-muted-foreground" />
                  Rent End Date
                </Label>
                <Input
                  type="date"
                  value={rentEndDate}
                  onChange={(e) => setRentEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Agreement Tracking */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calendar className="size-4 text-primary" />
                Agreement & Notification Tracking
              </span>
              <span className="text-[11px] text-amber-500 font-medium">
                1-Month Auto Alert
              </span>
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

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Agreement Details & Terms</Label>
              <Textarea
                rows={2}
                value={agreementDetails}
                onChange={(e) => setAgreementDetails(e.target.value)}
                placeholder="e.g. 11 months registered agreement, 2 months deposit held, 10% annual escalation."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Internal Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific preference or contact notes..."
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
              {investor ? 'Update Investor' : 'Save Investor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
