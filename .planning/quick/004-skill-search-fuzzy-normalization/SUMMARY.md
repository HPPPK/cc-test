# Skill Search Fuzzy Normalization

## Outcome

Implemented separator-insensitive matching for the Settings skills search.

Typing `spdebug` now matches a skill whose name is `sp-debug`. Existing case-insensitive substring matching is preserved.

## changed_code_paths

- Modified: `desktop/src/components/skills/SkillList.tsx`
- Modified: `desktop/src/__tests__/skillsSettings.test.tsx`
- Added: `.planning/quick/004-skill-search-fuzzy-normalization/STATUS.md`
- Added: `.planning/quick/004-skill-search-fuzzy-normalization/SUMMARY.md`

## changed_behavior_surfaces

- Desktop Settings skills search filter now compares both:
  - the original lowercase search text
  - a compact normalized form with non-alphanumeric separators removed
- Desktop skills settings tests now cover `spdebug` matching `sp-debug`.

## verification_evidence

- RED: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx --run`
  - Failed before production edit because `spdebug` did not find `Debug Workflow`.
- GREEN focused: `cd desktop; bun run test -- src/__tests__/skillsSettings.test.tsx --run`
  - Passed 8 tests.
- Desktop gate: `bun run check:desktop`
  - Passed `tsc --noEmit`, 96 Vitest files / 826 tests, and production Vite build.
  - Existing `generalSettings.test.tsx` React `act(...)` warnings were printed but did not fail the gate.

## residual_risk

- `bun run check:coverage --changed` did not reach coverage collection because existing quarantine entries are past their `reviewAfter` dates:
  - `server:cron-scheduler`
  - `server:providers-real`
  - `server:tasks`
  - `server:e2e:business-flow`
  - `server:e2e:full-flow`
- This is a repository quality-gate blocker unrelated to the two touched Skills UI files, but it prevents a clean coverage-gate claim in this pass.

## project_cognition_refresh

- Entry lexicon/query state was weak for this UI-specific request:
  - `readiness: blocked`
  - `recommended_next_action: review_project_cognition_update`
  - `missing_coverage: no_graph_candidate_matched_query`
- Inline closeout was run:
  - `project-cognition update -reason 'workflow-finalize quick 004 skill search fuzzy normalization' ...`
  - Result: `result_state: partial_refresh`, `readiness: review`
  - Returned minimal live reads:
    - `desktop/src/__tests__/skillsSettings.test.tsx`
    - `desktop/src/components/skills`
    - `desktop/src/components/skills/SkillList.tsx`

## surface_conclusions

- Desktop Settings skills separator-insensitive search: fixed in this quick task.
- Same-area regression coverage: confirmed correct.
- Desktop area gate: confirmed correct.
- Changed-line coverage gate: not checked in this pass because quarantine governance blocks coverage startup.
- Project cognition closeout: partial refresh, not clean ready/no_op.
