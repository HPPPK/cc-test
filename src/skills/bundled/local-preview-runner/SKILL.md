---
name: Workflow Local Preview Runner
referenceId: workflow:local-preview-runner
description: Discover, start, observe, and stop a local preview using only workflow-owned process safety rules.
user-invocable: false
---

Use this skill when a workflow phase needs a local app preview after implementation and quality checks.

- Discover the documented run command and existing port ownership before starting anything.
- Start only the workflow-owned preview process, capture the URL, logs, PID, and stop instructions.
- Do not install dependencies, run migrations, deploy, or repair preview failures unless a later phase explicitly authorizes it.

