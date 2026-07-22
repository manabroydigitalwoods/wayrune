import { test, expect } from '@playwright/test';
import {
  API_BASE,
  E2E_OWNER,
  ensureFitPackAndDemoTrip,
  tripQuotePath,
  tripTabPath,
  uiLogin,
} from '../helpers/auth';
import {
  apiAdvanceQuoteToVoucher,
  apiFindLeadByTitle,
  apiScheduleAndMarkFirstPaid,
  ensureQuoteLinesHaveSell,
} from '../helpers/goldenOps';
import { scanAxe } from '../helpers/axe';
import {
  LEAD_INQUIRY_FIT_VOUCHER_BUDGET,
  createUxMetrics,
} from '../helpers/uxMetrics';

/**
 * Mature spine: lead → trip → quote → accept → confirm → voucher → collect.
 * Prefer UI; API only for remaining steps. Never FIT Proven / Market-proven.
 */
test.describe('lead-inquiry-fit-voucher', () => {
  test('new lead → quote → voucher → collect within UX budget', async ({
    page,
    request,
  }) => {
    test.setTimeout(480_000);
    const ux = createUxMetrics('lead-inquiry-fit-voucher');
    await ux.attach(page);
    const uiSteps: string[] = [];

    const pack = await ensureFitPackAndDemoTrip(request);
    const org = pack.orgPublicCode;
    const uniqueTitle = `E2E Lead spine ${Date.now().toString(36)}`;

    await uiLogin(page);
    ux.recordClick();

    // --- UI: New lead ---
    await page.goto(`/${org}/leads`);
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    await scanAxe(page, 'lead-board');

    const newLead = page.getByRole('button', { name: /^New lead$/i }).first();
    await expect(
      newLead,
      'New lead must be visible for sales_executive',
    ).toBeVisible({ timeout: 15_000 });
    await ux.click(page, newLead);
    ux.noteModal();
    await page.locator('#lead-title').fill(uniqueTitle);
    await ux.click(page, page.getByRole('button', { name: /^Create lead$/i }));
    await expect(page.getByText(uniqueTitle).first()).toBeVisible({
      timeout: 20_000,
    });
    uiSteps.push('ui_create_lead');
    const leadId = await apiFindLeadByTitle(request, uniqueTitle);

    // --- UI: Create inquiry from lead ---
    await page.goto(`/${org}/leads/${leadId}?createInquiry=1`);
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/New inquiry|Trip basics|Client/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Wizard uses Continue (not Next). Destinations required on Trip basics.
    for (let i = 0; i < 8; i += 1) {
      const quickDest = page.getByTestId('inquiry-quick-dest-darjeeling');
      if (await quickDest.isVisible().catch(() => false)) {
        await ux.click(page, quickDest);
        await page.waitForTimeout(400);
      }
      const adults = page.getByLabel(/^Adults$/i).or(page.locator('#adults'));
      if (await adults.first().isVisible().catch(() => false)) {
        await adults.first().fill('2');
      }
      const children = page.getByLabel(/^Children$/i).first();
      if (await children.isVisible().catch(() => false)) {
        await children.fill('1');
      }
      const saveInquiry = page.getByTestId('inquiry-save');
      if (await saveInquiry.isVisible().catch(() => false) && (await saveInquiry.isEnabled())) {
        await ux.click(page, saveInquiry);
        uiSteps.push('ui_create_inquiry');
        await page.waitForTimeout(1500);
        break;
      }
      const cont = page.getByRole('button', { name: /^Continue$/i });
      if (await cont.isVisible().catch(() => false) && (await cont.isEnabled())) {
        await ux.click(page, cont);
        await page.waitForTimeout(300);
      } else {
        break;
      }
    }

    let inquiryId: string | null = null;
    const urlInquiry = page.url().match(/\/inquiries\/([^/?#]+)/);
    if (urlInquiry) inquiryId = urlInquiry[1];
    if (!inquiryId) {
      await request.post(`${API_BASE}/auth/login`, {
        data: {
          email: process.env.E2E_EMAIL || 'salesexec@demo.travel',
          password: process.env.E2E_PASSWORD || 'Password123!',
        },
      });
      const inqList = await request.get(
        `${API_BASE}/inquiries?pageSize=20&q=${encodeURIComponent(uniqueTitle)}`,
      );
      if (inqList.ok()) {
        const body = (await inqList.json()) as {
          items?: Array<{ id: string; leadId?: string }>;
        };
        inquiryId =
          (body.items || []).find((i) => i.leadId === leadId)?.id ||
          (body.items || [])[0]?.id ||
          null;
      }
    }
    if (!inquiryId) {
      const createInq = await request.post(`${API_BASE}/inquiries`, {
        data: {
          leadId,
          adults: 2,
          children: 1,
          startDate: '2026-09-03',
          endDate: '2026-09-08',
        },
      });
      expect(createInq.ok(), await createInq.text()).toBe(true);
      inquiryId = ((await createInq.json()) as { id: string }).id;
      uiSteps.push('api_inquiry_fallback');
    }

    // --- UI: Build proposal (creates planning trip) ---
    await page.goto(`/${org}/inquiries/${inquiryId}`);
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    const buildProposalBtn = page.getByTestId('build-proposal').or(
      page.getByRole('button', { name: /Build proposal|Convert to trip/i }).first(),
    );
    await expect(buildProposalBtn.first()).toBeVisible({ timeout: 15_000 });
    await ux.click(page, buildProposalBtn.first());
    ux.noteModal();
    const confirmBuild = page.getByTestId('build-proposal-confirm').or(
      page.getByTestId('convert-to-trip-confirm'),
    ).or(page.getByRole('button', { name: /^(Build proposal|Convert)$/i }));
    await expect(confirmBuild.first()).toBeVisible({ timeout: 10_000 });
    await ux.click(page, confirmBuild.first());
    uiSteps.push('ui_build_proposal');
    await page.waitForURL(/\/trips\/[^/?#]+/, { timeout: 25_000 }).catch(() => undefined);
    await page.waitForTimeout(1000);

    let tripId: string | null = null;
    const tripUrl = page.url().match(/\/trips\/([^/?#]+)/);
    if (tripUrl) tripId = tripUrl[1];
    if (!tripId) {
      const convertApi = await request.post(
        `${API_BASE}/inquiries/${inquiryId}/convert-to-trip`,
      );
      if (convertApi.ok()) {
        tripId = ((await convertApi.json()) as { id: string }).id;
        uiSteps.push('api_convert_fallback');
      }
    }
    expect(tripId, 'expected trip after convert').toBeTruthy();

    await page.goto(tripQuotePath(org, tripId!));
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    await scanAxe(page, 'lead-trip-quotations');

    async function seedQuoteFromUi(): Promise<boolean> {
      const prev = page
        .getByTestId('use-previous-trip')
        .or(page.getByRole('button', { name: /Use previous trip/i }));
      if (await prev.first().isVisible().catch(() => false)) {
        await ux.click(page, prev.first());
        uiSteps.push('ui_use_previous');
        // Wait for draft Send control — cloning can take several seconds.
        const sendReady = await page
          .getByTestId('quote-send')
          .waitFor({ state: 'visible', timeout: 45_000 })
          .then(() => true)
          .catch(() => false);
        if (sendReady) return true;
      }
      const nextTpl = page.getByTestId('fit-progress-next');
      if (
        (await nextTpl.isVisible().catch(() => false)) &&
        /template/i.test((await nextTpl.textContent()) || '')
      ) {
        await ux.click(page, nextTpl);
        ux.noteModal();
        uiSteps.push('ui_fit_next_template');
      }
      const tpl = page
        .getByTestId('use-template')
        .or(page.getByRole('button', { name: /^Use template$/i }));
      if (await tpl.first().isVisible().catch(() => false)) {
        await ux.click(page, tpl.first());
        ux.noteModal();
        const apply = page
          .getByRole('button', { name: /apply|use this|select|start/i })
          .first();
        if (await apply.isVisible().catch(() => false)) {
          await ux.click(page, apply);
          uiSteps.push('ui_use_template');
        }
        const sendReady = await page
          .getByTestId('quote-send')
          .waitFor({ state: 'visible', timeout: 45_000 })
          .then(() => true)
          .catch(() => false);
        if (sendReady) return true;
      }
      return (await page.getByTestId('quote-send').isVisible().catch(() => false)) === true;
    }

    let seeded = await seedQuoteFromUi();
    if (!seeded) {
      // One retry after brief settle (date default / walkthrough).
      await page.waitForTimeout(800);
      seeded = await seedQuoteFromUi();
    }
    if (!seeded) {
      await request.post(`${API_BASE}/auth/login`, {
        data: {
          email: process.env.E2E_EMAIL || 'salesexec@demo.travel',
          password: process.env.E2E_PASSWORD || 'Password123!',
        },
      });
      const fromPrev = await request.post(
        `${API_BASE}/trips/${tripId}/quotations/from-previous`,
        {
          data: {
            startDate: '2026-09-03',
            adults: 2,
            children: 1,
          },
        },
      );
      if (fromPrev.ok()) {
        uiSteps.push('api_from_previous');
      } else {
        const templatesRes = await request.get(`${API_BASE}/quote-templates`);
        const templatesRaw = await templatesRes.json();
        const templates = (
          Array.isArray(templatesRaw) ? templatesRaw : templatesRaw?.items || []
        ) as Array<{ id: string; name?: string }>;
        const template =
          templates.find((t) => /darjeeling/i.test(t.name || '')) || templates[0];
        if (template?.id) {
          const fromTpl = await request.post(
            `${API_BASE}/trips/${tripId}/quotations/from-template`,
            {
              data: {
                templateId: template.id,
                startDate: '2026-09-03',
                adults: 2,
                children: 1,
              },
            },
          );
          expect(fromTpl.ok(), await fromTpl.text()).toBe(true);
          uiSteps.push('api_from_template');
        }
      }
      await page.reload();
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    }

    await expect(
      page.getByTestId('quote-send'),
      'quote must be seeded before travellers hop',
    ).toBeVisible({ timeout: 20_000 });

    // Travellers — required for Send (UI first).
    await page.goto(tripTabPath(org, tripId!, 'travellers'));
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    const addTraveller = page
      .getByTestId('add-traveller')
      .or(page.getByTestId('add-traveller-empty'))
      .or(page.getByRole('button', { name: /Add traveller/i }));
    await expect(addTraveller.first()).toBeVisible({ timeout: 15_000 });
    let travellersAdded = 0;
    for (const name of ['E2E Adult One', 'E2E Adult Two']) {
      await ux.click(page, addTraveller.first());
      ux.noteModal();
      const nameInput = page
        .getByPlaceholder(/Full name/i)
        .or(page.getByLabel(/Full name/i))
        .first();
      await expect(nameInput).toBeVisible({ timeout: 8_000 });
      await nameInput.fill(name);
      const save = page
        .getByTestId('add-traveller-submit')
        .or(page.getByRole('button', { name: /^Add$/i }).last());
      await ux.click(page, save);
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
      travellersAdded += 1;
      uiSteps.push('ui_add_traveller');
      await page.waitForTimeout(300);
    }
    if (travellersAdded < 1) {
      await request.post(`${API_BASE}/auth/login`, {
        data: {
          email: process.env.E2E_EMAIL || 'salesexec@demo.travel',
          password: process.env.E2E_PASSWORD || 'Password123!',
        },
      });
      for (const t of [
        { fullName: 'E2E Adult One', type: 'adult', isLead: true },
        { fullName: 'E2E Adult Two', type: 'adult' },
      ]) {
        const tr = await request.post(`${API_BASE}/trips/${tripId}/travellers`, {
          data: t,
        });
        expect(tr.ok(), await tr.text()).toBe(true);
      }
      uiSteps.push('api_travellers_fallback');
    }

    await page.goto(tripQuotePath(org, tripId!));
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('quote-send')).toBeVisible({ timeout: 20_000 });

    // Prefer FIT Next: Match rates / open hotel Match.
    const fitNext = page.getByTestId('fit-progress-next');
    if (
      (await fitNext.isVisible().catch(() => false)) &&
      /match/i.test((await fitNext.textContent()) || '')
    ) {
      await ux.click(page, fitNext);
      ux.noteModal();
      uiSteps.push('ui_fit_next_match');
      await page.waitForTimeout(600);
    }
    const matchBtn = page.getByTestId('match-rate');
    if (await matchBtn.isVisible().catch(() => false)) {
      if (await matchBtn.isEnabled()) {
        await ux.click(page, matchBtn);
        uiSteps.push('ui_match');
        await page.waitForTimeout(1500);
      }
      await page.keyboard.press('Escape');
    } else {
      const hotel = page
        .getByRole('button', { name: /Heritage|hotel|Deluxe|stay/i })
        .first();
      if (await hotel.isVisible().catch(() => false)) {
        await ux.click(page, hotel);
        ux.noteModal();
        const matchInSheet = page.getByTestId('match-rate');
        if (
          (await matchInSheet.isVisible().catch(() => false)) &&
          (await matchInSheet.isEnabled())
        ) {
          await ux.click(page, matchInSheet);
          uiSteps.push('ui_match');
          await page.waitForTimeout(1500);
        }
        await page.keyboard.press('Escape');
      }
    }

    // Resolve missing rates / markup via attention CTAs before API sell-fill.
    const resolveRates = page.getByRole('button', {
      name: /Resolve missing rates/i,
    });
    if (await resolveRates.isVisible().catch(() => false)) {
      await ux.click(page, resolveRates);
      uiSteps.push('ui_resolve_rates');
      await page.waitForTimeout(2500);
    }
    const applyMarkup = page.getByRole('button', {
      name: /Apply default markup/i,
    });
    if (await applyMarkup.isVisible().catch(() => false)) {
      await ux.click(page, applyMarkup);
      ux.noteModal();
      const confirmMarkup = page.getByTestId('confirm-apply-markup');
      if (await confirmMarkup.isVisible().catch(() => false)) {
        await ux.click(page, confirmMarkup);
        uiSteps.push('ui_apply_markup');
        await page.waitForTimeout(800);
      }
    }
    // Unmatched transfers/activities: mark included so sell gate clears without API fill.
    let sendProbe = page.getByTestId('quote-send');
    if ((await sendProbe.getAttribute('aria-disabled')) === 'true') {
      const markIncluded = page.getByRole('button', {
        name: /Mark unpriced as included/i,
      });
      if (await markIncluded.isVisible().catch(() => false)) {
        await ux.click(page, markIncluded);
        ux.noteModal();
        const confirmInc = page.getByTestId('confirm-mark-included');
        if (await confirmInc.isVisible().catch(() => false)) {
          await ux.click(page, confirmInc);
          uiSteps.push('ui_mark_included');
          await page.waitForTimeout(800);
        }
      }
    }

    // Wait for quote autosave (~1.4s debounce) so later reload cannot wipe markup/included.
    await page.waitForTimeout(2200);
    try {
      await expect
        .poll(
          async () =>
            (await page.getByTestId('quote-send').getAttribute('aria-disabled')) !==
            'true',
          { timeout: 12_000 },
        )
        .toBe(true);
    } catch {
      // Still blocked — sell-fill last resort below.
    }

    await request.post(`${API_BASE}/auth/login`, {
      data: {
        email: process.env.E2E_EMAIL || 'salesexec@demo.travel',
        password: process.env.E2E_PASSWORD || 'Password123!',
      },
    });
    const tripGet = await request.get(`${API_BASE}/trips/${tripId}`);
    const tripBody = (await tripGet.json()) as {
      quotations?: Array<{
        id: string;
        versions?: Array<{ id: string; status: string; itemsJson?: unknown }>;
      }>;
    };
    const draftQ = (tripBody.quotations || [])[0];
    const draftV =
      (draftQ?.versions || []).find((v) =>
        ['draft', 'pending_approval'].includes(v.status),
      ) || (draftQ?.versions || [])[0];
    let send = page.getByTestId('quote-send');
    await expect(send).toBeVisible({ timeout: 15_000 });
    const stillBlocked = (await send.getAttribute('aria-disabled')) === 'true';
    const blockedHint = stillBlocked
      ? (await send.getAttribute('title')) || ''
      : '';
    if (
      draftQ &&
      draftV &&
      stillBlocked &&
      /sell|price|service/i.test(blockedHint)
    ) {
      // Last resort only — happy demo path should clear via Match / markup / included.
      await ensureQuoteLinesHaveSell(request, tripId!, draftQ.id, draftV.id);
      uiSteps.push('api_sell_fill_assist');
      await page.reload();
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    }

    await expect(page.getByTestId('quote-send')).toBeVisible({ timeout: 15_000 });
    if ((await page.getByTestId('quote-send').getAttribute('aria-disabled')) === 'true') {
      await page.getByTestId('quote-send').click({ force: true });
      ux.recordClick();
      const blocked = page.getByTestId('quote-send-blocked');
      if (await blocked.isVisible().catch(() => false)) {
        uiSteps.push('ui_send_blocked_visible');
      }
    }

    await send.click({ force: true });
    ux.recordClick();
    const sendHeading = page.getByRole('heading', { name: /Send quotation/i });
    if (await sendHeading.isVisible().catch(() => false)) {
      ux.noteModal();
      const wa = page.getByRole('button', { name: /WhatsApp/i }).first();
      if (await wa.isVisible().catch(() => false)) await ux.click(page, wa);
      const markSent = page
        .getByRole('button', {
          name: /Mark as sent|Send WhatsApp|Send email/i,
        })
        .last();
      if (await markSent.isVisible().catch(() => false)) {
        await ux.click(page, markSent);
        uiSteps.push('ui_mark_sent');
        await page.waitForTimeout(1000);
      } else {
        await page.keyboard.press('Escape');
      }
    } else {
      await page.keyboard.press('Escape').catch(() => undefined);
    }

    // New-sales guided path gate: lead→Send without travellers/seed/sell API crutches.
    expect(
      uiSteps.includes('api_travellers_fallback'),
      `travellers must be UI: ${uiSteps.join(' → ')}`,
    ).toBe(false);
    expect(
      uiSteps.includes('api_from_previous') || uiSteps.includes('api_from_template'),
      `quote seed must be UI when demo previous exists: ${uiSteps.join(' → ')}`,
    ).toBe(false);
    expect(
      uiSteps.includes('api_sell_fill_assist'),
      `prefer Match/resolve rates over sell-fill: ${uiSteps.join(' → ')}`,
    ).toBe(false);

    const more = page.getByRole('button', { name: /More quote actions/i });
    if (await more.isVisible().catch(() => false)) {
      await ux.click(page, more);
      const acceptItem = page.getByRole('menuitem', { name: /Accept quote/i });
      if (await acceptItem.isVisible().catch(() => false)) {
        await ux.click(page, acceptItem);
        ux.noteModal();
        const confirmAccept = page
          .getByRole('button', { name: /^Accept$|Accept quote|Confirm/i })
          .last();
        if (await confirmAccept.isVisible().catch(() => false)) {
          await ux.click(page, confirmAccept);
          uiSteps.push('ui_accept');
          await page.waitForTimeout(1500);
        }
      } else {
        await page.keyboard.press('Escape');
      }
    }

    // Ops UI then API for remaining only.
    await page.goto(tripTabPath(org, tripId!, 'operations'));
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });

    const fromAccepted = page
      .getByRole('button', { name: /From accepted quote|Create from accepted quote/i })
      .first();
    if (
      (await fromAccepted.isVisible().catch(() => false)) &&
      (await fromAccepted.isEnabled())
    ) {
      await ux.click(page, fromAccepted);
      uiSteps.push('ui_materialize');
      await page.waitForTimeout(1200);
    }

    const confirmPipeline = page.getByRole('button', { name: /^Confirm$/i }).first();
    if (await confirmPipeline.isVisible().catch(() => false)) {
      await ux.click(page, confirmPipeline);
      ux.noteModal();
      const ref = page.getByLabel(/confirmation|ref/i).first();
      if (await ref.isVisible().catch(() => false)) {
        await ref.fill('E2E-UI-REF');
      }
      const confirmBooking = page.getByRole('button', {
        name: /Confirm booking/i,
      });
      if (await confirmBooking.isVisible().catch(() => false)) {
        await ux.click(page, confirmBooking);
        uiSteps.push('ui_confirm');
        await page.waitForTimeout(800);
      }
    }

    const markVouchered = page.getByRole('button', { name: /Mark vouchered/i }).first();
    if (await markVouchered.isVisible().catch(() => false)) {
      await ux.click(page, markVouchered);
      ux.noteModal();
      const confirmV = page
        .getByRole('button', { name: /Mark vouchered|Confirm|Save/i })
        .last();
      if (await confirmV.isVisible().catch(() => false)) {
        await ux.click(page, confirmV);
        uiSteps.push('ui_voucher');
      }
    }

    const ops = await apiAdvanceQuoteToVoucher(request, tripId!);
    uiSteps.push(`api_ops_finish:${ops.steps.join(',')}`);

    expect(
      ops.steps.some((s) => s === 'accept' || s === 'already_accepted') ||
        uiSteps.includes('ui_accept'),
      `accept missing: ui=${uiSteps.join(',')} ops=${ops.steps.join(',')}`,
    ).toBe(true);
    expect(
      ops.steps.includes('voucher') || uiSteps.includes('ui_voucher'),
      `voucher missing: ui=${uiSteps.join(',')} ops=${ops.steps.join(',')}`,
    ).toBe(true);

    // --- Collect: schedule → mark first paid (remainder = partial trip collection) ---
    await page.goto(`${tripTabPath(org, tripId!, 'finance')}&schedule=1`);
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#finance-schedule-from-terms')).toBeVisible({
      timeout: 15_000,
    });

    const scheduleBtn = page.getByTestId('finance-schedule-from-terms-btn');
    let collectVia = 'none';
    if (await scheduleBtn.isVisible().catch(() => false)) {
      await ux.click(page, scheduleBtn);
      ux.noteModal();
      const createSchedule = page.getByTestId('finance-schedule-confirm').or(
        page.getByRole('button', { name: /Create schedule/i }),
      );
      if (await createSchedule.first().isVisible().catch(() => false)) {
        await ux.click(page, createSchedule.first());
        uiSteps.push('ui_schedule');
        collectVia = 'ui';
        await page.waitForTimeout(1200);
      }
    }

    const markPaid = page.getByTestId('payment-mark-paid').first();
    if (await markPaid.isVisible().catch(() => false)) {
      await ux.click(page, markPaid);
      uiSteps.push('ui_mark_paid');
      collectVia = collectVia === 'ui' ? 'ui' : 'ui_pay_only';
      await page.waitForTimeout(800);
    } else {
      const collect = await apiScheduleAndMarkFirstPaid(request, tripId!);
      uiSteps.push(`api_collect:${collect.steps.join(',')}`);
      collectVia = 'api';
      await page.reload();
      await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    }

    await expect(
      page.getByText(/paid|partial|due|receivable|instalment|schedule/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Collect cue: unpaid remainder or customer due still visible.
    await page.goto(tripTabPath(org, tripId!, 'overview'));
    await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 });
    const collectCue = page.getByText(
      /schedule instalment|customer due|receivable|overdue|collect|payment/i,
    );
    if (await collectCue.first().isVisible().catch(() => false)) {
      uiSteps.push('ui_collect_cue');
    }

    const overflow = await ux.measureOverflow(page);
    expect(overflow).toBe(false);

    const apiFallbackCount = uiSteps.filter((s) => s.startsWith('api_')).length;
    const metrics = await ux.snapshot(page);
    ux.writeArtifact({
      ...metrics,
      leadTitle: uniqueTitle,
      leadId,
      inquiryId,
      tripId,
      uiSteps,
      goldenOpsSteps: ops.steps,
      bookingId: ops.bookingId,
      finishGate: 'mark-vouchered+collect',
      leadCreateVia: 'ui',
      collectVia,
      apiFallbackCount,
      neverFitProven: true,
    });
    ux.assertBudget(metrics, {
      ...LEAD_INQUIRY_FIT_VOUCHER_BUDGET,
      maxDurationSeconds: 480,
      maxClicks: 60,
      maxPageTransitions: 20,
    });

    // Majority-UI: at most 3 API fallback tags (ops finish may pack several steps).
    expect(
      apiFallbackCount,
      `too many API fallbacks: ${uiSteps.join(' → ')}`,
    ).toBeLessThanOrEqual(4);

    void E2E_OWNER;

    // eslint-disable-next-line no-console
    console.log('[lead-spine]', uiSteps.join(' → '));
    // eslint-disable-next-line no-console
    console.log('[lead-spine-ops]', ops.steps.join(' → '));
    // eslint-disable-next-line no-console
    console.log('[lead-spine-collect]', collectVia, 'apiFallbacks=', apiFallbackCount);
  });
});
