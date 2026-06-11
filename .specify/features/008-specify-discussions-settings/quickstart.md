# Quickstart: Settings Provider Import Export

## Purpose

Use these scenarios to validate the implementation before handoff. They are written as expected behavior, not manual user documentation.

## Setup

- Start with a temp provider config directory in tests.
- Create two saved providers:
  - Provider A with a fixture API key.
  - Provider B with a different name/base URL.
- Activate Provider A in at least one server test so active-state non-mutation can be proven.

## Scenario 1 - Default Export Redacts Secrets

1. Add a provider with `apiKey: "sk-test-key-123"`.
2. Call the secret-free export endpoint/action.
3. Assert the returned bundle has `containsSecrets: false`.
4. Assert the serialized bundle does not contain `sk-test-key-123`.
5. Assert the bundle does not include active/default provider selection.

Expected evidence:

- Server test in `src/server/__tests__/providers.test.ts`.

## Scenario 2 - Secret Export Requires Explicit Confirmation

1. Call secret export without confirmation.
2. Assert the request is rejected.
3. Call secret export with confirmation.
4. Assert the bundle has `containsSecrets: true` and credential-bearing labeling metadata.
5. Assert no remembered preference is written.

Expected evidence:

- Server test for confirmation.
- Desktop test for warning and second confirmation UI.

## Scenario 3 - Import Preview Is Side-Effect Free

1. Capture provider index and managed settings before preview.
2. Preview a valid bundle.
3. Assert preview returns candidates and diagnostics.
4. Re-read provider index and managed settings.
5. Assert both are unchanged.

Expected evidence:

- Server test proving no persistence writes.

## Scenario 4 - Conflict Defaults To Add/Rename

1. Existing local provider has the same name as an imported candidate.
2. Preview the bundle.
3. Assert the candidate reports a conflict.
4. Assert default resolution is add/rename, not overwrite.
5. Commit with default/add/rename resolution.
6. Assert a new provider exists with a generated local ID and unique name.

Expected evidence:

- Server test for conflict preview and commit.
- Desktop test showing default resolution and selected action.

## Scenario 5 - Explicit Overwrite

1. Existing local provider conflicts with an imported candidate.
2. Preview the bundle.
3. Commit with explicit `overwrite` and target local provider ID.
4. Assert the local provider is updated.
5. Assert active provider selection is unchanged.

Expected evidence:

- Server test for explicit overwrite and active-state non-mutation.

## Scenario 6 - Import Missing Secrets

1. Import a secret-free bundle.
2. Commit a valid candidate.
3. Assert the saved provider exists with empty/missing credential state.
4. Assert the UI or diagnostics indicate credentials are needed before successful test/activation.

Expected evidence:

- Server test for stored provider shape.
- Desktop test for missing credential warning/diagnostic.

## Scenario 7 - Active Provider State Is Local Only

1. Activate a local provider.
2. Import a bundle containing one or more providers.
3. Assert `activeId` remains the original provider.
4. Assert managed active provider env is unchanged.

Expected evidence:

- Server test reads provider index and managed settings before/after commit.

## Commands For Implementation Verification

Run narrow checks first:

```bash
bun run check:server
cd desktop && bun run test
cd desktop && bun run lint
```

Then run the repository gate:

```bash
bun run verify
```

If coverage fails, read the latest `artifacts/coverage/<timestamp>/coverage-report.md` and fix changed-line coverage without lowering thresholds.
