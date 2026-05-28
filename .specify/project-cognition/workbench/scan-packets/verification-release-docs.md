# MapScanPacket: verification-release-docs

mode: read_only
packet_id: verification-release-docs
lane_id: verification-release-docs
result_handoff_path: .specify/project-cognition/workbench/worker-results/verification-release-docs.json

## Objective
Collect graph-native scan evidence for verification-release-docs.

## Authoritative Inputs
- .specify/project-cognition/workbench/repository-universe.json
- Live repository files listed below

## Allowed Read Scope
- .github/workflows/build-desktop-dev.yml
- .github/workflows/deploy-docs.yml
- .github/workflows/pr-quality.yml
- .github/workflows/pr-triage.yml
- .github/workflows/release-desktop.yml
- desktop/package.json
- desktop/src-tauri/Cargo.lock
- desktop/src-tauri/Cargo.toml
- desktop/src-tauri/Info.plist
- desktop/src-tauri/app-icon-macos.svg
- desktop/src-tauri/app-icon.png
- desktop/src-tauri/app-icon.svg
- desktop/src-tauri/build.rs
- desktop/src-tauri/capabilities/default.json
- desktop/src-tauri/icons/128x128.png
- desktop/src-tauri/icons/128x128@2x.png
- desktop/src-tauri/icons/32x32.png
- desktop/src-tauri/icons/64x64.png
- desktop/src-tauri/icons/Square107x107Logo.png
- desktop/src-tauri/icons/Square142x142Logo.png
- desktop/src-tauri/icons/Square150x150Logo.png
- desktop/src-tauri/icons/Square284x284Logo.png
- desktop/src-tauri/icons/Square30x30Logo.png
- desktop/src-tauri/icons/Square310x310Logo.png
- desktop/src-tauri/icons/Square44x44Logo.png
- desktop/src-tauri/icons/Square71x71Logo.png
- desktop/src-tauri/icons/Square89x89Logo.png
- desktop/src-tauri/icons/StoreLogo.png
- desktop/src-tauri/icons/android/mipmap-anydpi-v26/ic_launcher.xml
- desktop/src-tauri/icons/android/mipmap-hdpi/ic_launcher.png
- desktop/src-tauri/icons/android/mipmap-hdpi/ic_launcher_foreground.png
- desktop/src-tauri/icons/android/mipmap-hdpi/ic_launcher_round.png
- desktop/src-tauri/icons/android/mipmap-mdpi/ic_launcher.png
- desktop/src-tauri/icons/android/mipmap-mdpi/ic_launcher_foreground.png
- desktop/src-tauri/icons/android/mipmap-mdpi/ic_launcher_round.png
- desktop/src-tauri/icons/android/mipmap-xhdpi/ic_launcher.png
- desktop/src-tauri/icons/android/mipmap-xhdpi/ic_launcher_foreground.png
- desktop/src-tauri/icons/android/mipmap-xhdpi/ic_launcher_round.png
- desktop/src-tauri/icons/android/mipmap-xxhdpi/ic_launcher.png
- desktop/src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_foreground.png
- desktop/src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_round.png
- desktop/src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png
- desktop/src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_foreground.png
- desktop/src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_round.png
- desktop/src-tauri/icons/android/values/ic_launcher_background.xml
- desktop/src-tauri/icons/icon.icns
- desktop/src-tauri/icons/icon.ico
- desktop/src-tauri/icons/icon.png
- desktop/src-tauri/icons/ios/AppIcon-20x20@1x.png
- desktop/src-tauri/icons/ios/AppIcon-20x20@2x-1.png
- desktop/src-tauri/icons/ios/AppIcon-20x20@2x.png
- desktop/src-tauri/icons/ios/AppIcon-20x20@3x.png
- desktop/src-tauri/icons/ios/AppIcon-29x29@1x.png
- desktop/src-tauri/icons/ios/AppIcon-29x29@2x-1.png
- desktop/src-tauri/icons/ios/AppIcon-29x29@2x.png
- desktop/src-tauri/icons/ios/AppIcon-29x29@3x.png
- desktop/src-tauri/icons/ios/AppIcon-40x40@1x.png
- desktop/src-tauri/icons/ios/AppIcon-40x40@2x-1.png
- desktop/src-tauri/icons/ios/AppIcon-40x40@2x.png
- desktop/src-tauri/icons/ios/AppIcon-40x40@3x.png
- desktop/src-tauri/icons/ios/AppIcon-512@2x.png
- desktop/src-tauri/icons/ios/AppIcon-60x60@2x.png
- desktop/src-tauri/icons/ios/AppIcon-60x60@3x.png
- desktop/src-tauri/icons/ios/AppIcon-76x76@1x.png
- desktop/src-tauri/icons/ios/AppIcon-76x76@2x.png
- desktop/src-tauri/icons/ios/AppIcon-83.5x83.5@2x.png
- desktop/src-tauri/src/lib.rs
- desktop/src-tauri/src/macos_notifications.m
- desktop/src-tauri/src/main.rs
- desktop/src-tauri/tauri-config.test.ts
- desktop/src-tauri/tauri.conf.json
- desktop/src-tauri/tauri.macos.conf.json
- desktop/src-tauri/tauri.release-ci.json
- desktop/src-tauri/tauri.windows.conf.json
- desktop/src-tauri/windows-installer-hooks.nsh
- docs/.vitepress/config.mts
- docs/.vitepress/theme/custom.css
- docs/.vitepress/theme/index.ts
- docs/agent/01-usage-guide.md
- docs/agent/02-implementation.md
- docs/agent/03-agent-framework.md
- docs/agent/images/01-agent-overview.png
- docs/agent/images/02-agent-types.png
- docs/agent/images/03-spawn-flow.png
- docs/agent/images/04-agent-teams.png
- docs/agent/images/05-architecture.png
- docs/agent/images/06-context-passing.png
- docs/agent/images/07-tool-pool.png
- docs/agent/images/08-background-task.png
- docs/agent/images/09-teams-mailbox.png
- docs/agent/images/10-fork-cache.png
- docs/agent/images/11-agent-framework-overview.png
- docs/agent/images/12-agent-core-loop.png
- docs/agent/images/13-system-prompt-pipeline.png
- docs/agent/images/14-context-compression.png
- docs/agent/index.md
- docs/channel/01-channel-system.md
- docs/channel/02-im-gateway-proposal.md
- docs/channel/images/01-channel-overview.png
- docs/channel/images/02-message-flow.png
- docs/channel/images/03-access-control.png
- docs/channel/images/04-permission-relay.png
- docs/channel/index.md
- docs/desktop/01-quick-start.md
- docs/desktop/02-architecture.md
- docs/desktop/03-features.md
- docs/desktop/04-installation.md
- docs/desktop/05-FAQ.md
- docs/desktop/06-h5-access.md
- docs/desktop/index.md
- docs/en/agent/01-usage-guide.md
- docs/en/agent/02-implementation.md
- docs/en/agent/03-agent-framework.md
- docs/en/agent/images/01-agent-overview.png
- docs/en/agent/images/02-agent-types.png
- docs/en/agent/images/03-spawn-flow.png
- docs/en/agent/images/04-agent-teams.png
- docs/en/agent/images/05-architecture.png
- docs/en/agent/images/06-context-passing.png
- docs/en/agent/images/07-tool-pool.png

## Forbidden Paths
- .specify/** except the packet, repository-universe, and worker-result path for workflow operation
- node_modules/**, artifacts/**, build output, secrets, environment files

## Packet Ledger
- todo: 120 assigned paths
- doing: 0
- done: 0
- blocked: 0
- overflow: 0

## Acceptance Checks
- Return JSON at .specify/project-cognition/workbench/worker-results/verification-release-docs.json
- Top-level acceptance must be pass or a fail_* value
- Repeat assigned_paths exactly
- paths_read must be a non-empty concrete path array
- Account for every assigned path in coverage
- Evidence rows must include source_path and support read/deep_read coverage outcomes

## Required Handoff Shape
{
  "packet_id": "verification-release-docs",
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
