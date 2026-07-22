import { useMemo } from 'react';
import { cn } from '../lib/utils';
import { Combobox } from './ui/combobox';
import { Input } from './ui/input';

/** Common dialing codes — national number is always 10 digits. */
export const COMMON_PHONE_CODES = [
  { value: '+91', label: '+91 India' },
  { value: '+1', label: '+1 US/CA' },
  { value: '+44', label: '+44 UK' },
  { value: '+971', label: '+971 UAE' },
  { value: '+65', label: '+65 SG' },
] as const;

const CODE_DISPLAY_LABELS: Record<(typeof COMMON_PHONE_CODES)[number]['value'], string> = {
  '+91': '+91 IN',
  '+1': '+1 US',
  '+44': '+44 UK',
  '+971': '+971 AE',
  '+65': '+65 SG',
};

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
  // Keep dial-code-only values so country selection sticks before digits are typed.
  if (!n) return code;
  return `${code}${n}`;
}

/** True when there is no national number yet (empty or dial-code only). */
export function isPhoneBlank(raw: string): boolean {
  if (!raw.trim()) return true;
  return splitPhone(raw).national.length === 0;
}

export function sanitizeNationalPhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, NATIONAL_PHONE_LENGTH);
}

/** Valid when blank, or national part is exactly 10 digits. */
export function isPhoneFormatOk(raw: string): boolean {
  if (isPhoneBlank(raw)) return true;
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
  autoFocus,
  size = 'default',
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
  autoFocus?: boolean;
  size?: 'default' | 'sm';
}) {
  const parsed = useMemo(() => {
    if (!value.trim()) return { code: defaultCode, national: '' };
    const next = splitPhone(value);
    // Dial-code-only storage (`+971`) has no national digits — keep the chosen code.
    if (!next.national && COMMON_PHONE_CODES.some((c) => c.value === value.trim())) {
      return { code: value.trim(), national: '' };
    }
    return next;
  }, [value, defaultCode]);

  const { code, national } = parsed;
  const showHint = national.length > 0 && national.length !== NATIONAL_PHONE_LENGTH;

  const codeOptions = useMemo(
    () =>
      COMMON_PHONE_CODES.map((item) => ({
        value: item.value,
        label: CODE_DISPLAY_LABELS[item.value],
        shortLabel: item.value,
      })),
    [],
  );

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
        <Combobox
          aria-label="Country code"
          options={codeOptions}
          value={code || defaultCode}
          onChange={setCode}
          disabled={disabled}
          searchable={false}
          contentMatchTrigger={false}
          size={size}
          className="w-[4.75rem] shrink-0 px-2 font-medium"
          contentClassName="w-[8rem] [&_[cmdk-group]]:p-0.5 [&_[cmdk-item]]:py-1.5"
        />
        <Input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={national}
          disabled={disabled}
          placeholder={placeholder}
          aria-invalid={ariaInvalid || showHint}
          maxLength={NATIONAL_PHONE_LENGTH}
          onChange={(e) => setNational(e.target.value)}
          inputSize={size}
          className="flex-1"
        />
      </div>
      {showHint ? (
        <p className="text-[length:var(--control-text-sm)] font-medium leading-snug text-destructive">
          Enter a {NATIONAL_PHONE_LENGTH}-digit number
        </p>
      ) : null}
    </div>
  );
}
