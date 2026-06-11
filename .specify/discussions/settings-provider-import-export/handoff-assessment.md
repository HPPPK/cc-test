# Handoff Assessment: Settings Provider Import Export

- decided_at: 2026-06-10T13:51:52.7189300+08:00
- decision_status: ready-for-specify
- required_next_action: write-unified-handoff

## Rationale

The discussion now describes one coherent feature boundary: Settings > Providers import/export for shareable provider configuration bundles in the current cc-jiangxia repository.

Product decisions are sufficiently locked for `sp-specify`:

- Export/import covers provider records, not active/default local selection.
- Default export is secret-free.
- Users may explicitly choose a separate high-risk "export with secrets" path.
- Secret export requires warning, second confirmation, clear artifact labeling, and no remembered preference.
- Import uses preview before commit.
- Import conflicts default to add/rename; overwrite requires explicit selection.
- Import does not auto-activate providers or mutate active runtime env.

## Assessment Dimensions

- feature_coherence: ready
- implementation_target_clarity: ready
- current_repository_role: implementation target and discussion host
- reference_source_clarity: ready, with existing workflow import/export as UI/process precedent
- planning_shape: unified feature, no split required
- validation_shape: server provider tests plus desktop Settings provider tests
- risk_profile: security-sensitive due to optional credential export and provider persistence mutation

## Remaining Non-Blocking Unknowns

- UI details are deferred: exact button placement, dialog layout, and warning copy.
- Evidence conflict is carried forward: frontend type comment says provider `apiKey` is masked from server, but server tests currently expect raw API key in provider list responses. This must be resolved during specification or implementation design.

## Outcome

Proceed with one unified draft handoff pair:

- `.specify/discussions/settings-provider-import-export/handoff-to-specify.md`
- `.specify/discussions/settings-provider-import-export/handoff-to-specify.json`

The pair remains a draft until user review confirms it.
