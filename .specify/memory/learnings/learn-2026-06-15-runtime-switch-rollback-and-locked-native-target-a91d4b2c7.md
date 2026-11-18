# Runtime switch failures need two-layer rollback, and Windows native checks may need an isolated target

- id: `learn-2026-06-15-runtime-switch-rollback-and-locked-native-target-a91d4b2c7`
- type: `recovery_path`
- source_command: `sp-debug`
- recurrence_key: `runtime-switch-rollback-and-locked-native-target`
- applies_to: `sp-debug`, `sp-implement`, `desktop runtime`, `server websocket`, `native verification`
- signal_strength: `high`
- first_seen: `2026-06-15T09:45:00Z`
- last_seen: `2026-11-18T12:45:31Z`
- occurrence_count: 3

## Lesson

Desktop provider/model switch failures are a control-state problem, not only an error-toast problem. If the server writes a runtime override before restarting the CLI, the failed override must be restored on startup failure. If the desktop persists a runtime selection optimistically, it must restore the previous selection or clear a replayed selection when `CLI_RESTART_FAILED` returns.

When a user clicks Stop and immediately switches provider/model, bind the delayed stop force-kill to the original CLI process generation. A timer that only checks `hasSession(sessionId)` can kill the newly restarted runtime-switch process and surface as startup code 143 even though the new provider/model launch itself was valid.

For Windows native verification, `cargo check` can fail with `PermissionDenied` in Tauri build scripts when the default `desktop/src-tauri/target/debug/claude-sidecar.exe` is locked by a running local desktop/sidecar process. Confirm the path and process first; when you should not interrupt the user's app, run the native lane with an isolated `CARGO_TARGET_DIR`.

## Evidence

- Debug session: `.planning/debug/model-switch-cli-startup-143-ui-squares-small.md`.
- RED server regression: failed runtime override stayed as next-startup truth.
- RED desktop regressions: failed runtime selection stayed persisted and reconnect replayed it.
- RED server regression: delayed stop force-kill killed the newer runtime-switch process after `set_runtime_config`, causing a false startup code 143 failure.
- Native lane initially failed at `tauri-build` sidecar copy with Windows `拒绝访问`; `CARGO_TARGET_DIR=target\quality-native-check bun run check:native` passed.

## Trigger Signals

- `Failed to switch provider/model`
- `CLI exited during startup with code 143`
- `runtimeOverride.providerId`
- User clicked Stop and immediately switched provider/model.
- `Force-killing CLI subprocess` appears after a runtime override restart starts or connects a newer SDK.
- Desktop model selector or provider refresh writes a runtime selection before server success.
- `check:native` fails with Windows `PermissionDenied` while repo desktop/sidecar processes are running.

## Verified recurrence: 2026-11-18

The running repository desktop app held `desktop/src-tauri/target/debug/claude-sidecar.exe`. `tauri-build` failed at `fs::remove_file(&dest)` with Windows PermissionDenied. This is a loaded executable file lock, separate from the file-symlink EPERM addressed by Developer Mode. Do not widen permissions or terminate an active desktop/AI session to make this check pass.

`scripts/check-native.ts` now sets a Windows-only default `CARGO_TARGET_DIR` of `artifacts/native-checks/target`. Explicit user targets are preserved, other platforms retain Cargo's normal default, and the original environment object is not modified. This is verification output isolation, not a product runtime or expert-mode change.

Validation: the missing-isolation test failed before the change; all 5 native-check unit tests passed afterward. A real clean `bun run check:native` passed in the isolated target in 10m59s while the existing app remained running. Evidence: `artifacts/quality-runs/2026-11-18T10-51-45-227Z/logs/native-isolated.log`.

For process diagnostics, prefer PID and executable path. If a command line is needed, redact SDK URL tokens and other credentials before displaying or recording it.
