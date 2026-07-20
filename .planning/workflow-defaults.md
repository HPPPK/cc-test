# Workflow Defaults

## Canonical Development Workflow

- Canonical template id: `efficient-constrained-dev-debug-workflow-v5`
- Display name: `引导式产品开发流程`
- Source: user template
- Version: `8`
- Current role: primary development workflow for new-product/development coding work.

## Operating Rule

Unless the user explicitly specifies another workflow template, future development workflow changes should target `efficient-constrained-dev-debug-workflow-v5`.

This includes:
- prompt tuning
- stage instruction changes
- Stage 1-7 development-flow adjustments
- subagent/leader contract updates for development work
- brainstorming and app-framing behavior for development work
- local preview, verification, handoff, and memory behavior for the development flow

## Separate Workflows

These are separate specialized workflows and should not receive generic development changes unless explicitly requested:

- `feature-extension-workflow-v8` / `Feature Extension Workflow`
- `debug-repair-workflow-v8` / `Debug Repair Workflow`

## Rationale

The user has primarily used `引导式产品开发流程`, and the recent large Stage 1-7 development workflow tuning was intended for this canonical development template.
