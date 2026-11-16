---
name: cc-jiangxia-startup
description: Claude Code Jiangxia project startup guide
version: 1.0.0
category: dev-ops
tags:
  - startup
  - tauri
  - desktop
  - development
---

# Claude Code Jiangxia Startup Guide

## When To Use

Use this guide before starting or restarting the local development environment,
especially when the desktop app, local API/WebSocket server, or Tauri sidecars
are involved.

## Prerequisites

| Tool | Minimum | Check |
|------|---------|-------|
| Bun | 1.0 | `bun --version` |
| Rust | 1.70 | `rustc --version` |
| Cargo | 1.70 | `cargo --version` |

## Install Order

Install dependencies from the repository root, then the desktop package, then
the adapters package when adapter work is in scope:

```bash
bun install
cd desktop && bun install && cd ..
cd adapters && bun install && cd ..
```

## Desktop Development

Build the desktop frontend and Sidecar before launching Tauri on a fresh checkout:

```bash
cd desktop && bun run build && bun run build:sidecars
cd desktop && bun run dev:desktop
```

`dev:desktop` runs Tauri with its native file watcher disabled. This is the
stable Windows default because the managed Node, Chromium, Git, Skill, and Pack
resources under `src-tauri/binaries` are large and can otherwise trigger repeated
native restarts after a Sidecar rebuild. Frontend Vite refresh remains available;
after changing Rust or Sidecar resources, rebuild and restart `dev:desktop`
explicitly.

The desktop command starts the desktop window and its local services. If you
only need the frontend web UI, use:

```bash
cd desktop && bun run dev
```

## CLI And Server

Run the CLI locally with:

```bash
bun run ./bin/claude-jiangxia
```

or:

```bash
bun run start
```

Run the desktop API/WebSocket server directly with:

```bash
SERVER_PORT=3456 bun run src/server/index.ts
```

Use another port when `3456` is already owned by an unrelated process.

## Managed Research Browser Driver

The built-in research browser uses pinned Patchright with the bundled Chromium
executable. Playwright remains available for rollback and authorized CDP
connections; prototype previews keep their existing driver. No daily browser
profile or cookies are imported. Website challenges still require the existing
human-verification flow.

For a compatibility rollback, set `CC_JIANGXIA_BROWSER_DRIVER=playwright` in the
App/server launch environment and restart that runtime. The default is
`patchright`; other values produce an explicit error. Changing the variable does
not replace a browser already running in another process. There is no automatic
driver switch after a challenge or failed launch.

Desktop packaging must copy `patchright` and `patchright-core` beside the Node
browser runner, alongside the original Playwright packages. Recheck actual
browser actions and verification pause/resume after updating either the browser
or driver; successful requests do not guarantee every website will allow access.

## Process Safety

Before stopping any process that owns a port, identify the exact PID and
command line.

On Windows:

```powershell
netstat -ano | findstr :3456
tasklist /FI "PID eq <PID>"
```

Only terminate the exact PID when the command/path clearly belongs to this
repository. Do not use broad process-name kills such as:

```powershell
taskkill /IM node.exe /F
taskkill /IM bun.exe /F
```

If the port belongs to another project or a user process, leave it running and
choose a different port.

## Common Issues

### `resource path '..\dist' doesn't exist`

Build the desktop frontend first:

```bash
cd desktop && bun run build
```

### Missing Adapter Dependencies

If startup fails with a missing adapter package, install adapter dependencies:

```bash
cd adapters && bun install
```

### Rust Build Failures

Update the Rust toolchain:

```bash
rustup update
```

## Related Commands

| Command | Purpose |
|---------|---------|
| `bun run start` | Run the CLI |
| `SERVER_PORT=3456 bun run src/server/index.ts` | Run local API/WebSocket server |
| `cd desktop && bun run dev` | Run Vite frontend |
| `cd desktop && bun run build` | Type-check and build desktop frontend |
| `cd desktop && bun run dev:desktop` | Run the stable Tauri desktop app (no native file watcher) |
| `cd desktop && bun run test` | Run desktop tests |
| `cd desktop && bun run lint` | Run desktop TypeScript check |
