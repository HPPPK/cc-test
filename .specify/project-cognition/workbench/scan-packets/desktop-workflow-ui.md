# MapScanPacket: desktop-workflow-ui

mode: read_only
packet_id: desktop-workflow-ui
lane_id: desktop-workflow-ui
result_handoff_path: .specify/project-cognition/workbench/worker-results/desktop-workflow-ui.json

## Objective
Collect graph-native scan evidence for desktop-workflow-ui.

## Authoritative Inputs
- .specify/project-cognition/workbench/repository-universe.json
- Live repository files listed below

## Allowed Read Scope
- desktop/src/__tests__/agentsSettings.test.tsx
- desktop/src/__tests__/diagnosticsSettings.test.tsx
- desktop/src/__tests__/generalSettings.test.tsx
- desktop/src/__tests__/mcpSettings.test.tsx
- desktop/src/__tests__/memorySettings.test.tsx
- desktop/src/__tests__/pluginsSettings.test.tsx
- desktop/src/__tests__/skillsSettings.test.tsx
- desktop/src/api/sessions.test.ts
- desktop/src/api/sessions.ts
- desktop/src/components/workflow/WorkflowComponents.test.tsx
- desktop/src/components/workflow/WorkflowComponents.tsx
- desktop/src/components/workflow/WorkflowImportExportDialog.tsx
- desktop/src/components/workflow/WorkflowReportLink.tsx
- desktop/src/components/workflow/WorkflowStartDialog.tsx
- desktop/src/components/workflow/WorkflowStatusPanel.tsx
- desktop/src/components/workflow/WorkflowTemplateEditor.tsx
- desktop/src/components/workflow/WorkflowTemplateManager.tsx
- desktop/src/components/workflow/WorkflowTemplatePicker.tsx
- desktop/src/components/workflow/WorkflowTransitionControls.tsx
- desktop/src/components/workflow/workflowTemplateDisplay.ts
- desktop/src/lib/__tests__/providerSettingsJson.test.ts
- desktop/src/lib/providerSettingsJson.ts
- desktop/src/pages/ActivitySettings.test.tsx
- desktop/src/pages/ActivitySettings.tsx
- desktop/src/pages/AdapterSettings.test.tsx
- desktop/src/pages/AdapterSettings.tsx
- desktop/src/pages/ComputerUseSettings.test.tsx
- desktop/src/pages/ComputerUseSettings.tsx
- desktop/src/pages/DiagnosticsSettings.tsx
- desktop/src/pages/EmptySession.test.tsx
- desktop/src/pages/EmptySession.tsx
- desktop/src/pages/McpSettings.tsx
- desktop/src/pages/MemorySettings.tsx
- desktop/src/pages/Settings.test.tsx
- desktop/src/pages/Settings.tsx
- desktop/src/pages/TerminalSettings.test.tsx
- desktop/src/pages/TerminalSettings.tsx
- desktop/src/stores/uiStore.test.ts
- desktop/src/stores/uiStore.ts
- desktop/src/types/session.ts

## Forbidden Paths
- .specify/** except the packet, repository-universe, and worker-result path for workflow operation
- node_modules/**, artifacts/**, build output, secrets, environment files

## Packet Ledger
- todo: 40 assigned paths
- doing: 0
- done: 0
- blocked: 0
- overflow: 0

## Acceptance Checks
- Return JSON at .specify/project-cognition/workbench/worker-results/desktop-workflow-ui.json
- Top-level acceptance must be pass or a fail_* value
- Repeat assigned_paths exactly
- paths_read must be a non-empty concrete path array
- Account for every assigned path in coverage
- Evidence rows must include source_path and support read/deep_read coverage outcomes

## Required Handoff Shape
{
  "packet_id": "desktop-workflow-ui",
  "acceptance": "pass",
  "assigned_paths": [],
  "paths_read": [],
  "coverage": [],
  "evidence": [],
  "provisional_nodes": [],
  "provisional_edges": [],
  "observations": [],
  "confidence": "high"
}
