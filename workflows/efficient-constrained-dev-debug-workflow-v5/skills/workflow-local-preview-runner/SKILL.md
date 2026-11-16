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
- Prefer the host's Start App and Stop App controls when available. A successful start or HTTP check does not supply browser rendering or interaction evidence.
- Do not use the public-web Playwright tool for localhost, private-network or file URLs. Use an available authorized local-browser channel or one user-observed check; preserve not-run/blocked evidence if neither is available. Do not retry an unavailable browser capability as an application repair.

