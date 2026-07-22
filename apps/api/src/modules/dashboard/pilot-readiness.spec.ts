import { describe, expect, it } from 'vitest';
import {
  buildPilotReadinessPayload,
  derivePilotReadinessStatus,
  operateReadyForPilot,
  parsePilotProgramSettings,
} from './pilot-readiness';

const baseInput = {
  orgSlug: 'pilot-agency',
  isSharedDemoSeed: false,
  hasOrgProfile: true,
  hasBranding: true,
  hasSalesUser: true,
  hasTravellerIntake: true,
  hasQuotePath: true,
  hasMarkupOrTaxConfigured: true,
  hasProposalPreview: true,
  hasSuppliers: true,
  hotelSupplierContactOk: true,
  transferSupplierContactOk: true,
  activitySupplierContactOk: true,
  hotelRateActive: true,
  transferRateActive: true,
  activityRateActive: true,
  hasSupplierEnquiry: true,
  hasSupplierConfirm: true,
  hasPayable: true,
  hasVoucher: true,
  demoOperatePackActive: false,
  hasNonDemoSupplier: true,
  hasTestRoles: true,
  fitDemoSamplesExcludedUnderstood: true as const,
};

describe('pilot-readiness', () => {
  it('parses pilotProgram settings', () => {
    expect(parsePilotProgramSettings({})).toEqual({
      mode: 'none',
      evidenceComplete: false,
      startedAt: undefined,
      replayPrivacyConfirmed: undefined,
    });
    expect(
      parsePilotProgramSettings({
        pilotProgram: { mode: 'proxy', evidenceComplete: true },
      }).mode,
    ).toBe('proxy');
  });

  it('never treats demo-operate-only as operate-ready for pilot', () => {
    expect(
      operateReadyForPilot({
        operateComplete: true,
        demoOperatePackActive: true,
        hasNonDemoSupplier: false,
      }),
    ).toBe(false);
    expect(
      operateReadyForPilot({
        operateComplete: true,
        demoOperatePackActive: true,
        hasNonDemoSupplier: true,
      }),
    ).toBe(true);
  });

  it('derives status without market_proven', () => {
    expect(
      derivePilotReadinessStatus({
        quoteComplete: true,
        operateReadyForPilot: true,
        evidenceCompleteTrack: false,
        settings: { mode: 'none', evidenceComplete: false },
      }),
    ).toBe('operate_ready');
    expect(
      derivePilotReadinessStatus({
        quoteComplete: true,
        operateReadyForPilot: true,
        evidenceCompleteTrack: true,
        settings: { mode: 'proxy', evidenceComplete: false },
      }),
    ).toBe('proxy_tested');
    expect(
      derivePilotReadinessStatus({
        quoteComplete: true,
        operateReadyForPilot: true,
        evidenceCompleteTrack: true,
        settings: { mode: 'named', evidenceComplete: true },
      }),
    ).toBe('pilot_evidence_complete');
  });

  it('flags operateReadyFromDemoOnly when pack is the only supplier source', () => {
    const payload = buildPilotReadinessPayload(
      {
        ...baseInput,
        demoOperatePackActive: true,
        hasNonDemoSupplier: false,
      },
      { mode: 'none', evidenceComplete: false },
    );
    expect(payload.operateReadyFromDemoOnly).toBe(true);
    expect(payload.status).toBe('quote_ready');
    expect(payload.marketProvenAuto).toBe(false);
  });

  it('reaches operate_ready when real suppliers exist', () => {
    const payload = buildPilotReadinessPayload(baseInput, {
      mode: 'none',
      evidenceComplete: false,
    });
    expect(payload.status).toBe('operate_ready');
    expect(payload.operate.complete).toBe(true);
  });
});
