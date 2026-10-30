'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Filter,
  Search,
  Building2,
  IndianRupee,
  Calendar,
  MessageSquare,
  Send,
  Share2,
  UserPlus,
  Download,
  RefreshCw,
  CheckCircle2,
  Flame,
  Sparkles,
  MapPin,
  Clock,
  FileText,
  X,
  ExternalLink,
  CheckSquare,
  Square,
  Home,
  SlidersHorizontal,
  Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface LeadMessageItem {
  id: string;
  sender_type: string;
  content_type: string;
  content_text: string | null;
  interactive_reply_id?: string | null;
  created_at: string;
}

interface FilteredLeadItem {
  id: string;
  conversationId: string;
  contactId: string;
  name: string;
  phone: string;
  email?: string | null;
  unreadCount: number;
  conversationStatus: string;
  lastMessageText: string;
  lastMessageAt: string;
  createdAt: string;
  configuration: string;
  budgetRange: string;
  carpetPreference: string;
  inquiryType: string;
  leadStage: string;
  preferredLocation: string;
  possessionTimeline: string;
  followUpDate: string;
  brokerNotes: string;
  siteVisit?: {
    id?: string;
    visitDate?: string;
    visitTime?: string;
    status?: string;
    availabilityText?: string;
  } | null;
  isConvertedClient: boolean;
  clientId?: string | null;
  workflowAnswers: Record<string, string>;
  customerMessagesCount: number;
  totalMessagesCount: number;
  messages: LeadMessageItem[];
}

const CONFIGURATION_OPTIONS = [
  '1 BHK',
  '2 BHK',
  '3 BHK',
  '4+ BHK',
  'Commercial',
];

const BUDGET_FILTER_GROUPS = [
  {
    group: '1 BHK Budgets',
    options: ['65 L Below', '65L to 75 L', 'Bigger Carpet 1BHK'],
  },
  {
    group: '2 BHK Budgets',
    options: ['90 L Below', '90L to 1.05 cr', 'Bigger Carpet 2BHK'],
  },
  {
    group: '3 BHK Budgets',
    options: ['1.10 CR Below', '1.1 CR to 1.3 cr', 'Bigger Carpet 3BHK'],
  },
  {
    group: 'Special Ranges',
    options: ['Any Bigger Carpet', 'Under 75L', '75L - 1.05 Cr', 'Above 1.05 Cr'],
  },
];

const ALL_BUDGET_VALUES = [
  '65 L Below',
  '65L to 75 L',
  'Bigger Carpet 1BHK',
  '90 L Below',
  '90L to 1.05 cr',
  'Bigger Carpet 2BHK',
  '1.10 CR Below',
  '1.1 CR to 1.3 cr',
  'Bigger Carpet 3BHK',
];

const LEAD_STAGE_OPTIONS = [
  'New Inquiry',
  'Hot Lead',
  'Warm Lead',
  'Cold Lead',
  'Site Visit Scheduled',
  'Site Visit Completed',
  'Negotiation',
  'Converted',
  'Not Interested',
];

const INQUIRY_TYPE_OPTIONS = ['Buy', 'Rent', 'Sell', 'Site Visit'];

const CARPET_OPTIONS = ['Bigger Carpet', 'Standard'];

const POSSESSION_OPTIONS = [
  'Ready to Move',
  'Under Construction',
  'Near Possession (6M)',
  'Immediate',
];

function getStageBadgeClass(stage: string): string {
  switch (stage) {
    case 'Hot Lead':
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    case 'Warm Lead':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    case 'Site Visit Scheduled':
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    case 'Site Visit Completed':
      return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    case 'Negotiation':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    case 'Converted':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'Cold Lead':
    case 'Not Interested':
      return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
    default:
      return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  }
}

function getConfigBadgeClass(config: string): string {
  switch (config) {
    case '1 BHK':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case '2 BHK':
      return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    case '3 BHK':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case '4+ BHK':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    case 'Commercial':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    default:
      return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  }
}

function matchesBudgetFilter(leadBudget: string, filterVal: string): boolean {
  if (filterVal === 'ALL') return true;
  if (filterVal === 'UNSPECIFIED') return !leadBudget;
  const b = (leadBudget || '').toLowerCase();
  if (!b) return false;

  if (filterVal === 'Any Bigger Carpet') {
    return b.includes('bigger carpet');
  }
  if (filterVal === 'Under 75L') {
    return b.includes('65 l below') || b.includes('65l to 75 l');
  }
  if (filterVal === '75L - 1.05 Cr') {
    return b.includes('90 l below') || b.includes('90l to 1.05 cr');
  }
  if (filterVal === 'Above 1.05 Cr') {
    return b.includes('1.10 cr below') || b.includes('1.1 cr to 1.3 cr');
  }
  return b === filterVal.toLowerCase() || b.includes(filterVal.toLowerCase());
}

