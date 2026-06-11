# Open Questions: Settings Provider Import Export

## Hard Questions

### Q-001: Secret export policy

- question: Should provider exports ever include API keys/secrets, or should exports always be secret-free?
- owner: user
- latest_resolve_phase: before handoff assessment
- blocking_level: hard
- decision: Users may choose whether to include API keys/secrets.
- status: resolved
- recommended_option: Secret-free by default, with an explicit high-risk secret-including export mode.
- reason: This supports the user's desired flexibility while preserving a safe default.
- stop_and_reopen_condition: A later spec or implementation allows default export to include API keys, auth tokens, OAuth state, or official login state.

### Q-005: Secret export protection level

- question: What protection level should the optional secret-including export use?
- owner: user
- latest_resolve_phase: before handoff assessment
- blocking_level: hard
- decision: Use the recommended protection level.
- status: resolved
- recommended_option: Separate "export with secrets" action, warning, and second confirmation; never remember the choice.
- reason: Secret export is valid by user decision, but it should be hard to trigger accidentally.
- stop_and_reopen_condition: Secret export is implemented as a casual remembered checkbox or unlabeled artifact.

## Soft Questions

### Q-002: Conflict default

- question: When imported provider names or IDs conflict, should the default be rename/add or overwrite?
- owner: user or downstream-contract
- latest_resolve_phase: specification
- blocking_level: soft
- decision: Default to rename/add; overwrite only after explicit selection.
- status: resolved
- recommended_option: Rename/add by default; overwrite only after explicit selection.
- stop_and_reopen_condition: Import silently overwrites an existing provider.

### Q-003: Active provider metadata

- question: Should exported active-provider information be imported as a suggestion or applied automatically?
- owner: user or downstream-contract
- latest_resolve_phase: specification
- blocking_level: soft
- decision: Do not export or import active/default provider selection.
- status: resolved
- recommended_option: Provider import/export covers provider records only; local selection stays local.
- stop_and_reopen_condition: Import changes the active provider or export includes selected/default provider state.

### Q-004: UI pass

- question: Does the user want a short UI/interaction discussion before handoff?
- owner: user
- latest_resolve_phase: before handoff if UI details are considered blocking
- blocking_level: soft
- decision: Deferred because user requested handoff to specify.
- status: deferred
- recommended_option: Accept a short UI pass after the secret policy is confirmed.
- stop_and_reopen_condition: Downstream spec lacks enough UI state requirements for import preview, conflict handling, and warnings.

## Evidence Questions

### E-001: Raw vs masked provider API key behavior

- question: Is provider list/get supposed to return raw API keys or masked API keys?
- owner: evidence/downstream-contract
- latest_resolve_phase: implementation design
- blocking_level: hard for secure implementation, soft for product discussion
- recommended_option: Treat raw API key exposure as unsafe until resolved; design export redaction on the server, not only in UI.
- stop_and_reopen_condition: Export implementation trusts frontend masking comments without proving server behavior.
