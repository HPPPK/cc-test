# Expert saved-answer handoff

- Surface: provider/runtime, agent-loop, server.
- A green Desktop answer receipt proves persistence, not delivery of a successful AskUserQuestion tool result to the model.
- In session `1d089e07-1ffe-4947-a8f7-52e41865b152`, the server saved both scope answers, but a later redundant client intake-admission RPC returned `EXPERT_INTAKE_UNAVAILABLE` before the tool body executed. The original transport cause was not recorded; do not claim a proven proxy or network failure.
- Keep the client and server local-tool exemptions in `src/utils/expertResearchIntakePolicy.ts`. Reading supplied material, asking/receiving scope answers, inspecting scope and loading a Skill must not depend on the extra admission RPC. Actual research/delegation remains guarded.
- Use direct bounded local transport for inspect/admission. Retry read-only acknowledgements once; never blindly retry a scope mutation whose commit acknowledgement may have been lost. Preserve a safe error phase/code without logging secrets or raw response bodies.
- Expert package prompts and server-injected runtime instructions must agree: inspect first; assess only when requested. `requiresAssessment=false` with `clear`/`delegated` means reuse canonical dimensions. A transport error does not establish that saved answers were lost or a card was never delivered.
- Proof: `expertIntakeAnswerHandoff.integration.test.ts` exercises real persisted answers, a lost HTTP acknowledgement, research admission and suppression of a repeated card. `toolExecution.test.ts` checks the actual AskUserQuestion tool output under an unavailable redundant admission route. A mock/HTTP proof is not a live-model continuation claim.
