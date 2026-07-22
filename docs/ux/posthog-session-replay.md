# PostHog Session Replay (pilot)

Enable only for **named pilot** orgs — not demo-only proof.

## Env (web)

```bash
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://us.i.posthog.com   # optional
```

Wired in [`apps/web/src/lib/progressiveComplexity/analytics.ts`](../../apps/web/src/lib/progressiveComplexity/analytics.ts):

- Lazy init when key present
- Session recording with input masking + PII selectors
- `identifyAnalyticsUser({ userId, role, orgId, journey, tripId, … })`

## Weekly ritual

1. Filter sessions by role / journey / new vs experienced
2. Note rage clicks, abandon loops, dead clicks
3. File structured friction-log rows
4. Classify escapes (Excel / personal WA reconstruction / eng help)
5. Rank fixes — correctness first; P5+ depth only after ≥3 same-pattern escapes

## Masking

Never leave traveller passport, payment card, phone, email, or supplier-commercial fields unmasked. Prefer `data-sensitive` / `data-pii` / `data-supplier-commercial` on sensitive DOM.

## Market proof link

Named-pilot evidence (friction log, claim recommendation): [scenarios/market-proof-evidence-pack.md](./scenarios/market-proof-evidence-pack.md). Session replay supports the pilot week; it does **not** by itself flip Market-proven.
