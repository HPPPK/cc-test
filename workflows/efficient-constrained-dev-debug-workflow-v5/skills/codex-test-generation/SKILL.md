---
name: Codex Test Generation
referenceId: codex:test-generation
description: Add or refine focused regression tests for the behavior under review.
user-invocable: false
---

Use this skill when a workflow phase needs Codex to produce validation coverage without changing production behavior.

- Derive tests from the documented acceptance criteria, changed surface, and observed bug or behavior.
- Prefer focused unit or component tests before broad suites.
- Keep production edits out of test-only phases unless the workflow explicitly routes to repair.

