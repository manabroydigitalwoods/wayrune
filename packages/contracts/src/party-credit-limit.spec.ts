import { describe, expect, it } from 'vitest';
import {
  evaluatePartyCreditLimit,
  partyCreditLimitBlockMessage,
  partyCreditLimitCue,
  paymentOutstandingAmount,
} from './party-credit-limit';

describe('paymentOutstandingAmount', () => {
  it('returns amount minus paid', () => {
    expect(paymentOutstandingAmount(1000, 400)).toBe(600);
    expect(paymentOutstandingAmount(500, 500)).toBe(0);
  });
});

describe('evaluatePartyCreditLimit', () => {
  it('is unlimited when no credit limit set', () => {
    expect(
      evaluatePartyCreditLimit({ creditLimit: null, outstanding: 90000 }),
    ).toMatchObject({
      limited: false,
      overLimit: false,
      headroom: null,
    });
  });

  it('detects over-limit exposure including pending amount', () => {
    expect(
      evaluatePartyCreditLimit({
        creditLimit: 500000,
        outstanding: 420000,
        pendingAmount: 100000,
      }),
    ).toMatchObject({
      limited: true,
      exposure: 520000,
      overLimit: true,
      overBy: 20000,
      headroom: 0,
    });
  });

  it('shows headroom when under limit', () => {
    expect(
      evaluatePartyCreditLimit({
        creditLimit: 500000,
        outstanding: 120000,
        pendingAmount: 50000,
      }),
    ).toMatchObject({
      overLimit: false,
      headroom: 330000,
    });
  });
});

describe('partyCreditLimitBlockMessage', () => {
  it('names exposure and override requirement', () => {
    expect(
      partyCreditLimitBlockMessage({
        creditLimit: 500000,
        exposure: 520000,
        overBy: 20000,
      }),
    ).toMatch(/credit limit exceeded/i);
  });
});

describe('partyCreditLimitCue', () => {
  it('returns headroom or over-limit copy', () => {
    expect(
      partyCreditLimitCue(
        evaluatePartyCreditLimit({
          creditLimit: 100000,
          outstanding: 40000,
        }),
      ),
    ).toMatch(/headroom/i);
    expect(
      partyCreditLimitCue(
        evaluatePartyCreditLimit({
          creditLimit: 100000,
          outstanding: 110000,
        }),
      ),
    ).toMatch(/Over credit limit/i);
  });
});
