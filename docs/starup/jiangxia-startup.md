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

Build the desktop frontend before launching Tauri on a fresh checkout:

```bash
cd desktop && bun run build && cd ..
cd desktop && bun run tauri dev
```

The Tauri dev command starts the desktop window and its local services. If you
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
| `cd desktop && bun run tauri dev` | Run Tauri desktop app |
| `cd desktop && bun run test` | Run desktop tests |
| `cd desktop && bun run lint` | Run desktop TypeScript check |
