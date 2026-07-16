import { z } from 'zod';

/** Trim strings; treat blank as null (optional fields). */
export function blankToNull(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return value;
}

/** Trim strings; treat blank as undefined. */
export function blankToUndefined(value: unknown): unknown {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value;
}

export function isValidPhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return false;

  // Exactly 10 digits (national number only)
  if (/^\d{10}$/.test(digits)) return true;

  // Country code (1–4 digits) + exactly 10 national digits
  // Prefer known codes first for unambiguous split
  const known = ['91', '971', '65', '44', '1'];
  for (const code of known) {
    if (digits.startsWith(code) && digits.length === code.length + 10) {
      return true;
    }
  }

  // Generic: last 10 are national, remainder is country (1–4 digits)
  if (digits.length >= 11 && digits.length <= 14) {
    const national = digits.slice(-10);
    const country = digits.slice(0, -10);
    return /^[1-9]\d{0,3}$/.test(country) && /^\d{10}$/.test(national);
  }

  return false;
}

export const RequiredText = (label = 'This field') =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`);

export const RequiredEmail = z
  .string({ required_error: 'Email is required' })
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email');

/** Optional email — blank becomes null; invalid format is rejected. */
export const OptionalEmail = z.preprocess(
  blankToNull,
  z.string().email('Enter a valid email').nullable(),
);

export const RequiredPhone = z
  .string({ required_error: 'Phone is required' })
  .trim()
  .min(1, 'Phone is required')
  .refine(isValidPhone, 'Enter a 10-digit phone number');

/** Optional phone — blank becomes null; must be 10 digits (+ optional country code). */
export const OptionalPhone = z.preprocess(
  blankToNull,
  z.string().refine(isValidPhone, 'Enter a 10-digit phone number').nullable(),
);

export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function parseWithFieldErrors<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): { ok: true; data: z.infer<T> } | { ok: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: fieldErrorsFromZod(result.error) };
}
