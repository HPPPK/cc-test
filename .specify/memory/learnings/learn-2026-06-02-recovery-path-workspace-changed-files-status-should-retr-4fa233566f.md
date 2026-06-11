# Workspace changed-files status should retry top-level untracked scanning when recursive git status cannot traverse a broad Windows profile repo.

<!-- SPECKIT_LEARNING_DATA_BEGIN -->
[
  {
    "id": "LRN-20260602-121604-064994",
    "summary": "Workspace changed-files status should retry top-level untracked scanning when recursive git status cannot traverse a broad Windows profile repo.",
    "learning_type": "recovery_path",
    "source_command": "sp-debug",
    "evidence": "Debug session .planning/debug/changed-files-git-status-home-permission.md: live C:\\Users\\11034 repo reproduced AppData permission warnings with --untracked-files=all; WorkspaceService regression now retries --untracked-files=normal for traversal-style failures and workspace-service tests pass.",
    "recurrence_key": "recovery_path.workspace-changed-files-status-should-retry-top-level-untracked-scanning-when-recursive-git-status-cannot-traverse-a-broad-windows-profile-repo",
    "default_scope": "execution-heavy",
    "applies_to": [
      "sp-debug",
      "sp-implement",
      "sp-quick"
    ],
    "signal_strength": "medium",
    "status": "candidate",
    "first_seen": "2026-06-02T12:16:04Z",
    "last_seen": "2026-06-02T12:16:04Z",
    "occurrence_count": 1,
    "pain_score": 0,
    "false_starts": [],
    "rejected_paths": [],
    "decisive_signal": "",
    "root_cause_family": "",
    "injection_targets": [],
    "promotion_hint": ""
  }
]
<!-- SPECKIT_LEARNING_DATA_END -->

## Problem

Workspace changed-files status should retry top-level untracked scanning when recursive git status cannot traverse a broad Windows profile repo.

## Lesson

Debug session .planning/debug/changed-files-git-status-home-permission.md: live C:\Users\11034 repo reproduced AppData permission warnings with --untracked-files=all; WorkspaceService regression now retries --untracked-files=normal for traversal-style failures and workspace-service tests pass.

## When To Apply

sp-debug, sp-implement, sp-quick

## Trigger Signals

- medium
- recovery_path

## Evidence

Debug session .planning/debug/changed-files-git-status-home-permission.md: live C:\Users\11034 repo reproduced AppData permission warnings with --untracked-files=all; WorkspaceService regression now retries --untracked-files=normal for traversal-style failures and workspace-service tests pass.

## Prevention Or Recovery

Decisive signal: not recorded

False starts:
_No false starts recorded._

Rejected paths:
_No rejected paths recorded._

## Exceptions

_No exceptions recorded yet._
