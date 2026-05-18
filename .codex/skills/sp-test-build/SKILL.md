---
name: "sp-test-build"
description: "Use when a completed test-system scan exists and you need to build or refresh the repository's unit testing system through leader-managed execution waves."
compatibility: "Requires spec-kit project structure with .specify/ directory"
metadata:
  author: "github-spec-kit"
  source: "templates/commands/test-build.md"
---
## Invocation Syntax

- In this integration, invoke workflow skills with `$sp-plan`-style syntax.
- References such as `/sp.plan`, `/sp.tasks`, or `next_command: /sp.plan` are canonical workflow-state identifiers and handoff values.
- Preserve those canonical state tokens exactly in artifacts and workflow state; do not rewrite them to this integration's invocation syntax.



## Workflow Contract Summary

- **When to use**: A test-system scan has produced build-ready lanes, and the repository needs actual tests, fixtures, coverage commands, framework/config updates, or a durable testing contract.
- **Primary objective**: Execute the approved test-build waves with leader/subagent coordination, update repository-local test assets, and publish the testing contract, playbook, and baseline that later workflows consume automatically.
- **Primary outputs**: Updated tests/fixtures/config as authorized by `.specify/testing/TEST_BUILD_PLAN.md` or `.specify/testing/TEST_BUILD_PLAN.json`, plus `.specify/testing/TESTING_CONTRACT.md`, `.specify/testing/TESTING_PLAYBOOK.md`, `.specify/testing/COVERAGE_BASELINE.json`, and `.specify/testing/testing-state.md`.
- **Default handoff**: Resume /sp.specify, /sp.plan, /sp.tasks, /sp.implement, or /sp.debug with the generated testing contract in force; route remaining testing-system waves through /sp-test-build.
- **Execution note**: This summary is routing metadata only. Follow the full contract below end-to-end rather than inferring behavior from the description alone.

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Objective

Build or refresh the repository's unit testing system from scan-approved lanes through a leader-managed execution workflow.

## Context

- This command is project-level, not feature-level. It consumes `TEST_SCAN.md`, `TEST_BUILD_PLAN.md`, and preferably `TEST_BUILD_PLAN.json`.
- Primary inputs are scan artifacts, existing tests, live source files needed as read refs, testing templates, project map artifacts, and project memory.
- Durable outputs are repository-local tests/fixtures/config changes authorized by lane packets plus `TESTING_CONTRACT.md`, `TESTING_PLAYBOOK.md`, `COVERAGE_BASELINE.json`, and `testing-state.md`.
- Treat bundled `*-testing` skills as built-in language testing guidance selected by scan/build evidence.

## Process

- Validate scan/build-plan artifacts before selecting work.
- Choose the current ready wave and compile `TestBuildPacket` inputs for every executable lane.
- Dispatch subagents for bounded test-building lanes when packets are valid and write sets are isolated.
- Keep shared config, global fixture, CI, dependency, and production-code testability changes on serial leader-owned lanes unless explicitly authorized.
- Join every subagent result, run targeted validation, perform test-quality review, and update state before starting the next wave.
- Publish the final testing contract, playbook, and coverage baseline only after truthful validation evidence exists or explicit blockers are recorded.

## Output Contract

- Add or update tests, fixtures, helpers, or local test config only as authorized by ready build lanes.
- Write `.specify/testing/TESTING_CONTRACT.md`.
- Write `.specify/testing/TESTING_PLAYBOOK.md`.
- Write `.specify/testing/COVERAGE_BASELINE.json`.
- Update `.specify/testing/UNIT_TEST_SYSTEM_REQUEST.md` when build evidence changes the brownfield testing program.
- Update `.specify/testing/testing-state.md` with current wave, lane, accepted/rejected results, validation evidence, open gaps, and next command.

## Guardrails

- Do not start without `TEST_SCAN.md` and a build plan unless the only safe action is routing back to `/sp-test-scan`.
- Do not dispatch subagents without a validated `TestBuildPacket`.
- Do not let subagents edit files outside their write set.
- Do not edit production code by default. Any testability refactor must be a leader-owned serial lane with an explicit reason and regression validation.
- Do not mark build complete without actual command evidence or a recorded blocker.

