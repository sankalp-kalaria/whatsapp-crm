'use strict';
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  Calendar,
  Clock,
  Home,
  Tag,
  Phone,
  User,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Search,
  Filter,
  Loader2,
  CalendarCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface SiteVisit {
  id: string;
  account_id: string;
  contact_id?: string;
  conversation_id?: string;
  visit_date: string;
  visit_time: string;
  configuration?: string;
  budget_range?: string;
  client_name?: string;
  client_phone?: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled';
  notes?: string;
  created_at: string;
}

export function SiteVisitsView() {
  const supabase = createClient();
  const [visits, setVisits] = useState<SiteVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const loadVisits = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('site_visits')
        .select('*')
        .order('visit_date', { ascending: true })
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (search.trim()) {
        query = query.or(
          `client_name.ilike.%${search}%,client_phone.ilike.%${search}%,configuration.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      setVisits(data || []);
    } catch (err: unknown) {
      console.error('Error fetching site visits:', err);
      toast.error('Failed to load site visits');
    } finally {
      setLoading(false);
    }
  }, [supabase, statusFilter, search]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  const updateStatus = async (id: string, newStatus: SiteVisit['status']) => {
    try {
      const { error } = await supabase
        .from('site_visits')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      toast.success(`Visit marked as ${newStatus}`);
      setVisits((prev) =>
        prev.map((v) => (v.id === id ? { ...v, status: newStatus } : v))
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Status update failed');
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by client, phone, or BHK..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'scheduled', 'confirmed', 'completed', 'cancelled'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize cursor-pointer transition ${
                statusFilter === tab
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Visits List */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : visits.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 px-4 text-center">
          <CalendarCheck className="h-10 w-10 text-muted-foreground/60 mb-2" />
          <p className="text-sm font-semibold text-foreground">No Site Visits Found</p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">
            Site visits booked by clients via WhatsApp or the Calendar link will show up here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {visits.map((visit) => {
            const isScheduled = visit.status === 'scheduled';
            const isConfirmed = visit.status === 'confirmed';
            const isCompleted = visit.status === 'completed';
            const isCancelled = visit.status === 'cancelled';

            return (
              <div
                key={visit.id}
                className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  {/* Status & Date */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                        isConfirmed
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : isScheduled
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : isCompleted
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {visit.status}
                    </span>

                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      {visit.visit_date}
                    </div>
                  </div>

                  {/* Client Info */}
                  <div className="space-y-1 mb-3">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {visit.client_name || 'Client'}
                    </div>

                    {visit.client_phone && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />
                          {visit.client_phone}
                        </span>

                        <a
                          href={`https://wa.me/${visit.client_phone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          <MessageSquare className="h-3 w-3" /> WhatsApp
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Preferences */}
                  <div className="rounded-lg border border-border/80 bg-muted/40 p-2.5 space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3 text-primary" /> Time:
                      </span>
                      <span className="font-semibold text-foreground">{visit.visit_time}</span>
                    </div>

                    {visit.configuration && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Home className="h-3 w-3 text-primary" /> Config:
                        </span>
                        <span className="font-semibold text-primary">{visit.configuration}</span>
                      </div>
                    )}

                    {visit.budget_range && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Tag className="h-3 w-3 text-primary" /> Budget:
                        </span>
                        <span className="font-medium text-foreground">{visit.budget_range}</span>
                      </div>
                    )}

                    {visit.notes && (
                      <p className="text-[11px] text-muted-foreground italic border-t border-border/60 pt-1.5 mt-1.5">
                        "{visit.notes}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 border-t border-border/60 pt-3">
                  {!isConfirmed && !isCompleted && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateStatus(visit.id, 'confirmed')}
                      className="flex-1 h-8 text-xs font-semibold border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Confirm
                    </Button>
                  )}

                  {!isCompleted && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateStatus(visit.id, 'completed')}
                      className="flex-1 h-8 text-xs font-semibold border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Complete
                    </Button>
                  )}

                  {!isCancelled && !isCompleted && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateStatus(visit.id, 'cancelled')}
                      className="h-8 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
