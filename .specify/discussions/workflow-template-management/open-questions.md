# Open Questions: Workflow Template Management

## Hard Questions

- Q-001: Which management scope should the Settings item support in the first version?
  - Owner: user
  - Latest safe resolve phase: before handoff assessment
  - Stop-and-reopen condition: If downstream planning starts without deciding whether this is view-only, CRUD, or raw JSON management, return to discussion.
  - Status: resolved
  - Resolution: User selected CRUD form management.

- Q-005: Should the phase editor use a simple default field set with advanced fields collapsed by default?
  - Owner: user
  - Latest safe resolve phase: before handoff assessment
  - Stop-and-reopen condition: If downstream planning cannot decide whether to expose all phase schema fields immediately or hide advanced fields, return to discussion.
  - Status: resolved
  - Resolution: Use a simple/default field set with advanced fields collapsed by default.

- Q-006: Should the existing built-in Agent Development workflow be renamed/exposed as `spec-workflow`, or should `spec-workflow` be a user-created/example template?
  - Owner: user
  - Latest safe resolve phase: before handoff assessment
  - Stop-and-reopen condition: If downstream planning changes built-in template id/name without a user-confirmed compatibility decision, return to discussion.
  - Status: resolved
  - Resolution: Do not rename or change the built-in workflow. Keep it built-in/read-only and use it as a source template for user-defined workflows.

- Q-007: Should custom workflow templates be global user-level templates only, or should the first version also support project-level templates?
  - Owner: user
  - Latest safe resolve phase: before handoff assessment
  - Stop-and-reopen condition: If downstream planning starts without deciding whether custom templates live only in global user settings or can also live in project-local storage, return to discussion.
  - Status: resolved
  - Resolution: First version custom workflow templates are global user-level templates only.

- Q-008: Should import/export JSON be included in the first version, or should the first version stay form-based only?
  - Owner: user
  - Latest safe resolve phase: before handoff assessment
  - Stop-and-reopen condition: If downstream planning includes or excludes JSON import/export without user confirmation, return to discussion.
  - Status: resolved
  - Resolution: Include JSON import/export in the first version.

- Q-009: For JSON import id conflicts, should the UI preflight and ask per template whether to replace, rename, or skip?
  - Owner: user
  - Latest safe resolve phase: before handoff assessment
  - Stop-and-reopen condition: If downstream planning implements import without an explicit conflict policy, return to discussion.
  - Status: resolved
  - Resolution: Import preview lets the user select which workflows/templates to import. Conflicts default to automatic rename, not overwrite; users can edit/delete after import.

- Q-010: Should workflow mode be locked at session creation, or should existing normal chats be convertible into workflow sessions?
  - Owner: user
  - Latest safe resolve phase: before handoff assessment
  - Stop-and-reopen condition: If downstream planning implements chat workflow entry without deciding whether existing sessions can convert, return to discussion.
  - Status: resolved
  - Resolution: Add `Workflows` to the composer `+` menu. It opens a workflow selection dialog. Empty/new sessions reuse the current launch flow. Existing chats may enter Workflows only after explicit confirmation and context handling selection.

- Q-011: Should every Workflow phase require an explicit output artifact and handoff contract?
  - Owner: user
  - Latest safe resolve phase: before handoff assessment
  - Stop-and-reopen condition: If downstream planning treats phases as prompt-only steps instead of stage contracts, return to discussion.
  - Status: resolved
  - Resolution: Yes. Every phase must require an explicit output artifact and handoff contract.

- Q-012: When entering Workflows from a non-empty chat, should context handling offer two choices or three choices?
  - Owner: user
  - Latest safe resolve phase: before handoff assessment
  - Stop-and-reopen condition: If downstream planning starts workflow sessions from existing chats without deciding context carry-over semantics, return to discussion.
  - Status: resolved
  - Resolution: Offer three explicit choices: inherit current context; summarize current context, then start; clear context and start fresh. The summarize option should use `/compact`-style semantics.

- Q-013: After the user chooses inherit or summarize for a non-empty chat, should Workflows start in the current session in place, or create a linked new workflow session carrying the chosen context?
  - Owner: user
  - Latest safe resolve phase: before handoff assessment
  - Stop-and-reopen condition: If downstream planning starts workflow sessions from existing chats without deciding whether the current session is mutated or a new linked workflow session is created, return to discussion.
  - Status: resolved
  - Resolution: Create a linked new workflow session with inherited/summarized context. Do not mutate the original normal chat in place.

## Soft Questions

- Q-002: Should the UI include a detailed template schema editor or initially expose only raw JSON plus validation?
  - Owner: user
  - Latest safe resolve phase: planning
  - Stop-and-reopen condition: Reopen if implementation scope cannot fit the selected UX.

- Q-003: Should built-in templates be copyable into user templates?
  - Owner: user
  - Latest safe resolve phase: specification
  - Stop-and-reopen condition: Reopen if the user expects built-ins to be customized without editing them directly.
  - Status: resolved
  - Resolution: yes, built-ins are read-only but copyable into user templates.

- Q-004: Should Settings expose a shortcut from invalid template warnings in the session creation screen?
  - Owner: downstream-contract
  - Latest safe resolve phase: specification
  - Stop-and-reopen condition: Reopen if discoverability of invalid templates is a core acceptance criterion.
