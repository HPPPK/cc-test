---
slug: workflow-editor-buttons-hover-disappear
status: awaiting-human-verify
created: 2026-06-12T17:30:00+08:00
updated: 2026-06-12T17:51:00+08:00
source_command: sp-debug
execution_model: leader-inline
dispatch_shape: leader-inline
execution_surface: leader-inline
dispatch_reason: Small focused desktop UI visual-state defect with one likely component chain and direct local repro path.
blocked_reason:
causal_map_completed: true
investigation_contract_completed: true
log_investigation_plan_completed: true
observer_framing_completed: true
skip_observer_reason: map-backed-minimum-intake
---

# Workflow Editor Buttons Hover Disappear

## User Report

In Settings > Workflows, several top-right action buttons around the template manager/editor appear to disappear when the mouse hovers over them. The screenshot highlights the toolbar area and the Save button.

## Project Cognition Intake

- readiness: `review`
- freshness: `partial_refresh`
- selected concept: `concept:GEN-20260610T112843.959253900Z:N-030` as a broad coverage-gap route for desktop workflow component paths
- rejected concepts: git/branch workflow concepts; they do not cover UI hover behavior
- minimal live reads:
  - `desktop/src/components/workflow/WorkflowTemplateManager.tsx`
  - `desktop/src/components/workflow/WorkflowTemplateEditor.tsx`
  - `desktop/src/components/workflow/WorkflowComponents.test.tsx`
  - `desktop/src/components/shared/Button.tsx`

## Scope Boundary

In scope:
- Desktop Settings > Workflows manager/editor button hover visual state.
- Shared button styles only if they are the truth owner.
- Same-area component regression tests and local browser/runtime verification.

Out of scope:
- Workflow template API, registry, persistence, and sidecar behavior unless the UI evidence proves they are involved.
- Reintroducing builtin workflow templates.
- Changing unrelated Settings pages.

## Observer Framing

Primary suspected loop:
input hover event -> CSS hover selector on shared or local button class -> color/background/border transition -> text/icon contrast becomes invisible against the new background -> user observes disappeared button.

Contrarian candidate:
button is not actually invisible; a layout/sticky overlay or disabled/loading state may be covering/clipping the toolbar region only while hover changes scroll/focus state.

Recommended first probe:
Inspect the shared `Button` hover classes and the specific workflow manager/editor action button class composition, then reproduce in the running Vite/Tauri page and compare computed normal/hover colors.

Candidate-separating signals:
- If computed hover foreground equals or nearly equals hover background, the owner is CSS contrast.
- If bounding boxes or z-index change while colors remain visible, the owner is layout/overlay.
- If only disabled controls disappear, the owner is disabled/hover class interaction.

Nearest-neighbor related risk target:
Other Settings action buttons that use the same shared `Button` variant and icon-only/icon-text pattern.

## Investigation Contract

primary_candidate_id: `C1-css-hover-contrast`

candidate_queue:
- `C1-css-hover-contrast`: shared `Button` variant or local class makes text/icon transparent or same-colored on hover.
- `C2-layout-overlay`: the editor/toolbar sticky area or a parent overlay clips/covers buttons.
- `C3-disabled-state`: disabled/export/create state combines with hover styles to hide content.

related_risk_targets:
- `desktop/src/components/shared/Button.tsx`
- Workflow manager top toolbar buttons.
- Workflow editor cancel/save buttons.

## Log Investigation Plan

Existing logs are unlikely to explain a pure hover visual bug. Use browser/computed-style inspection and component tests as primary evidence. Escalate to screenshot or pixel-level browser checks if source inspection does not explain the symptom.

## Truth Ownership Map

Decision truth owner:
- CSS class composition in the rendered workflow toolbar/editor action buttons.

Reflection/cache layers:
- React component state only decides which buttons render and whether they are disabled.
- Browser rendering reflects computed styles and layout.

Expected closed loop:
mouse enters button -> hover selector applies -> visual style remains visible and accessible -> user sees stable button affordance.

## Current Focus

Read the minimal live component paths, identify the hover style owner, then reproduce the visual state before editing.

## Evidence

- Project cognition query returned the workflow manager/editor/shared button paths as minimal live reads.
- User screenshot shows hover-related disappearance around the manager toolbar and editor save/cancel controls.
- `desktop/src/components/workflow/WorkflowTemplateManager.tsx` uses raw primary workflow buttons with `bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]`.
- `desktop/src/components/workflow/WorkflowTemplateEditor.tsx` uses the same hover token for the Save button.
- `desktop/src/theme/globals.css` defines `--color-brand` and `--color-surface-hover`, but no `--color-brand-hover` definition was found.
- Current best-supported candidate is `C1-css-hover-contrast`: the hover state references a missing theme token, so primary workflow buttons can lose their intended hover background and appear blank against the page.

## Next Probe

Add a focused regression test that extracts workflow hover background tokens and requires each token to be defined in the global theme.

## Fix 2026-06-12T17:51:00+08:00

Changed:
- `desktop/src/theme/globals.css`: defined `--color-brand-hover` for light, white, and dark themes as `var(--color-primary-container)`.
- `desktop/src/components/workflow/WorkflowComponents.test.tsx`: added a regression test that extracts workflow hover background tokens from the manager/editor source and verifies they exist in global theme CSS.
- `desktop/src/theme/globals.test.ts`: added `--color-brand-hover` to the required per-theme token set.

Red/green evidence:
- Red: `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx` failed because `globals.css` did not contain `--color-brand-hover:`.
- Green: `cd desktop; bun run test src/components/workflow/WorkflowComponents.test.tsx src/theme/globals.test.ts` passed, 53 tests.
- Static check: `cd desktop; bun run lint` passed.
- Build check: `cd desktop; bun run build` passed.
- Built output contains `--color-brand-hover` in the generated CSS bundle.
- Project cognition update: `upd-20260612T093009.475303200Z`, result `partial_refresh` / readiness `review`; changed paths are queued for review.

Human verification request:
- In the running desktop app, refresh Settings > Workflows and hover the `新建` / `保存` primary buttons. They should remain visible and switch to the darker primary-container hover background instead of disappearing.

## Eliminated

- `C2-layout-overlay`: no source evidence of hover-driven bounding-box or z-index changes on the affected buttons.
- `C3-disabled-state`: the affected primary buttons are enabled controls and the repro was explained by the missing hover token.
