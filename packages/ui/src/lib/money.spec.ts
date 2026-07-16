import { describe, expect, it } from 'vitest';
import {
  currencyAdornment,
  parsePrice,
  sanitizePriceInput,
} from './money';

describe('sanitizePriceInput', () => {
  it('allows empty and partial decimals', () => {
    expect(sanitizePriceInput('')).toBe('');
    expect(sanitizePriceInput('12.')).toBe('12.');
    expect(sanitizePriceInput('0.5')).toBe('0.5');
  });

  it('rejects letters and extra dots', () => {
    expect(sanitizePriceInput('12a')).toBeNull();
    expect(sanitizePriceInput('1.2.3')).toBeNull();
  });

  it('strips leading zeros and caps fraction digits', () => {
    expect(sanitizePriceInput('007')).toBe('7');
    expect(sanitizePriceInput('1.2399', { maxFractionDigits: 2 })).toBe('1.23');
  });

  it('strips commas from pasted values', () => {
    expect(sanitizePriceInput('1,500.50')).toBe('1500.50');
  });
});

describe('parsePrice', () => {
  it('parses finite numbers and blanks', () => {
    expect(parsePrice('1500.5')).toBe(1500.5);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
  });
});

describe('currencyAdornment', () => {
  it('returns a symbol or code for INR', () => {
    const s = currencyAdornment('INR');
    expect(s === '₹' || s === 'INR' || s.includes('₹')).toBe(true);
  });
});
