'use strict';
'use client';

import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Home,
  Tag,
  CheckCircle2,
  Phone,
  User,
  ArrowRight,
  ExternalLink,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface BookingCalendarClientProps {
  conversationId: string;
  contactName: string;
  contactPhone: string;
  configuration: string;
  budgetRange: string;
  businessName: string;
}

const TIME_SLOTS = [
  { time: '10:00 AM', label: 'Morning' },
  { time: '11:30 AM', label: 'Morning' },
  { time: '01:30 PM', label: 'Afternoon' },
  { time: '03:00 PM', label: 'Afternoon' },
  { time: '04:30 PM', label: 'Afternoon' },
  { time: '05:30 PM', label: 'Evening' },
  { time: '06:30 PM', label: 'Evening' },
];

export function BookingCalendarClient({
  conversationId,
  contactName,
  contactPhone,
  configuration: initialConfig,
  budgetRange: initialBudget,
  businessName,
}: BookingCalendarClientProps) {
  // Generate next 21 days for the calendar selector
  const daysList = React.useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = 0; i < 21; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const isToday = i === 0;
      const isTomorrow = i === 1;
      const dateStr = d.toISOString().split('T')[0];
      const dayName = isToday
        ? 'Today'
        : isTomorrow
          ? 'Tomorrow'
          : d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });
      const dayNumber = d.getDate();

      list.push({
        dateStr,
        dayName,
        monthName,
        dayNumber,
        fullLabel: `${dayName}, ${dayNumber} ${monthName}`,
        dateObj: d,
      });
    }
    return list;
  }, []);

  const [selectedDate, setSelectedDate] = useState(
    daysList[1]?.dateStr || daysList[0]?.dateStr
  );
  const [selectedTime, setSelectedTime] = useState('11:30 AM');
  const [name, setName] = useState(contactName);
  const [phone, setPhone] = useState(contactPhone);
  const [config, setConfig] = useState(initialConfig || '1 BHK');
  const [budget, setBudget] = useState(initialBudget || '');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime) {
      setErrorMsg('Please select a preferred date and time slot.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/site-visits/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          visit_date: selectedDate,
          visit_time: selectedTime,
          client_name: name,
          client_phone: phone,
          configuration: config,
          budget_range: budget,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to schedule site visit.');
      }

      setSuccess(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Booking failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDayObj = daysList.find((d) => d.dateStr === selectedDate);

  // Generate Google Calendar Link
  const googleCalendarUrl = React.useMemo(() => {
    if (!selectedDate || !selectedTime) return '';
    try {
      // Parse hour and minute
      const [timePart, modifier] = selectedTime.split(' ');
      const [hoursStr, minutesStr] = timePart.split(':');
      let hours = parseInt(hoursStr, 10);
      const minutes = parseInt(minutesStr, 10);
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;

      const start = new Date(selectedDate);
      start.setHours(hours, minutes, 0, 0);
      const end = new Date(start);
      end.setHours(start.getHours() + 1);

      const formatIso = (date: Date) =>
        date.toISOString().replace(/-|:|\.\d\d\d/g, '');

      const title = encodeURIComponent(
        `Property Site Visit - ${config} (${businessName || 'Real Estate'})`
      );
      const details = encodeURIComponent(
        `Site visit scheduled for ${config} with budget ${budget}.\nClient: ${name} (${phone})\nNotes: ${notes}`
      );

      return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${formatIso(
        start
      )}/${formatIso(end)}&details=${details}`;
    } catch {
      return '';
    }
  }, [selectedDate, selectedTime, config, budget, name, phone, notes, businessName]);

  if (success) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 dark:bg-emerald-500/20">
            <CheckCircle2 className="h-10 w-10 animate-bounce" />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" /> Appointment Confirmed
          </span>

          <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
            Site Visit Scheduled!
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Thank you, <strong className="text-foreground">{name || 'Client'}</strong>.
            We have confirmed your visit details.
          </p>

          {/* Details Card */}
          <div className="mt-6 w-full rounded-xl border border-border bg-muted/40 p-5 text-left space-y-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <CalendarIcon className="h-4 w-4 text-primary" /> Date
              </span>
              <span className="text-sm font-semibold text-foreground">
                {selectedDayObj?.fullLabel || selectedDate}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" /> Time Slot
              </span>
              <span className="text-sm font-semibold text-foreground">
                {selectedTime}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Home className="h-4 w-4 text-primary" /> Configuration
              </span>
              <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {config}
              </span>
            </div>

            {budget && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Tag className="h-4 w-4 text-primary" /> Budget Range
                </span>
                <span className="text-sm font-medium text-foreground">
                  {budget}
                </span>
              </div>
            )}
          </div>

          <div className="mt-6 flex w-full flex-col gap-3">
            {googleCalendarUrl && (
              <a
                href={googleCalendarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <CalendarIcon className="h-4 w-4 text-primary" />
                Add to Google Calendar
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            )}

            <button
              onClick={() => window.close()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              <MessageSquare className="h-4 w-4" />
              Return to WhatsApp
            </button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            A confirmation message has also been sent to your WhatsApp number.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
      {/* Top Banner */}
      <div className="border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Home className="h-3.5 w-3.5" />
            {businessName || 'Property Specialist'}
          </div>
          {config && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Selected: {config}
            </span>
          )}
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Schedule Your Property Site Visit
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a date and convenient time slot to explore our premium options.
        </p>

        {/* Selected Preferences Banner */}
        <div className="mt-4 flex flex-wrap gap-2">
          {config && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground">
              <Home className="h-3.5 w-3.5 text-primary" />
              {config}
            </div>
          )}
          {budget && (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground">
              <Tag className="h-3.5 w-3.5 text-primary" />
              Budget: {budget}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleBooking} className="p-6 sm:p-8 space-y-6">
        {errorMsg && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-medium text-destructive">
            {errorMsg}
          </div>
        )}

        {/* 1. Select Date */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarIcon className="h-4 w-4 text-primary" />
              1. Select Date
            </label>
            <span className="text-xs font-medium text-muted-foreground">
              {selectedDayObj?.fullLabel}
            </span>
          </div>

          {/* Horizontal scroll date selector */}
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
            {daysList.map((day) => {
              const isSelected = selectedDate === day.dateStr;
              return (
                <button
                  type="button"
                  key={day.dateStr}
                  onClick={() => setSelectedDate(day.dateStr)}
                  className={`flex flex-col items-center justify-center rounded-xl border px-3.5 py-2.5 min-w-[70px] transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground shadow-md scale-105'
                      : 'border-border bg-background hover:bg-muted text-foreground'
                  }`}
                >
                  <span
                    className={`text-[10px] uppercase font-semibold ${
                      isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground'
                    }`}
                  >
                    {day.dayName}
                  </span>
                  <span className="text-base font-bold my-0.5">
                    {day.dayNumber}
                  </span>
                  <span
                    className={`text-[10px] ${
                      isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground'
                    }`}
                  >
                    {day.monthName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Select Time Slot */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              2. Select Time Slot
            </label>
            <span className="text-xs font-medium text-muted-foreground">
              Selected: {selectedTime}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {TIME_SLOTS.map((slot) => {
              const isSelected = selectedTime === slot.time;
              return (
                <button
                  type="button"
                  key={slot.time}
                  onClick={() => setSelectedTime(slot.time)}
                  className={`flex flex-col items-center justify-center rounded-xl border py-2.5 px-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground shadow-md'
                      : 'border-border bg-background hover:bg-muted text-foreground'
                  }`}
                >
                  <span className="text-xs font-semibold">{slot.time}</span>
                  <span
                    className={`text-[10px] ${
                      isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    }`}
                  >
                    {slot.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Confirm Preferences */}
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            3. Client & Property Details
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Looking for Configuration
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {['1 BHK', '2 BHK', '3 BHK'].map((bhk) => (
                  <button
                    type="button"
                    key={bhk}
                    onClick={() => setConfig(bhk)}
                    className={`rounded-lg border py-1.5 text-xs font-semibold cursor-pointer transition ${
                      config === bhk
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {bhk}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Budget Range
              </label>
              <input
                type="text"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="e.g. 65L to 75 L"
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                <User className="h-3 w-3" /> Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Name"
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                <Phone className="h-3 w-3" /> Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91..."
                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Notes or Special Requirements (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Prefer corner flat, high floor, weekend visit..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-lg transition-all hover:opacity-95 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Scheduling Visit...
            </>
          ) : (
            <>
              Confirm & Book Site Visit
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-[11px] text-muted-foreground">
          🔒 Your details are protected. Our site manager will welcome you at the location.
        </p>
      </form>
    </div>
  );
}
