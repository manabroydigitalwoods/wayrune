import { useMemo } from 'react';
import { cn } from '../lib/utils';
import { Input } from './ui/input';

/** Common dialing codes — national number is always 10 digits. */
export const COMMON_PHONE_CODES = [
  { value: '+91', label: '+91 India' },
  { value: '+1', label: '+1 US/CA' },
  { value: '+44', label: '+44 UK' },
  { value: '+971', label: '+971 UAE' },
  { value: '+65', label: '+65 SG' },
] as const;

export const NATIONAL_PHONE_LENGTH = 10;

function codeDigits(code: string) {
  return code.replace(/\D/g, '');
}

/** Split stored phone into country code + 10-digit national number. */
export function splitPhone(value: string): { code: string; national: string } {
  const digits = value.replace(/\D/g, '');
  if (!digits) return { code: '+91', national: '' };

  for (const c of COMMON_PHONE_CODES) {
    const cd = codeDigits(c.value);
    if (digits.startsWith(cd) && digits.length >= cd.length) {
      return {
        code: c.value,
        national: digits.slice(cd.length).slice(0, NATIONAL_PHONE_LENGTH),
      };
    }
  }

  // Bare national number (or unknown prefix — treat trailing 10 as national)
  if (digits.length <= NATIONAL_PHONE_LENGTH) {
    return { code: '+91', national: digits };
  }
  return {
    code: '+91',
    national: digits.slice(-NATIONAL_PHONE_LENGTH),
  };
}

export function joinPhone(code: string, national: string): string {
  const n = national.replace(/\D/g, '').slice(0, NATIONAL_PHONE_LENGTH);
  if (!n) return '';
  return `${code}${n}`;
}

export function sanitizeNationalPhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, NATIONAL_PHONE_LENGTH);
}

/** Valid when national part is exactly 10 digits (with or without country code). */
export function isPhoneFormatOk(raw: string): boolean {
  if (!raw.trim()) return true;
  const { national } = splitPhone(raw);
  return national.length === NATIONAL_PHONE_LENGTH;
}

export function PhoneInput({
  value,
  onChange,
  id,
  placeholder = '98765 43210',
  disabled,
  className,
  'aria-invalid': ariaInvalid,
  autoComplete = 'tel',
  defaultCode = '+91',
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
  autoComplete?: string;
  defaultCode?: string;
}) {
  const parsed = useMemo(() => {
    if (!value.trim()) return { code: defaultCode, national: '' };
    return splitPhone(value);
  }, [value, defaultCode]);

  const { code, national } = parsed;
  const showHint = national.length > 0 && national.length !== NATIONAL_PHONE_LENGTH;

  function setCode(nextCode: string) {
    onChange(joinPhone(nextCode, national));
  }

  function setNational(next: string) {
    const cleaned = sanitizeNationalPhone(next);
    onChange(joinPhone(code || defaultCode, cleaned));
  }

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center gap-2">
        <select
          aria-label="Country code"
          disabled={disabled}
          value={code || defaultCode}
          onChange={(e) => setCode(e.target.value)}
          className={cn(
            'h-9 shrink-0 rounded-lg border border-border/80 bg-card/85 px-2 text-sm font-medium shadow-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {COMMON_PHONE_CODES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.value}
            </option>
          ))}
        </select>
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete={autoComplete}
          value={national}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={ariaInvalid || showHint}
          maxLength={NATIONAL_PHONE_LENGTH}
          onChange={(e) => setNational(e.target.value)}
          className="flex-1"
        />
      </div>
      {showHint ? (
        <p className="text-[11px] font-medium leading-snug text-destructive">
          Enter a {NATIONAL_PHONE_LENGTH}-digit number
        </p>
      ) : null}
    </div>
  );
}