## Mandatory Subagent Execution

All substantive tasks in ordinary `sp-*` workflows default to and must use subagents.

The leader orchestrates: route, split tasks, prepare task contracts, dispatch subagents, wait for structured handoffs, integrate results, verify, and update state.

Before dispatch, every subagent lane needs a task contract with objective, authoritative inputs, allowed read/write scope, forbidden paths, acceptance checks, verification evidence, and structured handoff format.

Use `execution_model: subagent-mandatory`.
Use `dispatch_shape: one-subagent | parallel-subagents`.
Use `execution_surface: native-subagents`.


## Pre-Execution Checks

**Check for extension hooks (before testing build)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_test` key.
- If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
  - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
- For each executable hook, output the following based on its `optional` flag:
  - **Optional hook** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory hook** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the testing inventory.
    ```
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.

## Passive Project Learning Layer

- [AGENT] Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify learning start --command test-build --format json` when available so passive learning files exist, the current testing-system build sees relevant shared project memory, and repeated high-signal lessons can be surfaced through the learning index at start.
- Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` in that order before broader testing-system analysis.
- Open only learning detail docs linked from testing-relevant index entries, especially repeated flaky areas, framework constraints, or project defaults that should influence the generated testing contract.
- Learning Reflex: before final closeout, ask whether a future senior engineer would benefit from seeing this lesson before related work. If yes, update `.specify/memory/learnings/INDEX.md` and the linked detail markdown document without asking for routine permission.
- [AGENT] When testing-system build friction exposes validation failures, artifact rewrites, false starts, hidden dependencies, or reusable constraints, make sure `testing-state.md` captures that durable context.
- [AGENT] Prefer `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify learning capture-auto --command test-build --format json` when testing-state already captures reusable gaps, follow-up routing, or validation evidence.
- [AGENT] When `testing-state.md` does not capture the reusable lesson cleanly, update `.specify/memory/learnings/INDEX.md` and a linked detail document with the command, type, summary, and evidence.
- Treat this as passive shared memory, not as a separate user-visible workflow.

## Testing State Protocol

- `TESTING_STATE_FILE=.specify/testing/testing-state.md` is the project-level testing-system source of truth for `sp-test-build`.
- [AGENT] Create or resume `TESTING_STATE_FILE` before substantial testing analysis.
- Read `.specify/templates/testing/testing-state-template.md`.
- If `TESTING_STATE_FILE` exists and is non-terminal, resume from it instead of rebuilding intent from chat memory.
- Track at least:
  - `active_command: sp-test-build`
  - `status: build-planning | executing | joining | validating | blocked | complete`
  - `build_status: pending | executing | blocked | complete`
  - `mode: bootstrap | refresh`
  - `selected_modules`
  - `selected_language_skills`
  - `next_action`
  - `next_command`
  - `handoff_reason`
  - `open_gaps`
  - `adopted_frameworks`
  - `coverage_notes`
  - `unit_test_system_request`
  - `test_scan`
  - `test_build_plan`
  - `test_build_plan_json`
  - `current_wave`
  - `current_lane`
  - `accepted_results`
  - `rejected_results`
  - `failed_validation`

## Outline

