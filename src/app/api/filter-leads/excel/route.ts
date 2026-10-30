import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  buildLeadsXlsxBuffer,
  parseUploadedLeadsExcelOrCsv,
  type ExcelLeadRow,
} from '@/lib/excel/xlsx-leads';
import type { FilteredLeadItem } from '../route';

function normalizePhoneKey(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

function normalizeFullPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }
  return digits;
}

/**
 * POST /api/filter-leads/excel
 * Generates and downloads a native Microsoft Excel (.xlsx) file containing
 * all separate Filter Leads columns.
 */
export async function POST(request: Request) {
  try {
    await requireRole('agent');
    const body = await request.json().catch(() => ({}));
    const leads = (body.leads ?? []) as FilteredLeadItem[];

    const excelRows: ExcelLeadRow[] = leads.map((l) => {
      const clientMsgs = (l.messages || [])
        .filter((m) => m.sender_type === 'customer' && m.content_text)
        .map((m) => m.content_text?.trim())
        .filter(Boolean)
        .join(' | ');

      return {
        phone: l.phone || '',
        name: l.name || '',
        email: l.email || '',
        configuration: l.configuration || '',
        budgetRange: l.budgetRange || '',
        carpetPreference: l.carpetPreference || 'Standard',
        inquiryType: l.inquiryType || 'Buy',
        leadStage: l.leadStage || 'New Inquiry',
        preferredLocation: l.preferredLocation || '',
        possessionTimeline: l.possessionTimeline || '',
        siteVisitStatus: l.siteVisit?.status || 'No Visit Yet',
        siteVisitDate: l.siteVisit?.visitDate || '',
        siteVisitTime: l.siteVisit?.visitTime || '',
        siteVisitAvailability: l.siteVisit?.availabilityText || '',
        followUpDate: l.followUpDate || '',
        brokerNotes: l.brokerNotes || '',
        isConvertedClient: l.isConvertedClient ? 'Yes' : 'No',
        unreadCount: String(l.unreadCount ?? 0),
        lastMessageText: (l.lastMessageText || '').replace(/\r?\n/g, ' '),
        clientMessagesText: clientMsgs,
        lastActivityDate: l.lastMessageAt
          ? new Date(l.lastMessageAt).toLocaleString('en-IN')
          : '',
      };
    });

    const xlsxBuffer = buildLeadsXlsxBuffer(excelRows);
    const dateStamp = new Date().toISOString().slice(0, 10);

    return new NextResponse(new Uint8Array(xlsxBuffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="filter-leads-${dateStamp}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * PUT /api/filter-leads/excel
 * Uploads an edited Excel (.xlsx) or CSV file and overwrites lead details
 * on the basis of unique Phone Number.
 */
export async function PUT(request: Request) {
  try {
    const { accountId, userId } = await requireRole('agent');
    const db = supabaseAdmin();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json(
        { error: 'Please select an Excel (.xlsx) or CSV file to upload' },
        { status: 400 }
      );
    }

    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const parsedRows = parseUploadedLeadsExcelOrCsv(buffer, file.name);

    if (parsedRows.length === 0) {
      return NextResponse.json(
        {
          error:
            'No valid lead rows with a Phone Number were found in the uploaded file.',
        },
        { status: 400 }
      );
    }

    // Deduplicate rows in the uploaded file by normalized phone key (latest row in sheet wins)
    const uniqueByPhone = new Map<string, Partial<ExcelLeadRow>>();
    for (const r of parsedRows) {
      if (!r.phone) continue;
      const key = normalizePhoneKey(r.phone);
      if (key.length >= 7) {
        uniqueByPhone.set(key, r);
      }
    }

    // Ensure all 9 custom fields exist for this account
    const REQUIRED_FIELDS: Array<[string, string]> = [
      ['lead_configuration', 'select'],
      ['lead_budget_range', 'select'],
      ['lead_stage', 'select'],
      ['lead_inquiry_type', 'select'],
      ['lead_carpet_preference', 'select'],
      ['lead_preferred_location', 'text'],
      ['lead_possession_timeline', 'select'],
      ['lead_follow_up_date', 'text'],
      ['lead_broker_notes', 'text'],
    ];

    const { data: existingFields } = await db
      .from('custom_fields')
      .select('id, field_name')
      .eq('account_id', accountId);

    const fieldIdByName = new Map<string, string>();
    for (const cf of (existingFields ?? []) as Array<{
      id: string;
      field_name: string;
    }>) {
      fieldIdByName.set(cf.field_name, cf.id);
    }

    for (const [fName, fType] of REQUIRED_FIELDS) {
      if (!fieldIdByName.has(fName)) {
        const { data: created } = await db
          .from('custom_fields')
          .insert({
            account_id: accountId,
            user_id: userId,
            field_name: fName,
            field_type: fType,
          })
          .select('id')
          .single();
        if (created?.id) {
          fieldIdByName.set(fName, created.id);
        }
      }
    }

    // Load existing contacts & conversations for fast phone lookup
    const [contactsRes, convsRes] = await Promise.all([
      db
        .from('contacts')
        .select('id, name, phone, email')
        .eq('account_id', accountId),
      db
        .from('conversations')
        .select('id, contact_id')
        .eq('account_id', accountId),
    ]);

    const contactByPhoneKey = new Map<
      string,
      { id: string; name?: string | null; phone: string; email?: string | null }
    >();
    for (const c of (contactsRes.data ?? []) as Array<{
      id: string;
      name?: string | null;
      phone: string;
      email?: string | null;
    }>) {
      const k = normalizePhoneKey(c.phone);
      if (k) contactByPhoneKey.set(k, c);
    }

    const convByContactId = new Map<string, string>();
    for (const conv of (convsRes.data ?? []) as Array<{
      id: string;
      contact_id: string;
    }>) {
      if (conv.contact_id) convByContactId.set(conv.contact_id, conv.id);
    }

    let updatedCount = 0;
    let createdCount = 0;

    for (const [phoneKey, row] of uniqueByPhone.entries()) {
      const cleanFullPhone = normalizeFullPhone(row.phone || phoneKey);
      let contact = contactByPhoneKey.get(phoneKey);

      if (contact) {
        // Overwrite existing contact details based on unique phone number
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (row.name !== undefined && row.name !== '') {
          patch.name = row.name;
        }
        if (row.email !== undefined) {
          patch.email = row.email || null;
        }
        await db.from('contacts').update(patch).eq('id', contact.id);
        updatedCount++;
      } else {
        // Create new contact for this unique phone number
        const { data: newContact, error: createErr } = await db
          .from('contacts')
          .insert({
            account_id: accountId,
            user_id: userId,
            phone: cleanFullPhone,
            name: row.name || cleanFullPhone,
            email: row.email || null,
          })
          .select('id, name, phone, email')
          .single();

        if (createErr || !newContact) continue;
        contact = newContact;
        contactByPhoneKey.set(phoneKey, newContact);
        createdCount++;
      }

      const contactId = contact.id;

      // Ensure conversation exists so the lead is visible in Filter Leads & Inbox
      let convId = convByContactId.get(contactId);
      if (!convId) {
        const { data: newConv } = await db
          .from('conversations')
          .insert({
            account_id: accountId,
            user_id: userId,
            contact_id: contactId,
            status: 'open',
            unread_count: 0,
            last_message_text:
              row.lastMessageText ||
              row.brokerNotes ||
              `Imported via Excel (${row.configuration || 'Lead'})`,
            last_message_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (newConv?.id) {
          const createdConvId: string = String(newConv.id);
          convId = createdConvId;
          convByContactId.set(contactId, createdConvId);
        }
      }

      // Overwrite all custom field values for this contact
      const customFieldMap: Record<string, string | undefined> = {
        lead_configuration:
          row.configuration === 'Unspecified' ? '' : row.configuration,
        lead_budget_range:
          row.budgetRange === 'Unspecified' ? '' : row.budgetRange,
        lead_carpet_preference: row.carpetPreference,
        lead_inquiry_type: row.inquiryType,
        lead_stage: row.leadStage,
        lead_preferred_location: row.preferredLocation,
        lead_possession_timeline: row.possessionTimeline,
        lead_follow_up_date: row.followUpDate,
        lead_broker_notes: row.brokerNotes,
      };

      const { data: existingVals } = await db
        .from('contact_custom_values')
        .select('id, custom_field_id')
        .eq('contact_id', contactId);

      const valIdByFieldId = new Map<string, string>();
      for (const ev of (existingVals ?? []) as Array<{
        id: string;
        custom_field_id: string;
      }>) {
        valIdByFieldId.set(ev.custom_field_id, ev.id);
      }

      for (const [fName, val] of Object.entries(customFieldMap)) {
        if (val === undefined) continue;
        const fId = fieldIdByName.get(fName);
        if (!fId) continue;

        const existingValId = valIdByFieldId.get(fId);
        if (existingValId) {
          await db
            .from('contact_custom_values')
            .update({ value: val })
            .eq('id', existingValId);
        } else if (val !== '') {
          await db.from('contact_custom_values').insert({
            contact_id: contactId,
            custom_field_id: fId,
            value: val,
          });
        }
      }

      // Sync site_visits if visit date or status is present in Excel
      const hasVisitDate =
        row.siteVisitDate && /^\d{4}-\d{2}-\d{2}$/.test(row.siteVisitDate);
      const visitStatusClean = (row.siteVisitStatus || '').toLowerCase();

      if (
        hasVisitDate ||
        (visitStatusClean &&
          visitStatusClean !== 'no visit yet' &&
          visitStatusClean !== 'none')
      ) {
        const { data: existingVisit } = await db
          .from('site_visits')
          .select('id, visit_date, visit_time')
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const resolvedStatus = ['scheduled', 'completed', 'cancelled'].includes(
          visitStatusClean
        )
          ? visitStatusClean
          : 'scheduled';

        if (existingVisit?.id) {
          await db
            .from('site_visits')
            .update({
              visit_date: hasVisitDate
                ? row.siteVisitDate
                : existingVisit.visit_date,
              visit_time:
                row.siteVisitTime || existingVisit.visit_time || '11:00 AM',
              configuration: row.configuration || null,
              budget_range: row.budgetRange || null,
              status: resolvedStatus,
              notes: row.brokerNotes || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingVisit.id);
        } else if (hasVisitDate) {
          await db.from('site_visits').insert({
            account_id: accountId,
            contact_id: contactId,
            conversation_id: convId || null,
            visit_date: row.siteVisitDate!,
            visit_time: row.siteVisitTime || '11:00 AM',
            configuration: row.configuration || null,
            budget_range: row.budgetRange || null,
            client_name: row.name || contact.name || cleanFullPhone,
            client_phone: cleanFullPhone,
            status: resolvedStatus,
            notes: row.brokerNotes || null,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalProcessed: uniqueByPhone.size,
      updatedCount,
      createdCount,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
