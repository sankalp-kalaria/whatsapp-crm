/**
 * Helpers for reading and persisting the profile's WhatsApp Contact Number
 * and Conversation Forward Interval (30 minutes / 1 hour / 2 hours).
 *
 * Stores values in `profiles.phone` + `profiles.forward_interval_minutes`
 * (added in migration 050) AND mirrors them as tagged entries inside
 * `profiles.beta_features` (`__forward_phone:<phone>`, `__forward_interval:<mins>`)
 * so that environments where migration 050 hasn't been executed in the SQL
 * editor yet continue to read and save without error.
 */

export type ForwardIntervalMinutes = 30 | 60 | 120;

const PHONE_PREFIX = '__forward_phone:';
const INTERVAL_PREFIX = '__forward_interval:';

export function normalizeForwardInterval(val: unknown): ForwardIntervalMinutes {
  const num = typeof val === 'number' ? val : Number(val);
  if (num === 30 || num === 60 || num === 120) return num;
  return 60;
}

export function extractForwardSettingsFromProfile(row: {
  phone?: string | null;
  forward_interval_minutes?: number | null;
  beta_features?: string[] | null;
}): {
  phone: string;
  forwardIntervalMinutes: ForwardIntervalMinutes;
} {
  const features = Array.isArray(row.beta_features) ? row.beta_features : [];

  let phoneFromFeatures = '';
  let intervalFromFeatures: number | null = null;

  for (const item of features) {
    if (typeof item !== 'string') continue;
    if (item.startsWith(PHONE_PREFIX)) {
      phoneFromFeatures = item.slice(PHONE_PREFIX.length);
    } else if (item.startsWith(INTERVAL_PREFIX)) {
      intervalFromFeatures = Number(item.slice(INTERVAL_PREFIX.length));
    }
  }

  const resolvedPhone =
    typeof row.phone === 'string' && row.phone.trim().length > 0
      ? row.phone.trim()
      : phoneFromFeatures;

  const resolvedInterval = normalizeForwardInterval(
    row.forward_interval_minutes ?? intervalFromFeatures ?? 60
  );

  return {
    phone: resolvedPhone,
    forwardIntervalMinutes: resolvedInterval,
  };
}

export function mergeForwardSettingsIntoBetaFeatures(
  existingFeatures: string[] | null | undefined,
  phone: string,
  forwardIntervalMinutes: ForwardIntervalMinutes
): string[] {
  const cleaned = (existingFeatures ?? []).filter(
    (f) =>
      typeof f === 'string' &&
      !f.startsWith(PHONE_PREFIX) &&
      !f.startsWith(INTERVAL_PREFIX)
  );
  const trimmedPhone = phone.trim();
  if (trimmedPhone) {
    cleaned.push(`${PHONE_PREFIX}${trimmedPhone}`);
  }
  cleaned.push(`${INTERVAL_PREFIX}${forwardIntervalMinutes}`);
  return cleaned;
}