1. **Establish repository context**
   - Confirm the repository root and treat this workflow as project-level rather than feature-level.
   - **Project cognition gate:** query the active project's runtime before broad
     repository reads.

     Run or emulate:

     ```text
     uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition lexicon --intent test --query=\"$ARGUMENTS\" --format json
     # Agent: generate <query_plan_json> from raw user intent plus returned map terms.
     uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify project-cognition query --intent test --query-plan \"<query_plan_json>\" --format json
     ```

     Use the returned readiness:

     - `ready`: continue with the returned task-local bundle.
     - `review`: perform only the returned `minimal_live_reads` before continuing.
     - `ambiguous`: ask the user to select the intended candidate.
     - `needs_update`: route through `$sp-map-update`.
     - `needs_rebuild`: route through `$sp-map-scan`, then `$sp-map-build`.
     - `blocked`: stop and report the blocking runtime issue.
   - Treat testing-surface coverage as insufficient when the current project cognition query bundle cannot yet tell you:
     - which modules or packages own the main truth-bearing logic
     - which test frameworks and conventions already govern those modules
     - which workflows or integration seams are regression-sensitive
     - which startup, CI, or operator commands are required to run tests safely
   - [AGENT] If testing-surface cognition coverage is insufficient for the current repository, stop and tell the user to refresh through `$sp-map-update` with changed paths or affected surfaces; rebuild through `$sp-map-scan`, then `$sp-map-build` only when the baseline is missing, unusable, schema-incompatible, explicitly being rebuilt, or invalidated by broad architecture replacement; wait for that refresh before continuing.
   - **CARRY FORWARD**: Carry project-cognition testing-surface ownership, covered
     modules, verification nodes, coverage gaps, and required live reads
     from the query bundle and `TEST_BUILD_PLAN` into `testing-state.md` before
     selecting build lanes.
   - Read `.specify/testing/TESTING_CONTRACT.md` and `.specify/testing/TESTING_PLAYBOOK.md` when present.
   - Read `.specify/memory/constitution.md`, `.specify/memory/project-rules.md`, and `.specify/memory/learnings/INDEX.md` when present; open only relevant linked learning detail docs.

2. **Validate scan/build inputs before execution**
   - [AGENT] Read `.specify/testing/TEST_SCAN.md`, `.specify/testing/TEST_BUILD_PLAN.md`, and `.specify/testing/TEST_BUILD_PLAN.json` before selecting work.
   - If none of those scan/build-plan artifacts exist, stop and route to `$sp-test-scan`; do not rebuild the scan from chat memory inside `sp-test-build`.
   - Treat `.specify/testing/TEST_BUILD_PLAN.json` as the machine-readable lane source when it exists. Use the Markdown plan only as human-readable context when both exist.
   - Refuse to start concrete build work unless at least one lane is `ready` and each ready lane has:
     - `lane_id`
     - `read_refs`
     - `write_set`
     - `allowed_actions`
     - `forbidden_actions`
     - `validation_command`
     - `done_condition`
   - Treat lanes marked `needs-leader-review`, `needs-research`, or `blocked` as non-executable until the leader resolves the missing decision and records the resolution in `TESTING_STATE_FILE`.
   - If a lane requests shared config, global fixture, CI, dependency, or production-code changes, the leader owns only the coordination, sequencing, review, and acceptance gate. When the change is safe, packetize it as a validated serial subagent lane that runs before any parallel subagent work starts. If a safe serial dispatch cannot be made, record `subagent-blocked` with the escalation or recovery reason and stop instead of making the edit directly.
   - Record the selected `current_wave`, `current_lane`, executable lanes, skipped lanes, and gate failures in `TESTING_STATE_FILE`.

3. **Inventory the current testing surface**
   - Run `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify testing inventory --format json` from the repository root.
   - Treat the command output as the canonical starting inventory for:
     - `module_root`
     - `module_name`
     - `module_kind`
     - `language`
     - `manifest_path`
     - `selected_skill`
     - `framework`
     - `framework_confidence`
     - `canonical_test_path`
     - `canonical_test_command`
     - `coverage_command`
     - `command_tiers`
     - `state`
     - `classification_reason`
   - If the command returns no modules, record the inventory gap, create a safe read-only recovery scan lane when one can be packetized, or stop with `subagent-blocked` for escalation instead of inventing fake module boundaries.
   - Record the inventory in `TESTING_STATE_FILE`.

4. **Choose the run mode**
   - If the user explicitly requests `audit-only`, `report-only`, or equivalent wording, stop and route to `$sp-test-scan`; `sp-test-build` is an execution workflow.
   - Else if `.specify/testing/TESTING_CONTRACT.md` does not exist, or major modules have no usable unit-test framework/config, set mode to `bootstrap`.
   - Else set mode to `refresh`.