export default function FilterLeadsPage() {
  const [leads, setLeads] = useState<FilteredLeadItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Real Estate Broker Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [configFilter, setConfigFilter] = useState<string>('ALL');
  const [budgetFilter, setBudgetFilter] = useState<string>('ALL');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [inquiryTypeFilter, setInquiryTypeFilter] = useState<string>('ALL');
  const [carpetFilter, setCarpetFilter] = useState<string>('ALL');
  const [siteVisitFilter, setSiteVisitFilter] = useState<string>('ALL');
  const [dateWindowFilter, setDateWindowFilter] = useState<string>('ALL');

  // Selection for Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [forwardingBulk, setForwardingBulk] = useState(false);
  const [sendingLeadId, setSendingLeadId] = useState<string | null>(null);
  const [forwardingLeadId, setForwardingLeadId] = useState<string | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);

  // Modals
  const [chatModalLead, setChatModalLead] = useState<FilteredLeadItem | null>(
    null
  );
  const [editModalLead, setEditModalLead] = useState<FilteredLeadItem | null>(
    null
  );
  const [siteVisitModalLead, setSiteVisitModalLead] =
    useState<FilteredLeadItem | null>(null);
  const [customMsgLead, setCustomMsgLead] = useState<FilteredLeadItem | null>(
    null
  );
  const [customMsgText, setCustomMsgText] = useState('');

  // Edit Lead Form State
  const [editForm, setEditForm] = useState({
    configuration: '',
    budgetRange: '',
    leadStage: '',
    inquiryType: '',
    carpetPreference: '',
    preferredLocation: '',
    possessionTimeline: '',
    followUpDate: '',
    brokerNotes: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Site Visit Form State
  const [visitForm, setVisitForm] = useState({
    visitDate: '',
    visitTime: '11:00 AM',
    configuration: '',
    budgetRange: '',
    notes: '',
  });
  const [savingVisit, setSavingVisit] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/filter-leads');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load leads');
      }
      setLeads(data.leads ?? []);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to load inbox leads'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Filtered Leads Calculation (scans lead metadata + all inbox messages)
  const filteredLeads = useMemo(() => {
    const now = Date.now();
    return leads.filter((lead) => {
      // 1. Configuration filter (checks extracted config + raw message texts)
      if (configFilter !== 'ALL') {
        if (configFilter === 'UNSPECIFIED') {
          if (lead.configuration) return false;
        } else {
          const configMatch =
            lead.configuration.toLowerCase() === configFilter.toLowerCase() ||
            lead.messages.some((m) =>
              (m.content_text || '')
                .toLowerCase()
                .includes(configFilter.toLowerCase()) ||
              (m.content_text || '')
                .toLowerCase()
                .includes(configFilter.replace(/\s+/g, '').toLowerCase())
            );
          if (!configMatch) return false;
        }
      }

      // 2. Budget Range filter
      if (budgetFilter !== 'ALL') {
        const matched =
          matchesBudgetFilter(lead.budgetRange, budgetFilter) ||
          lead.messages.some((m) =>
            matchesBudgetFilter(m.content_text || '', budgetFilter)
          );
        if (!matched) return false;
      }

      // 3. Lead Stage filter
      if (stageFilter !== 'ALL' && lead.leadStage !== stageFilter) {
        return false;
      }

      // 4. Inquiry Type filter
      if (
        inquiryTypeFilter !== 'ALL' &&
        lead.inquiryType !== inquiryTypeFilter
      ) {
        return false;
      }

      // 5. Carpet Preference filter
      if (carpetFilter !== 'ALL') {
        if (carpetFilter === 'Bigger Carpet') {
          const isBigger =
            lead.carpetPreference === 'Bigger Carpet' ||
            lead.budgetRange.toLowerCase().includes('bigger carpet') ||
            lead.messages.some((m) =>
              (m.content_text || '').toLowerCase().includes('bigger carpet')
            );
          if (!isBigger) return false;
        } else if (lead.carpetPreference !== carpetFilter) {
          return false;
        }
      }

      // 6. Site Visit Status filter
      if (siteVisitFilter !== 'ALL') {
        if (siteVisitFilter === 'SCHEDULED' && !lead.siteVisit) return false;
        if (siteVisitFilter === 'NO_VISIT' && lead.siteVisit) return false;
        if (
          siteVisitFilter === 'COMPLETED' &&
          lead.siteVisit?.status !== 'completed' &&
          lead.leadStage !== 'Site Visit Completed'
        ) {
          return false;
        }
      }

      // 7. Date / Activity Window filter
      if (dateWindowFilter !== 'ALL') {
        if (dateWindowFilter === 'UNREAD' && lead.unreadCount <= 0) {
          return false;
        }
        const msgTime = new Date(lead.lastMessageAt).getTime();
        const diffHours = (now - msgTime) / (1000 * 60 * 60);
        if (dateWindowFilter === 'TODAY' && diffHours > 24) return false;
        if (dateWindowFilter === '7DAYS' && diffHours > 24 * 7) return false;
        if (dateWindowFilter === '30DAYS' && diffHours > 24 * 30) return false;
      }

      // 8. Keyword Search across Name, Phone, Config, Budget, Location, Notes, AND all Inbox Messages
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const inHeader =
          lead.name.toLowerCase().includes(q) ||
          lead.phone.toLowerCase().includes(q) ||
          lead.configuration.toLowerCase().includes(q) ||
          lead.budgetRange.toLowerCase().includes(q) ||
          lead.preferredLocation.toLowerCase().includes(q) ||
          lead.brokerNotes.toLowerCase().includes(q) ||
          lead.lastMessageText.toLowerCase().includes(q);
        const inMessages = lead.messages.some((m) =>
          (m.content_text || '').toLowerCase().includes(q)
        );
        const inAnswers = Object.values(lead.workflowAnswers).some((v) =>
          v.toLowerCase().includes(q)
        );
        if (!inHeader && !inMessages && !inAnswers) return false;
      }

      return true;
    });
  }, [
    leads,
    configFilter,
    budgetFilter,
    stageFilter,
    inquiryTypeFilter,
    carpetFilter,
    siteVisitFilter,
    dateWindowFilter,
    searchQuery,
  ]);

  // Broker KPI Summary Counts
  const stats = useMemo(() => {
    const count1Bhk = leads.filter((l) => l.configuration === '1 BHK').length;
    const count2Bhk = leads.filter((l) => l.configuration === '2 BHK').length;
    const count3Bhk = leads.filter((l) => l.configuration === '3 BHK').length;
    const hotCount = leads.filter((l) => l.leadStage === 'Hot Lead').length;
    const visitCount = leads.filter((l) => Boolean(l.siteVisit)).length;
    const biggerCarpetCount = leads.filter(
      (l) =>
        l.carpetPreference === 'Bigger Carpet' ||
        l.budgetRange.toLowerCase().includes('bigger carpet')
    ).length;

    return {
      total: leads.length,
      count1Bhk,
      count2Bhk,
      count3Bhk,
      hotCount,
      visitCount,
      biggerCarpetCount,
    };
  }, [leads]);

  const resetAllFilters = () => {
    setSearchQuery('');
    setConfigFilter('ALL');
    setBudgetFilter('ALL');
    setStageFilter('ALL');
    setInquiryTypeFilter('ALL');
    setCarpetFilter('ALL');
    setSiteVisitFilter('ALL');
    setDateWindowFilter('ALL');
  };

  const toggleSelectLead = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (
      filteredLeads.length > 0 &&
      filteredLeads.every((l) => selectedIds.has(l.id))
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  // Inline Quick Stage or Config Update
  const handleQuickUpdate = async (
    lead: FilteredLeadItem,
    patch: Partial<{
      configuration: string;
      budgetRange: string;
      leadStage: string;
    }>
  ) => {
    try {
      const res = await fetch('/api/filter-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_lead',
          contactId: lead.contactId,
          ...patch,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update lead');

      setLeads((prev) =>
        prev.map((item) =>
          item.id === lead.id ? { ...item, ...patch } : item
        )
      );
      toast.success(`Updated ${lead.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  // Open Full Broker Edit Modal
  const openEditModal = (lead: FilteredLeadItem) => {
    setEditModalLead(lead);
    setEditForm({
      configuration: lead.configuration || '',
      budgetRange: lead.budgetRange || '',
      leadStage: lead.leadStage || 'New Inquiry',
      inquiryType: lead.inquiryType || 'Buy',
      carpetPreference: lead.carpetPreference || '',
      preferredLocation: lead.preferredLocation || '',
      possessionTimeline: lead.possessionTimeline || '',
      followUpDate: lead.followUpDate || '',
      brokerNotes: lead.brokerNotes || '',
    });
  };

  const handleSaveEditLead = async () => {
    if (!editModalLead) return;
    setSavingEdit(true);
    try {
      const res = await fetch('/api/filter-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_lead',
          contactId: editModalLead.contactId,
          ...editForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save lead details');

      setLeads((prev) =>
        prev.map((item) =>
          item.id === editModalLead.id ? { ...item, ...editForm } : item
        )
      );
      toast.success(`Saved broker qualification for ${editModalLead.name}`);
      setEditModalLead(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingEdit(false);
    }
  };

  // Open Site Visit Modal
  const openSiteVisitModal = (lead: FilteredLeadItem) => {
    setSiteVisitModalLead(lead);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    setVisitForm({
      visitDate: lead.siteVisit?.visitDate || tomorrow,
      visitTime: lead.siteVisit?.visitTime || '11:00 AM',
      configuration: lead.configuration || '2 BHK',
      budgetRange: lead.budgetRange || '',
      notes: lead.brokerNotes || '',
    });
  };

  const handleSaveSiteVisit = async () => {
    if (!siteVisitModalLead) return;
    setSavingVisit(true);
    try {
      const res = await fetch('/api/filter-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule_site_visit',
          contactId: siteVisitModalLead.contactId,
          conversationId: siteVisitModalLead.conversationId,
          clientName: siteVisitModalLead.name,
          clientPhone: siteVisitModalLead.phone,
          ...visitForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to book site visit');

      toast.success(`Site visit scheduled for ${siteVisitModalLead.name}`);
      setSiteVisitModalLead(null);
      loadLeads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to book visit');
    } finally {
      setSavingVisit(false);
    }
  };

  // Convert Lead to Client
  const handleConvertToClient = async (lead: FilteredLeadItem) => {
    setConvertingLeadId(lead.id);
    try {
      const res = await fetch('/api/filter-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'convert_to_client',
          contactId: lead.contactId,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          configuration: lead.configuration,
          budgetRange: lead.budgetRange,
          preferredLocation: lead.preferredLocation,
          brokerNotes: lead.brokerNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to convert lead');

      setLeads((prev) =>
        prev.map((item) =>
          item.id === lead.id
            ? {
                ...item,
                isConvertedClient: true,
                clientId: data.clientId,
                leadStage: 'Converted',
              }
            : item
        )
      );
      toast.success(`${lead.name} added to Clients directory!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setConvertingLeadId(null);
    }
  };

  // Forward Single or Multiple Filtered Leads to Admin's Configured WhatsApp Number
  const handleForwardLeadsToAdmin = async (targetLeads: FilteredLeadItem[]) => {
    if (targetLeads.length === 0) {
      toast.error('No leads selected to forward');
      return;
    }
    const isSingle = targetLeads.length === 1;
    if (isSingle) setForwardingLeadId(targetLeads[0].id);
    else setForwardingBulk(true);

    try {
      const payload = targetLeads.map((l) => ({
        name: l.name,
        phone: l.phone,
        configuration: l.configuration,
        budgetRange: l.budgetRange,
        leadStage: l.leadStage,
        inquiryType: l.inquiryType,
        siteVisitText: l.siteVisit?.availabilityText || '',
        messagesPreview: l.messages
          .slice(-6)
          .map(
            (m) =>
              `[${m.sender_type === 'customer' ? 'Client' : 'Bot'}]: ${
                m.content_text || ''
              }`
          )
          .join('\n'),
      }));

      const res = await fetch('/api/filter-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'forward_to_broker',
          leads: payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to forward leads');

      toast.success(
        `Forwarded ${data.sentCount} lead(s) to admin WhatsApp (${data.recipientPhone})`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to forward to WhatsApp'
      );
    } finally {
      setForwardingLeadId(null);
      setForwardingBulk(false);
    }
  };

  // Send Direct WhatsApp Follow-Up / Notification to Lead (with 24h template fallback)
  const openSendWhatsAppModal = (lead: FilteredLeadItem) => {
    setCustomMsgLead(lead);
    const configPart = lead.configuration
      ? ` regarding your *${lead.configuration}* inquiry`
      : ' regarding your property inquiry';
    const budgetPart = lead.budgetRange
      ? ` in the *${lead.budgetRange}* range`
      : '';
    setCustomMsgText(
      `Hello *${lead.name}*, thank you for reaching out to us${configPart}${budgetPart}. We have matching properties available for a site visit. Please let us know your preferred time to connect!`
    );
  };

  const handleSendWhatsAppToLead = async () => {
    if (!customMsgLead || !customMsgText.trim()) return;
    setSendingLeadId(customMsgLead.id);
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: customMsgLead.phone,
          recipientName: customMsgLead.name,
          recipientType: 'client',
          title: `Property Follow-Up (${
            customMsgLead.configuration || 'Inquiry'
          })`,
          message: customMsgText.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send WhatsApp');

      toast.success(
        data.usedTemplate
          ? `Sent WhatsApp to ${customMsgLead.name} via approved Template (${data.templateName})`
          : `Sent WhatsApp message to ${customMsgLead.name}`
      );
      setCustomMsgLead(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSendingLeadId(null);
    }
  };

  // Export Filtered Leads to CSV
  const handleExportCsv = () => {
    if (filteredLeads.length === 0) {
      toast.error('No filtered leads to export');
      return;
    }
    const headers = [
      'Lead Name',
      'Phone',
      'Configuration',
      'Budget Range',
      'Carpet Preference',
      'Inquiry Purpose',
      'Lead Stage',
      'Preferred Location',
      'Site Visit',
      'Last Message',
      'Last Activity',
      'Broker Notes',
    ];
    const rows = filteredLeads.map((l) => [
      l.name,
      l.phone,
      l.configuration || 'Unspecified',
      l.budgetRange || 'Unspecified',
      l.carpetPreference || 'Standard',
      l.inquiryType || 'Buy',
      l.leadStage,
      l.preferredLocation || '',
      l.siteVisit?.availabilityText || 'Not Scheduled',
      (l.lastMessageText || '').replace(/\n/g, ' '),
      new Date(l.lastMessageAt).toLocaleString('en-IN'),
      (l.brokerNotes || '').replace(/\n/g, ' '),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filtered-real-estate-leads-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredLeads.length} leads to CSV`);
  };

  const selectedLeadObjects = useMemo(
    () => filteredLeads.filter((l) => selectedIds.has(l.id)),
    [filteredLeads, selectedIds]
  );

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Filter className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Filter Leads (Real Estate Broker Console)
              </h1>
              <p className="text-sm text-muted-foreground">
                Filter all Inbox leads & WhatsApp conversations by{' '}
                <span className="text-foreground font-medium">
                  1 BHK / 2 BHK / 3 BHK Configuration
                </span>
                ,{' '}
                <span className="text-foreground font-medium">
                  Budget Range
                </span>
                ,{' '}
                <span className="text-foreground font-medium">
                  Carpet Preference
                </span>
                ,{' '}
                <span className="text-foreground font-medium">Lead Stage</span>,
                and{' '}
                <span className="text-foreground font-medium">
                  Site Visit Status
                </span>
                .
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLeads}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh Inbox Leads
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={filteredLeads.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export Filtered ({filteredLeads.length})
          </Button>

          <Button
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white"
            disabled={
              forwardingBulk ||
              (selectedLeadObjects.length === 0 && filteredLeads.length === 0)
            }
            onClick={() =>
              handleForwardLeadsToAdmin(
                selectedLeadObjects.length > 0
                  ? selectedLeadObjects
                  : filteredLeads.slice(0, 10)
              )
            }
          >
            <Share2 className="h-4 w-4 mr-1.5" />
            {forwardingBulk
              ? 'Forwarding to Admin WhatsApp...'
              : selectedLeadObjects.length > 0
                ? `Forward Selected (${selectedLeadObjects.length}) to Admin WhatsApp`
                : 'Forward Top Filtered Leads to Admin'}
          </Button>
        </div>
      </div>

      {/* Quick Broker KPI Cards (Click to Filter) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <Card
          onClick={resetAllFilters}
          className={`cursor-pointer transition-all hover:border-purple-500/40 ${
            configFilter === 'ALL' &&
            budgetFilter === 'ALL' &&
            stageFilter === 'ALL'
              ? 'border-purple-500/60 bg-purple-500/5'
              : ''
          }`}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>All Inbox Leads</span>
              <MessageSquare className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>

        <Card
          onClick={() =>
            setConfigFilter(configFilter === '1 BHK' ? 'ALL' : '1 BHK')
          }
          className={`cursor-pointer transition-all hover:border-sky-500/40 ${
            configFilter === '1 BHK' ? 'border-sky-500 bg-sky-500/10' : ''
          }`}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-sky-400">
              <span>1 BHK Leads</span>
              <Home className="h-3.5 w-3.5" />
            </div>
            <p className="text-2xl font-bold mt-1">{stats.count1Bhk}</p>
          </CardContent>
        </Card>

        <Card
          onClick={() =>
            setConfigFilter(configFilter === '2 BHK' ? 'ALL' : '2 BHK')
          }
          className={`cursor-pointer transition-all hover:border-violet-500/40 ${
            configFilter === '2 BHK' ? 'border-violet-500 bg-violet-500/10' : ''
          }`}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-violet-400">
              <span>2 BHK Leads</span>
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <p className="text-2xl font-bold mt-1">{stats.count2Bhk}</p>
          </CardContent>
        </Card>

        <Card
          onClick={() =>
            setConfigFilter(configFilter === '3 BHK' ? 'ALL' : '3 BHK')
          }
          className={`cursor-pointer transition-all hover:border-amber-500/40 ${
            configFilter === '3 BHK' ? 'border-amber-500 bg-amber-500/10' : ''
          }`}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-amber-400">
              <span>3 BHK Leads</span>
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <p className="text-2xl font-bold mt-1">{stats.count3Bhk}</p>
          </CardContent>
        </Card>

        <Card
          onClick={() =>
            setCarpetFilter(
              carpetFilter === 'Bigger Carpet' ? 'ALL' : 'Bigger Carpet'
            )
          }
          className={`cursor-pointer transition-all hover:border-emerald-500/40 ${
            carpetFilter === 'Bigger Carpet'
              ? 'border-emerald-500 bg-emerald-500/10'
              : ''
          }`}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-emerald-400">
              <span>Bigger Carpet</span>
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <p className="text-2xl font-bold mt-1">{stats.biggerCarpetCount}</p>
          </CardContent>
        </Card>

        <Card
          onClick={() =>
            setStageFilter(stageFilter === 'Hot Lead' ? 'ALL' : 'Hot Lead')
          }
          className={`cursor-pointer transition-all hover:border-rose-500/40 ${
            stageFilter === 'Hot Lead' ? 'border-rose-500 bg-rose-500/10' : ''
          }`}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-rose-400">
              <span>Hot Leads</span>
              <Flame className="h-3.5 w-3.5" />
            </div>
            <p className="text-2xl font-bold mt-1">{stats.hotCount}</p>
          </CardContent>
        </Card>

        <Card
          onClick={() =>
            setSiteVisitFilter(
              siteVisitFilter === 'SCHEDULED' ? 'ALL' : 'SCHEDULED'
            )
          }
          className={`cursor-pointer transition-all hover:border-purple-500/40 ${
            siteVisitFilter === 'SCHEDULED'
              ? 'border-purple-500 bg-purple-500/10'
              : ''
          }`}
        >
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between text-xs text-purple-300">
              <span>Site Visits</span>
              <Calendar className="h-3.5 w-3.5" />
            </div>
            <p className="text-2xl font-bold mt-1">{stats.visitCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Comprehensive Real Estate Broker Filter Bar */}
      <Card className="border-border/80 bg-card/60">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search across Messages, Name, Phone, Budget, Location */}
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search inside Inbox messages (e.g. '1BHK', '2BHK', '90L', 'Bigger Carpet', 'Sunday', client name, phone, location)..."
                className="pl-9 bg-background/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Quick Configuration Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Quick BHK:
              </span>
              {['ALL', '1 BHK', '2 BHK', '3 BHK', '4+ BHK', 'Commercial'].map(
                (cfg) => (
                  <button
                    key={cfg}
                    type="button"
                    onClick={() => setConfigFilter(cfg)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      configFilter === cfg
                        ? 'bg-purple-600 text-white border-purple-500'
                        : 'bg-background/60 text-muted-foreground border-border hover:text-foreground'
                    }`}
                  >
                    {cfg === 'ALL' ? 'All Configs' : cfg}
                  </button>
                )
              )}
            </div>
          </div>

          {/* 7 Real Estate Broker Dropdown Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-1">
            {/* 1. Configuration Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3 text-purple-400" />
                1. Configuration (BHK)
              </label>
              <select
                value={configFilter}
                onChange={(e) => setConfigFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="ALL">All Configurations</option>
                {CONFIGURATION_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="UNSPECIFIED">Not Mentioned Yet</option>
              </select>
            </div>

            {/* 2. Budget Range Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <IndianRupee className="h-3 w-3 text-emerald-400" />
                2. Budget Filter
              </label>
              <select
                value={budgetFilter}
                onChange={(e) => setBudgetFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="ALL">All Budgets</option>
                {BUDGET_FILTER_GROUPS.map((grp) => (
                  <optgroup key={grp.group} label={grp.group}>
                    {grp.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value="UNSPECIFIED">Budget Not Specified</option>
              </select>
            </div>

            {/* 3. Lead Stage Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Flame className="h-3 w-3 text-rose-400" />
                3. Lead Stage
              </label>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="ALL">All Lead Stages</option>
                {LEAD_STAGE_OPTIONS.map((stg) => (
                  <option key={stg} value={stg}>
                    {stg}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Inquiry Purpose Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Home className="h-3 w-3 text-sky-400" />
                4. Inquiry Type
              </label>
              <select
                value={inquiryTypeFilter}
                onChange={(e) => setInquiryTypeFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="ALL">All Inquiry Types</option>
                {INQUIRY_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* 5. Carpet Preference Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-400" />
                5. Carpet Preference
              </label>
              <select
                value={carpetFilter}
                onChange={(e) => setCarpetFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="ALL">Any Carpet Size</option>
                {CARPET_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* 6. Site Visit Status Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3 text-purple-400" />
                6. Site Visit Status
              </label>
              <select
                value={siteVisitFilter}
                onChange={(e) => setSiteVisitFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="ALL">All Site Visit Status</option>
                <option value="SCHEDULED">Site Visit Requested / Booked</option>
                <option value="COMPLETED">Site Visit Completed</option>
                <option value="NO_VISIT">No Site Visit Yet</option>
              </select>
            </div>

            {/* 7. Activity / Time Window Dropdown */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3 text-cyan-400" />
                7. Activity Window
              </label>
              <select
                value={dateWindowFilter}
                onChange={(e) => setDateWindowFilter(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="ALL">All Time</option>
                <option value="UNREAD">Unread Messages Only</option>
                <option value="TODAY">Last 24 Hours</option>
                <option value="7DAYS">Last 7 Days</option>
                <option value="30DAYS">Last 30 Days</option>
              </select>
            </div>
          </div>

          {/* Active Filters Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground font-medium"
              >
                {filteredLeads.length > 0 &&
                filteredLeads.every((l) => selectedIds.has(l.id)) ? (
                  <CheckSquare className="h-4 w-4 text-purple-400" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Select All ({filteredLeads.length})
              </button>

              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground">
                Showing{' '}
                <strong className="text-foreground">
                  {filteredLeads.length}
                </strong>{' '}
                of <strong className="text-foreground">{leads.length}</strong>{' '}
                Inbox leads
              </span>

              {(configFilter !== 'ALL' ||
                budgetFilter !== 'ALL' ||
                stageFilter !== 'ALL' ||
                inquiryTypeFilter !== 'ALL' ||
                carpetFilter !== 'ALL' ||
                siteVisitFilter !== 'ALL' ||
                dateWindowFilter !== 'ALL' ||
                searchQuery) && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-purple-400 hover:text-purple-300 underline ml-2"
                >
                  Clear All Filters
                </button>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                  {selectedIds.size} selected
                </Badge>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filtered Leads List */}
      {loading ? (
        <Card className="p-12 text-center text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-purple-400" />
          Scanning Inbox conversations & extracting 1BHK/2BHK/3BHK configurations
          and budgets...
        </Card>
      ) : filteredLeads.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Filter className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
          <div className="text-base font-medium text-foreground">
            No Inbox leads match your current filter criteria
          </div>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Try clearing one of the dropdown filters or searching a different
            configuration / budget keyword.
          </p>
          <Button variant="outline" size="sm" onClick={resetAllFilters}>
            Reset Filters
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLeads.map((lead) => {
            const isSelected = selectedIds.has(lead.id);
            const customerMessages = lead.messages.filter(
              (m) => m.sender_type === 'customer' && m.content_text
            );

            return (
              <Card
                key={lead.id}
                className={`transition-all border ${
                  isSelected
                    ? 'border-purple-500/60 bg-purple-500/5'
                    : 'border-border/80 hover:border-border'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                    {/* Left Column: Lead Identity + Extracted Badges + Messages Preview */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleSelectLead(lead.id)}
                        className="mt-1 text-muted-foreground hover:text-foreground"
                      >
                        {isSelected ? (
                          <CheckSquare className="h-4 w-4 text-purple-400" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0 space-y-2.5">
                        {/* Name, Phone, Stage & Configuration Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-base text-foreground">
                            {lead.name}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            +{lead.phone.replace(/^\+/, '')}
                          </span>

                          {lead.unreadCount > 0 && (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[11px]">
                              {lead.unreadCount} new msg
                            </Badge>
                          )}

                          {/* Configuration Badge */}
                          <Badge
                            variant="outline"
                            className={`text-xs font-semibold ${getConfigBadgeClass(
                              lead.configuration
                            )}`}
                          >
                            <Building2 className="h-3 w-3 mr-1" />
                            {lead.configuration || 'Config Unspecified'}
                          </Badge>

                          {/* Budget Badge */}
                          <Badge
                            variant="outline"
                            className="text-xs bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          >
                            <IndianRupee className="h-3 w-3 mr-0.5" />
                            {lead.budgetRange || 'Budget Unspecified'}
                          </Badge>

                          {/* Carpet Badge */}
                          {lead.carpetPreference === 'Bigger Carpet' && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-amber-500/15 text-amber-300 border-amber-500/30"
                            >
                              <Sparkles className="h-3 w-3 mr-1" />
                              Bigger Carpet
                            </Badge>
                          )}

                          {/* Inquiry Purpose Badge */}
                          <Badge
                            variant="outline"
                            className="text-xs bg-sky-500/10 text-sky-300 border-sky-500/25"
                          >
                            {lead.inquiryType || 'Buy'}
                          </Badge>

                          {/* Lead Stage Badge */}
                          <Badge
                            variant="outline"
                            className={`text-xs ${getStageBadgeClass(
                              lead.leadStage
                            )}`}
                          >
                            {lead.leadStage}
                          </Badge>

                          {lead.isConvertedClient && (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Client
                            </Badge>
                          )}
                        </div>

                        {/* Site Visit / Location / Notes Row */}
                        {(lead.siteVisit ||
                          lead.preferredLocation ||
                          lead.possessionTimeline ||
                          lead.brokerNotes) && (
                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            {lead.siteVisit && (
                              <span className="inline-flex items-center gap-1 text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                                <Calendar className="h-3 w-3" />
                                Site Visit:{' '}
                                {lead.siteVisit.availabilityText ||
                                  `${lead.siteVisit.visitDate} ${lead.siteVisit.visitTime}`}
                              </span>
                            )}
                            {lead.preferredLocation && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-rose-400" />
                                {lead.preferredLocation}
                              </span>
                            )}
                            {lead.possessionTimeline && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3 text-cyan-400" />
                                {lead.possessionTimeline}
                              </span>
                            )}
                            {lead.brokerNotes && (
                              <span className="inline-flex items-center gap-1 text-amber-300/90">
                                <FileText className="h-3 w-3" />
                                Note: {lead.brokerNotes}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Client Inbox Messages Snippet */}
                        <div className="rounded-lg bg-background/60 border border-border/60 p-2.5 space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="font-medium text-foreground/80">
                              Client Inbox Messages ({customerMessages.length}{' '}
                              replies • {lead.totalMessagesCount} total)
                            </span>
                            <span>
                              Last active:{' '}
                              {new Date(lead.lastMessageAt).toLocaleString(
                                'en-IN',
                                {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }
                              )}
                            </span>
                          </div>

                          {customerMessages.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {customerMessages.slice(-4).map((m) => (
                                <span
                                  key={m.id}
                                  className="text-xs bg-muted/70 text-foreground px-2 py-1 rounded border border-border/50 max-w-md truncate"
                                  title={m.content_text || ''}
                                >
                                  “{m.content_text}”
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground truncate">
                              {lead.lastMessageText}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Quick Inline Dropdowns + Broker Action Buttons */}
                    <div className="flex flex-col sm:flex-row xl:flex-col items-stretch sm:items-center xl:items-end justify-between gap-2.5 shrink-0">
                      {/* Quick Inline Tagging Dropdowns */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <select
                          aria-label="Lead Configuration"
                          value={lead.configuration || ''}
                          onChange={(e) =>
                            handleQuickUpdate(lead, {
                              configuration: e.target.value,
                            })
                          }
                          className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground"
                        >
                          <option value="">Set BHK...</option>
                          {CONFIGURATION_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>

                        <select
                          aria-label="Lead Budget"
                          value={lead.budgetRange || ''}
                          onChange={(e) =>
                            handleQuickUpdate(lead, {
                              budgetRange: e.target.value,
                            })
                          }
                          className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground"
                        >
                          <option value="">Set Budget...</option>
                          {ALL_BUDGET_VALUES.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>

                        <select
                          aria-label="Lead Stage"
                          value={lead.leadStage}
                          onChange={(e) =>
                            handleQuickUpdate(lead, {
                              leadStage: e.target.value,
                            })
                          }
                          className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground"
                        >
                          {LEAD_STAGE_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Broker Action Bar */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setChatModalLead(lead)}
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-1 text-purple-400" />
                          Full Chat ({lead.totalMessagesCount})
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => openEditModal(lead)}
                        >
                          <Edit3 className="h-3.5 w-3.5 mr-1 text-sky-400" />
                          Qualify / Notes
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => openSiteVisitModal(lead)}
                        >
                          <Calendar className="h-3.5 w-3.5 mr-1 text-amber-400" />
                          {lead.siteVisit ? 'Update Visit' : 'Book Visit'}
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                          onClick={() => openSendWhatsAppModal(lead)}
                        >
                          <Send className="h-3.5 w-3.5 mr-1" />
                          Send WhatsApp
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                          disabled={forwardingLeadId === lead.id}
                          onClick={() => handleForwardLeadsToAdmin([lead])}
                          title="Forward this lead's details & chat to your configured admin WhatsApp number"
                        >
                          <Share2 className="h-3.5 w-3.5 mr-1" />
                          {forwardingLeadId === lead.id
                            ? 'Forwarding...'
                            : 'Forward to Admin'}
                        </Button>

                        {!lead.isConvertedClient && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={convertingLeadId === lead.id}
                            onClick={() => handleConvertToClient(lead)}
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                            {convertingLeadId === lead.id
                              ? 'Adding...'
                              : 'Add to Clients'}
                          </Button>
                        )}

                        <Link href="/inbox">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Inbox
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Full Conversation & Workflow Answers */}
      {chatModalLead && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base text-foreground">
                  {chatModalLead.name} (+
                  {chatModalLead.phone.replace(/^\+/, '')})
                </h3>
                <p className="text-xs text-muted-foreground">
                  {chatModalLead.configuration || 'Config Unspecified'} •{' '}
                  {chatModalLead.budgetRange || 'Budget Unspecified'} • Stage:{' '}
                  {chatModalLead.leadStage}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChatModalLead(null)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Workflow Answers Summary */}
              {Object.keys(chatModalLead.workflowAnswers).length > 0 && (
                <div className="rounded-lg bg-purple-500/10 border border-purple-500/25 p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-purple-300">
                    Captured Property Inquiry & Site Visit Answers
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                    {Object.entries(chatModalLead.workflowAnswers).map(
                      ([k, v]) => (
                        <div key={k}>
                          <span className="text-muted-foreground capitalize">
                            {k.replace(/_/g, ' ')}:
                          </span>{' '}
                          <span className="font-medium text-foreground">
                            {v}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Complete Message History */}
              <div className="space-y-2">
                {chatModalLead.messages.map((m) => {
                  const isCustomer = m.sender_type === 'customer';
                  return (
                    <div
                      key={m.id}
                      className={`flex ${
                        isCustomer ? 'justify-start' : 'justify-end'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-xs space-y-1 ${
                          isCustomer
                            ? 'bg-muted text-foreground border border-border'
                            : 'bg-purple-600/20 text-purple-100 border border-purple-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                          <span className="font-semibold">
                            {isCustomer ? chatModalLead.name : 'CRM / Bot'}
                          </span>
                          <span>
                            {new Date(m.created_at).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">
                          {m.content_text || `[${m.content_type}]`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-3 border-t border-border flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const lead = chatModalLead;
                  setChatModalLead(null);
                  openSendWhatsAppModal(lead);
                }}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Send WhatsApp Follow-Up
              </Button>
              <Button size="sm" onClick={() => setChatModalLead(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Broker Lead Qualification & Notes */}
      {editModalLead && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-lg w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">
                  Broker Lead Qualification — {editModalLead.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Save configuration, budget, location & broker notes to
                  Supabase
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditModalLead(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Configuration (BHK)
                  </label>
                  <select
                    value={editForm.configuration}
                    onChange={(e) =>
                      setEditForm({ ...editForm, configuration: e.target.value })
                    }
                    className="w-full h-9 mt-1 rounded-md border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="">Select Configuration</option>
                    {CONFIGURATION_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Budget Range
                  </label>
                  <Input
                    value={editForm.budgetRange}
                    onChange={(e) =>
                      setEditForm({ ...editForm, budgetRange: e.target.value })
                    }
                    placeholder="e.g. 90L to 1.05 cr"
                    className="h-9 mt-1 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Lead Stage
                  </label>
                  <select
                    value={editForm.leadStage}
                    onChange={(e) =>
                      setEditForm({ ...editForm, leadStage: e.target.value })
                    }
                    className="w-full h-9 mt-1 rounded-md border border-border bg-background px-2.5 text-xs"
                  >
                    {LEAD_STAGE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Inquiry Purpose
                  </label>
                  <select
                    value={editForm.inquiryType}
                    onChange={(e) =>
                      setEditForm({ ...editForm, inquiryType: e.target.value })
                    }
                    className="w-full h-9 mt-1 rounded-md border border-border bg-background px-2.5 text-xs"
                  >
                    {INQUIRY_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Carpet Preference
                  </label>
                  <select
                    value={editForm.carpetPreference}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        carpetPreference: e.target.value,
                      })
                    }
                    className="w-full h-9 mt-1 rounded-md border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="">Standard / Any</option>
                    {CARPET_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Possession Timeline
                  </label>
                  <select
                    value={editForm.possessionTimeline}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        possessionTimeline: e.target.value,
                      })
                    }
                    className="w-full h-9 mt-1 rounded-md border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="">Any Possession</option>
                    {POSSESSION_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Preferred Locality / Project
                  </label>
                  <Input
                    value={editForm.preferredLocation}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        preferredLocation: e.target.value,
                      })
                    }
                    placeholder="e.g. Andheri West, Thane, Wakad"
                    className="h-9 mt-1 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Next Follow-Up Date
                  </label>
                  <Input
                    type="date"
                    value={editForm.followUpDate}
                    onChange={(e) =>
                      setEditForm({ ...editForm, followUpDate: e.target.value })
                    }
                    className="h-9 mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Broker Remarks / Requirement Notes
                </label>
                <textarea
                  rows={3}
                  value={editForm.brokerNotes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, brokerNotes: e.target.value })
                  }
                  placeholder="Add client requirement notes, floor preference, loan status..."
                  className="w-full mt-1 rounded-md border border-border bg-background p-2.5 text-xs"
                />
              </div>
            </div>

            <div className="p-3 border-t border-border flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditModalLead(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white"
                disabled={savingEdit}
                onClick={handleSaveEditLead}
              >
                {savingEdit ? 'Saving...' : 'Save Qualification'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Schedule / Update Site Visit */}
      {siteVisitModalLead && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">
                  Schedule Site Visit — {siteVisitModalLead.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Syncs with Calendar & Site Visits table
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSiteVisitModalLead(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Visit Date
                  </label>
                  <Input
                    type="date"
                    value={visitForm.visitDate}
                    onChange={(e) =>
                      setVisitForm({ ...visitForm, visitDate: e.target.value })
                    }
                    className="h-9 mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Visit Time Slot
                  </label>
                  <Input
                    value={visitForm.visitTime}
                    onChange={(e) =>
                      setVisitForm({ ...visitForm, visitTime: e.target.value })
                    }
                    placeholder="e.g. 11:00 AM"
                    className="h-9 mt-1 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Configuration
                  </label>
                  <select
                    value={visitForm.configuration}
                    onChange={(e) =>
                      setVisitForm({
                        ...visitForm,
                        configuration: e.target.value,
                      })
                    }
                    className="w-full h-9 mt-1 rounded-md border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="">Select BHK</option>
                    {CONFIGURATION_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Budget Range
                  </label>
                  <Input
                    value={visitForm.budgetRange}
                    onChange={(e) =>
                      setVisitForm({
                        ...visitForm,
                        budgetRange: e.target.value,
                      })
                    }
                    placeholder="e.g. 90L to 1.05 cr"
                    className="h-9 mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Site Visit Notes / Project Name
                </label>
                <textarea
                  rows={2}
                  value={visitForm.notes}
                  onChange={(e) =>
                    setVisitForm({ ...visitForm, notes: e.target.value })
                  }
                  placeholder="Project tower, pickup details, sales executive assigned..."
                  className="w-full mt-1 rounded-md border border-border bg-background p-2 text-xs"
                />
              </div>
            </div>

            <div className="p-3 border-t border-border flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSiteVisitModalLead(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white"
                disabled={savingVisit}
                onClick={handleSaveSiteVisit}
              >
                {savingVisit ? 'Booking...' : 'Confirm Site Visit'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Send Direct WhatsApp / Template Follow-Up */}
      {customMsgLead && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-base">
                  Send WhatsApp Follow-Up — {customMsgLead.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Automatically uses approved Utility Template if outside 24h
                  reply window
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomMsgLead(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <textarea
                rows={4}
                value={customMsgText}
                onChange={(e) => setCustomMsgText(e.target.value)}
                className="w-full rounded-md border border-border bg-background p-2.5 text-xs"
              />
            </div>

            <div className="p-3 border-t border-border flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustomMsgLead(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={sendingLeadId === customMsgLead.id}
                onClick={handleSendWhatsAppToLead}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {sendingLeadId === customMsgLead.id
                  ? 'Sending...'
                  : 'Send WhatsApp Now'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

