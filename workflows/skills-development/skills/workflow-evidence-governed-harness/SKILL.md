---
name: Workflow Evidence-Governed Harness
referenceId: workflow:evidence-governed-harness
description: Keep quality gates, subagent evidence, recovery attempts, and future workflow refinements bounded and auditable.
user-invocable: false
---

Use this skill in scenario QA, local preview, and final handoff after an implementation workflow has real evidence to inspect.

- Treat each quality gate as a bounded experiment: record the command or inspection, the relevant artifact/source baseline, result, and expected outcome.
- Before rerunning a failed gate, identify a meaningful product or required-artifact change. If the gate fingerprint is unchanged, do not rerun it blindly; record the unchanged blocker and route or ask for the missing decision instead.
- Keep recovery bounded. A failed gate gets one focused recovery attempt unless the phase explicitly authorizes more. A repeated unchanged failure is a blocker, not a reason for an infinite loop.
- Every subagent result must be traceable: role, task id when available, inputs/artifacts read, exact allowed actions, commands/checks performed, result status, evidence, blockers, risks, and the next owner. The parent must not promote a child summary without checking its return contract.
- An observed workflow weakness may become a refinement candidate only when it has evidence, a narrow proposed change, and an expected measurable outcome. Never auto-edit the workflow pack, its permissions, or the user's product files from a refinement observation. User acceptance is required before a candidate becomes a later pack change.
- Preserve the active phase boundary. This skill never grants tools, bypasses confirmation, or turns a validation phase into a repair phase.