5. **Select bundled language testing skills**
   - Start from `selected_skill` in the `uvx --from git+https://github.com/chenziyang110/spec-kit-plus.git@a2f1f2ba1cdaf4f7a1c85870121c2ec3eb60f3f6 specify testing inventory --format json` payload.
   - Use the inventory result as the default skill choice unless newer repository evidence proves it wrong.
   - Treat each selected `*-testing` skill as part of the built-in Spec Kit testing workflow lane used by `sp-test-scan` and `sp-test-build`, not as a separate plugin hunt or an unrelated optional addon.
   - If a module already has a stable framework, keep the inventory-selected skill and extend that framework rather than rebuilding from scratch.
   - If the inventory identifies a language but no stable framework, use the selected language testing skill to choose the recommended default.
   - When reporting the selection, explicitly tell the user which bundled skill was selected for each module and that the mapping comes from the bundled passive `*-testing` skills shipped with Spec Kit Plus.
   - Record the final module -> skill mapping in `TESTING_STATE_FILE`, including any override reason when the runtime selection differs from the inventory payload.

6. **Choose an execution dispatch shape before broad test-system work begins**
   - [AGENT] Before repository fan-out begins, assess workload shape and the current agent capability snapshot, then apply the shared policy contract: `choose_subagent_dispatch(command_name="test-build", snapshot, workload_shape)`.
   - Persist the decision fields exactly: `execution_model: subagent-mandatory`, `dispatch_shape: one-subagent | parallel-subagents`, `execution_surface: native-subagents`.
   - Decision order is fixed:
     - One safe validated test-build lane -> `one-subagent` on `native-subagents` when available.
     - Two or more safe isolated test-build lanes -> `parallel-subagents` on `native-subagents` when available.     - No safe lane, overlapping writes, missing packet, or unavailable delegation -> `subagent-blocked` with a recorded reason.
   - If collaboration is justified, keep `sp-test-build` lanes limited to:
     - bounded module test additions
     - local fixtures/helpers authorized by a lane packet
     - module-local coverage command execution
     - read-only test-quality review lanes
   - Required join points:
     - before mutating shared repository test framework/config files
     - after every parallel wave
     - before accepting a subagent result
     - before writing the consolidated `.specify/testing/*` artifacts
   - Record the chosen strategy, reason, any blocked dispatch or escalation decision, selected lanes, and join points in `TESTING_STATE_FILE`.

7. **Compile and validate `TestBuildPacket` inputs**
   - [AGENT] Compile a `TestBuildPacket` for each executable subagent lane before dispatch.
   - [AGENT] Validate each packet before dispatch. A valid `TestBuildPacket` must include:
     - `lane_id`
     - `wave_id`
     - `module`
     - `risk_tier`
     - `read_refs`
     - `write_set`
     - `allowed_actions`
     - `forbidden_actions`
     - `validation_command`
     - `done_condition`
     - `result_handoff_path`
   - Hard rule: do not dispatch from raw scan prose or raw Markdown checklist items alone.
   - Hard rule: a subagent may only edit files inside its `write_set`.
   - Hard rule: shared config, global fixtures, CI/presubmit, dependency, and production-code edits must be delegated through an explicit validated serial `TestBuildPacket` when safe. The leader owns coordination, review, and acceptance only. If the serial lane cannot be safely packetized or dispatched, record `subagent-blocked` and stop for escalation or recovery.
   - Store packet paths or packet summaries in `TESTING_STATE_FILE` before dispatch.
   - Use this packet shape when no runtime-specific packet schema exists:

     ```json
     {
       "lane_id": "build-cli-core-unit-tests-wave-1",
       "wave_id": "wave-1-critical-contracts",
       "module": "src/specify_cli",
       "risk_tier": "P0",
       "read_refs": [
         "project-cognition query bundle",
         ".specify/testing/TESTING_CONTRACT.md",
         ".specify/testing/TESTING_PLAYBOOK.md"
       ],
       "write_set": ["tests/test_cli_core.py"],
       "allowed_actions": ["add tests", "add module-local fixtures"],
       "forbidden_actions": ["edit shared config", "rewrite existing tests", "edit production code"],
       "validation_command": "pytest tests/test_cli_core.py -q",
       "done_condition": "critical public CLI behavior has meaningful assertions and the targeted command passes",
       "result_handoff_path": ".specify/testing/worker-results/build-cli-core-unit-tests-wave-1.json"
     }
     ```

