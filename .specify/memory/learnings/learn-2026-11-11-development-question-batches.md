# Development workflow clarification should batch independent questions and converge

- Type: user_preference / state_surface_gap
- Applies to: canonical efficient-constrained-dev-debug-workflow-v5; AskUserQuestion; workflow runtime prompts and reconnect.
- Trigger: excessive serial Stage 1/2 questions; every preference marked blocking; optional batch disappears on reconnect.

User direction on 2026-11-11: auto/on may explore more consequential preferences, with a lower necessity threshold than off mode, but independent questions should be shown together and submitted once. Only dependent follow-ups require another round. Stop when the goal, success criteria, core flows and MVP/non-goals support a coherent scope proposal and no critical conflict or authorization gap remains. Use reversible proposed defaults for minor gaps, separating them from user decisions.

The original failure crossed several layers: canonical template/private brainstorming skill, runtime prompt injection, workflow singleton-question admission, tool schema size, tabbed desktop rendering, answer recording and reconnect. Updating only prompt text leaves the hard singleton gate unchanged. Optional open questions also require recovery even though they do not block phase completion. A skipped optional item closes without fabricating an answer or consent. Required-answer validation must use server-owned issues rather than client-rewritten question flags.

Implementation preserves persistence shapes and tests v25 snapshots; canonical pack becomes v26. Existing running binaries are not updated by rebuilding a ZIP. Do not rewrite a live transcript/state or restart an active workflow merely to apply the new source.

Evidence: workflowDevelopmentQuestionPolicy.test.ts; workflowCompletionGate.test.ts; workflowToolPolicy.test.ts; websocket-handler.test.ts; desktop AskUserQuestion.test.tsx; scripts/quality-gate/workflow-ask-browser-e2e.ts. Browser smoke passed under artifacts/workflow-ask-browser-e2e/2026-11-11T09-33-13-695Z. Model adherence to semantic relevance/convergence is prompt-guided, not proven merely by schema/unit tests.

Final validation: 12 gate lanes passed / 0 failed / 0 skipped; changed-line coverage 93.21%. Whole-tree PR readiness remains blocked by the CLI-core approval policy. Full report: artifacts/quality-runs/2026-11-11T10-05-47-250Z/report.md. Coverage exposed an asynchronous test isolation pitfall: assert startup calls for the intended session and model hasSession becoming true after start, rather than counting unrelated late callbacks from previous sessions.
