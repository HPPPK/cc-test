---
name: Codex Edit and Test
referenceId: codex:edit-and-test
description: Apply scoped code edits and run the narrowest useful verification for the changed surface.
user-invocable: false
---

Use this skill when a workflow phase authorizes Codex to implement a planned batch.

- Stay inside the approved write set and avoid unrelated formatting or reversions.
- Inspect the owning files, make the smallest behavior-preserving edit, and add same-area regression coverage when production code changes.
- Run a targeted check first, then report broader gate blockers separately if they remain.