8. **Dispatch subagents and join results**
   - The invoking runtime acts as the test-build leader. It selects the current wave, dispatches bounded lanes, integrates results, and owns validation.
   - For `parallel-subagents`, dispatch subagents for all safe lanes in the current wave before any test-build work begins; if dispatch cannot cover the safe wave, record `subagent-blocked` with the blocker and stop for escalation or recovery.
  - For `one-subagent`, dispatch one subagent only when the lane has a validated `TestBuildPacket` with all required fields. If the packet is not yet safe, complete the packet before dispatch; if subagent dispatch is unavailable, record `subagent-blocked` with the blocker and stop for escalation or recovery before test-build implementation begins.
   - Subagents must return a structured handoff with:
     - `lane_id`
     - `reported_status: done | done_with_concerns | blocked | needs_context`
     - `changed_files`
     - `tests_added_or_changed`
     - `commands_run`
     - `command_results`
     - `open_gaps`
     - `quality_notes`
   - Idle subagent is not an accepted result.
   - The leader must wait for and consume every structured handoff before closing the join point, starting the next wave, or updating consolidated testing artifacts.
   - Rejected results must be recorded in `TESTING_STATE_FILE` under `rejected_results` with the reason and retry policy.

9. **Bootstrap or refresh the testing system**
   - For each selected module:
     - define the framework/config files that should exist
     - define the canonical test commands and coverage commands
     - define the minimum baseline test categories needed for safe TDD in that module
     - add or refresh foundational tests, fixtures, and helpers as justified by repository evidence
   - Push beyond happy-path-only scaffolding: critical public/module-facing behavior, truth-owning branches, boundary conditions, and known regression-prone error paths should receive meaningful automated coverage unless an explicit gap is recorded.
   - Run coverage after the first meaningful test pass, compare the result to the intended module thresholds, then iterate on uncovered critical paths instead of stopping at the first green run.
   - Keep iterating until thresholds are met or an explicit blocker is recorded with the uncovered hotspot, why it remains open, and the next recommended action.
   - Prefer foundational unit-test coverage for truth-owning surfaces, shared coordination surfaces, validation logic, adapters, and bug-prone seams before broad low-signal test volume.
   - Do not delete or silently rewrite existing user-owned tests unless the user explicitly asks for cleanup.

10. **Run test-quality review lanes**
   - After each wave, run a read-only test-quality review lane when the wave adds or changes non-trivial tests.
   - The reviewer checks:
     - tests assert public contracts or documented boundaries rather than private implementation details
     - assertions are meaningful and not smoke-only
     - mocks/fakes do not hide the behavior under test
     - fixtures are reusable without becoming global coupling
     - tests are not flaky or timing-dependent
     - existing testing style is preserved
   - The leader must either accept the review, repair the lane, or record a deliberate exception before the wave is considered joined.

11. **Generate durable testing assets**
   - Read `.specify/templates/testing/testing-contract-template.md`, `.specify/templates/testing/testing-playbook-template.md`, `.specify/templates/testing/coverage-baseline-template.json`, `.specify/templates/testing/unit-test-system-request-template.md`, `.specify/templates/testing/test-scan-template.md`, `.specify/templates/testing/test-build-plan-template.md`, and `.specify/templates/testing/test-build-plan-template.json`.
   - Write `.specify/testing/TESTING_CONTRACT.md` with:
     - project testing scope
     - covered-module rules, including covered-module status values and the minimum evidence required before a module can be treated as covered
     - mandatory testing rules for future work
     - module-level framework ownership
     - test update triggers
     - regression-test requirements for bug fixes
     - command-tier expectations for `fast smoke`, `focused`, and `full` commands
     - local integration seam expectations for module seams that require local fake/mock or integration-style coverage
     - coverage baseline and threshold policy
   - Write `.specify/testing/TESTING_PLAYBOOK.md` with:
     - environment setup
     - install/build commands
     - run-all-tests command
     - targeted module/file test commands
     - command-tier expectations for `fast smoke`, `focused`, and `full`, including when each tier should be run
     - covered-module rules that explain how to interpret covered-module status when adding or changing tests
     - local integration seam expectations and examples for adapter, filesystem, process, network, database, CLI, or workflow seams
     - coverage commands
     - CI commands
     - TDD loop guidance for this repository
     - where new tests belong, how they should be named, and which helper/fixture layers they should reuse
   - Preserve each lane's canonical `validation_command` when publishing command tiers. `validation_command` remains the lane acceptance command and compatibility field for existing packet consumers; do not replace it with a command-tier map. When command tiers are present, the lane's `focused` command should mirror the canonical `validation_command` unless the build plan records an explicit exception. The lane's `full` command is the broader regression/final-verification tier and must not be treated as the lane acceptance command.
   - Write `.specify/testing/COVERAGE_BASELINE.json` with current per-module baseline data and explicit unknowns where measurement is not yet reliable.
   - Write `.specify/testing/UNIT_TEST_SYSTEM_REQUEST.md` as the professional-grade brownfield unit-test system request for later planning work. It must capture:
     - current test-surface assessment by module
     - `small / medium / large` test policy and target mix
     - public-contract testing rule plus mock / fake strategy
     - module risk tiers and module priority waves
     - scenario matrix rows for critical public behavior, invalid input, boundary conditions, exception handling, and local integration seams
     - coverage uplift waves, CI/presubmit gate policy, and allowed testability refactors
     - the recommended next workflow route when the work continues beyond this bootstrap pass

