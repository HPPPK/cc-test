# Open Questions

## Blocking

- none

## Non-Blocking

- Should the eventual strategy include policy changes to when full `bun run verify` is required?

## Answered

- Project cognition is fresh enough for broad testing architecture recommendations.
- First discussion scope should prioritize local development speed and PR/verify speed.
- Fast feedback lane target should be seconds to under 1 minute.
- Under-1-minute lane should preserve changed-area high-signal unit tests plus a tiny fixed core smoke set.
- First formal scope should both add a fast lane and reorganize verify into a layered workflow that uses it.
- Ordinary PR/verify should target under 5 minutes for routine changes.
- E2E, live-provider, and release-gate evidence can be conditional rather than mandatory for ordinary PR/verify.
- High quality means critical-path regression protection, low flaky rate, and changed-area coverage.
- Preferred technical direction is Option B: Layered PR Gate.
- Discussion should produce one bounded handoff, not split mode.