12. **Push the contract back into the main workflow**
   - Treat the generated testing contract as active project guidance for later `sp-plan`, `sp-tasks`, `sp-implement`, and `sp-debug` runs.
   - If the contract exists after this run, later workflows should no longer treat tests as globally optional for affected behavior changes.
   - Treat `.specify/testing/UNIT_TEST_SYSTEM_REQUEST.md` as the primary brownfield testing-program input whenever the repository needs a phased unit-test construction or coverage uplift program.

13. **Validation and reporting**
   - Set `TESTING_STATE_FILE` to `validating` while checking:
     - the testing contract and playbook exist
     - the unit-test system request exists when brownfield test-system work was discovered
     - the module inventory is complete enough for later workflows
     - canonical test and coverage commands are explicit
     - the selected framework ownership is recorded for each touched module
   - Manually execute the canonical test commands and relevant coverage command at least once for each touched module when the environment supports it; if execution is blocked, record the exact blocker instead of pretending validation happened.
   - Record the most recent manual validation run in `TESTING_STATE_FILE`, including the command(s), timestamp, exit status, and a short result summary.
   - If a module could not be safely updated, record it as an explicit `open_gap` with the next recommended action.
   - Only mark the state `complete` after the contract, playbook, baseline, inventory, and successful manual validation evidence are all written truthfully; otherwise leave the run `blocked` or keep explicit open gaps.
   - Classify the next workflow recommendation before the final report.
   - Include the selected bundled language testing skills in the final report and note that they are part of the built-in `sp-test-scan` / `sp-test-build` testing workflow surface.
   - Include the most recent manual validation run in the final report so later workflows can see what was actually executed, not just what was documented.
   - Recommend exactly one next command and persist the recommendation in `TESTING_STATE_FILE` as `next_command`, `next_action`, and `handoff_reason`.
   - Route the recommendation using this order:
     - If no actionable gaps remain and the repository now has a usable testing contract, resume the previous workflow. If no prior workflow context is recoverable, fall back to the metadata default handoff.
     - If the remaining work is a single command, config, or helper repair with obvious local verification, recommend `$sp-fast`.
     - If the remaining work is a single bounded module or surface, such as one failing test file, one module-specific harness pass, or one local fixture/helper repair, recommend `$sp-quick`.
     - If the remaining work spans multiple modules, multiple failure classes, a coverage uplift program, or changes that need explicit scope and acceptance planning, recommend `$sp-specify`.
     - If the remaining work is an execution-time regression inside an already active feature and the failure still needs diagnosis, recommend `$sp-debug`.
     - If the remaining work is an execution-time regression inside an already active feature and the fix path is already understood and bounded, resume `$sp-implement`.
   - Include the recommended next command and one-line rationale in the final report so the workflow does not end in a dead-end audit summary.
   - When recommending `$sp-specify`, explicitly name `.specify/testing/UNIT_TEST_SYSTEM_REQUEST.md` as required starting context for the brownfield testing-system program.
   - When recommending `$sp-quick` or `$sp-fast`, name the single module, risk tranche, coverage wave, or tiny harness/config/helper repair that should be executed next from the request.
- [AGENT] Before the final completion report, if auto-capture did not preserve a reusable `pitfall`, `workflow_gap`, or `project_constraint`, use the manual `learning capture` helper surface.
  Required options: `--command`, `--type`, `--summary`, `--evidence`

14. **Check for extension hooks**
   - After reporting, check if `.specify/extensions.yml` exists in the project root.
   - If it exists, read it and look for entries under the `hooks.after_test` key.
   - If the YAML cannot be parsed or is invalid, skip hook checking silently and continue normally.
   - Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
   - For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
     - If the hook has no `condition` field, or it is null/empty, treat the hook as executable
     - If the hook defines a non-empty `condition`, skip the hook and leave condition evaluation to the HookExecutor implementation
   - For each executable hook, output the same optional/mandatory hook blocks used by other workflows.

## Operating Rules

- Treat `audit-only`, `report-only`, and equivalent wording as scan-only requests; route them to `$sp-test-scan` before any repository-modifying build work.
- Prefer extending an existing, working test system over replacing it.
- Focus on unit-testing and unit-test-adjacent regression safety for TDD. Do not silently broaden into a large E2E migration.
- If coverage measurement is unavailable for a module, record that explicitly in the baseline and playbook instead of inventing numbers.
- Use the user's current language for explanatory text while preserving literal command names, file paths, and status values exactly as written.

## Codex Subagent Dispatch Contract

- Execution model: `subagents-first`
- Dispatch shape: `one-subagent`, `parallel-subagents`, or `subagent-blocked`
- Execution surface: `native-subagents`, `managed-team`, or `leader-inline`
- Delegation surface contract: preserve the native dispatch, fallback, worker result contract, and handoff path below.
- Native subagent dispatch: No subagent dispatch path for this session.
- Join behavior: Stay on the leader path or use the managed team workflow.
- Managed-team fallback: No managed team workflow is currently available; use leader-inline fallback only when subagents cannot proceed safely.
- Leader-inline fallback: record the reason before local execution.
- Worker result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result handoff path: .specify/teams/state/results/<request-id>.json

## Codex Subagent Result Contract

- Worker result contract: preserve the shared `WorkerTaskResult` semantics even when the runtime calls lanes subagents.
- Preferred result contract: WorkerTaskResult contract with status, changed files, validation evidence, blockers, failed assumptions, and recovery guidance.
- Result file handoff path: .specify/teams/state/results/<request-id>.json
- Normalize subagent-reported statuses like `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, and `NEEDS_CONTEXT` into the shared `WorkerTaskResult` contract before the leader accepts the handoff.
- Keep `reported_status` when normalization occurs so runtime-specific subagent language can be reconciled with canonical orchestration state.
- Wait for every subagent's structured handoff before accepting the join point, closing the batch, or declaring completion.
- Do not treat an idle subagent as done work; idle without a consumed handoff means the result channel is still unresolved.
- Do not interrupt or shut down subagent work before the handoff has been written or explicitly reported as `BLOCKED` or `NEEDS_CONTEXT`.
- Treat `DONE_WITH_CONCERNS` as completed work plus follow-up concerns, not as silent success.
- Treat `NEEDS_CONTEXT` as a blocked handoff that must carry the missing context or failed assumption explicitly.

## Codex Subagents-First Dispatch

When running `sp-test-build` in Codex, use the subagents-first dispatch model.
- Use `spawn_agent` for bounded lanes when `dispatch_shape` is `one-subagent` or `parallel-subagents`.
- Launch all independent lanes in the current `parallel-subagents` wave before waiting.
- Use `leader-inline-fallback` only after recording why Codex native subagents are unavailable or unsafe.
- Dispatch validated `TestBuildPacket` lanes with isolated write sets.
- Keep shared config, global fixture, CI, dependency, and production-code testability lanes on the leader path unless the packet explicitly authorizes a serial lane.
- Use `wait_agent` only at the documented build join points after each parallel wave and before consolidated testing artifacts are updated.
- Use `close_agent` after integrating finished build or review results.
- Wait for every subagent's structured handoff before accepting a lane, starting the next wave, or marking build complete.
