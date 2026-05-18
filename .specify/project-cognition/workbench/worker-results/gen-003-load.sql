-- sp-map-build: Load scan evidence into project cognition DB (gen-003)
-- Generated from 5 scan lanes: source-symbol, module-boundary, capability-workflow, build-test-runtime, git-evolution-risk

-- Step 1: Create new generation
INSERT OR REPLACE INTO generations(id, sequence, kind, state, source_commit, started_at, published_at, superseded_at, attrs_json)
VALUES ('gen-003', 3, 'map-build', 'active', 'ad82b37c6aad02efe4283426df0c872f20b8d7df',
        '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z', '',
        '{"scan_lanes": ["source-symbol-discovery", "module-boundary-ownership", "capability-workflow-discovery", "build-test-runtime", "git-evolution-risk"]}');

-- Step 2: Create evidence entries for scan lanes
INSERT OR REPLACE INTO evidence(id, generation_id, source_kind, source_path, commit_sha, span, extractor, content_hash, captured_at, attrs_json)
VALUES
('evt-source-symbol', 'gen-003', 'scan-lane', 'src/, desktop/src/, adapters/', 'ad82b37c6aad02efe4283426df0c872f20b8d7df', 'scan-lane:source-symbol-discovery', 'sp-map-scan', 'hash-source-symbol', '2026-05-16T21:59:00Z', '{"confidence": "sampled", "inspected_paths": 50}'),
('evt-module-boundary', 'gen-003', 'scan-lane', 'package.json, tsconfig.json, root dirs', 'ad82b37c6aad02efe4283426df0c872f20b8d7df', 'scan-lane:module-boundary-ownership', 'sp-map-scan', 'hash-module-boundary', '2026-05-16T21:59:00Z', '{"confidence": "sampled", "inspected_paths": 15}'),
('evt-capability-workflow', 'gen-003', 'scan-lane', 'src/commands/, src/tools/, src/screens/', 'ad82b37c6aad02efe4283426df0c872f20b8d7df', 'scan-lane:capability-workflow-discovery', 'sp-map-scan', 'hash-capability-workflow', '2026-05-16T21:59:00Z', '{"confidence": "sampled", "inspected_paths": 80}'),
('evt-build-test-runtime', 'gen-003', 'scan-lane', 'package.json scripts, .github/workflows, scripts/', 'ad82b37c6aad02efe4283426df0c872f20b8d7df', 'scan-lane:build-test-runtime', 'sp-map-scan', 'hash-build-test-runtime', '2026-05-16T21:59:00Z', '{"confidence": "deep-read", "inspected_paths": 45}'),
('evt-git-evolution-risk', 'gen-003', 'scan-lane', 'git log, src/utils/permissions/, src/services/', 'ad82b37c6aad02efe4283426df0c872f20b8d7df', 'scan-lane:git-evolution-risk', 'sp-map-scan', 'hash-git-evolution-risk', '2026-05-16T21:59:00Z', '{"confidence": "sampled", "inspected_paths": 30}');

-- Step 3: Insert all 105 nodes from provisional scan
INSERT OR REPLACE INTO nodes(id, generation_id, type, title, confidence, attrs_json, created_at, updated_at)
VALUES
-- Source-area nodes: src/ entrypoints & core
('n-src-entrypoints', 'gen-003', 'source-area', 'src/ entrypoints (CLI, Init, MCP, Agent SDK types)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/entrypoints/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-main', 'gen-003', 'source-area', 'src/main.tsx (root CLI bootstrap, 4749 lines)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/main.tsx"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-tool-def', 'gen-003', 'source-area', 'src/Tool.ts (Tool type system, buildTool, findToolByName)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/Tool.ts"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-tools-registry', 'gen-003', 'source-area', 'src/tools.ts (tool registry, 58 tool modules)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/tools.ts"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-task-def', 'gen-003', 'source-area', 'src/Task.ts (Task type system, TaskType, TaskHandle)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/Task.ts"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-commands-registry', 'gen-003', 'source-area', 'src/commands.ts (command registry, 115+ modules)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/commands.ts"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-query-engine', 'gen-003', 'source-area', 'src/query.ts / QueryEngine.ts (message loop/query engine)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/query.ts"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-ink-renderer', 'gen-003', 'source-area', 'src/ink.ts (Ink TUI renderer, ThemeProvider wrapper)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/ink.ts"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-setup', 'gen-003', 'source-area', 'src/setup.ts (session initialization, memory, config)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/setup.ts"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-screens', 'gen-003', 'source-area', 'src/screens/ (REPL, Doctor, ResumeConversation)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/screens/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-components', 'gen-003', 'source-area', 'src/components/ (149 Ink TUI components)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/components/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-commands', 'gen-003', 'source-area', 'src/commands/ (115+ command modules)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/commands/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-tools', 'gen-003', 'source-area', 'src/tools/ (59 tool modules: Bash, FileEdit, Grep, Glob, etc.)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/tools/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-services', 'gen-003', 'source-area', 'src/services/ (API, MCP, OAuth, plugins, LSP, analytics, memory, voice)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/services/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-state', 'gen-003', 'source-area', 'src/state/ (AppState, AppStateStore, selectors)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/state/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-types', 'gen-003', 'source-area', 'src/types/ (message, tools, commands, permissions, hooks, ids)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/types/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-utils', 'gen-003', 'source-area', 'src/utils/ (346+ utility modules)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/utils/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-constants', 'gen-003', 'source-area', 'src/constants/ (API limits, betas, errors, keys, product)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/constants/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-server', 'gen-003', 'source-area', 'src/server/ (HTTP/WS server for desktop app, 46 test files)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/server/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-server-api', 'gen-003', 'source-area', 'src/server/api/ (26 API route handlers)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/server/api/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-server-ws', 'gen-003', 'source-area', 'src/server/ws/ (WebSocket events and handler)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/server/ws/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-server-proxy', 'gen-003', 'source-area', 'src/server/proxy/ (protocol-translating reverse proxy)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/server/proxy/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-server-services', 'gen-003', 'source-area', 'src/server/services/ (31 services: provider, session, team, cron)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "src/server/services/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-server-middleware', 'gen-003', 'source-area', 'src/server/middleware/ (auth, CORS, error handling)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/server/middleware/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-skills', 'gen-003', 'source-area', 'src/skills/ (bundled skills, MCP skill builders)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/skills/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-plugins', 'gen-003', 'source-area', 'src/plugins/ (builtin plugins system)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/plugins/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-vim', 'gen-003', 'source-area', 'src/vim/ (Vim-mode motions, operators, text objects)', 'high', '{"category": "source-surface", "criticality": "low-risk", "path": "src/vim/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-coordinator', 'gen-003', 'source-area', 'src/coordinator/ (multi-agent coordinator)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/coordinator/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-daemon', 'gen-003', 'source-area', 'src/daemon/ (background daemon worker registry)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/daemon/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-native-ts', 'gen-003', 'source-area', 'src/native-ts/ (native bindings: color-diff, file-index, yoga-layout)', 'high', '{"category": "source-surface", "criticality": "low-risk", "path": "src/native-ts/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-migrations', 'gen-003', 'source-area', 'src/migrations/ (11 model/config migration scripts)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/migrations/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-voice', 'gen-003', 'source-area', 'src/voice/ (voice mode toggle)', 'high', '{"category": "source-surface", "criticality": "low-risk", "path": "src/voice/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-bridge', 'gen-003', 'source-area', 'src/bridge/ (remote control bridge)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/bridge/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-proactive', 'gen-003', 'source-area', 'src/proactive/ (proactive suggestions)', 'high', '{"category": "source-surface", "criticality": "low-risk", "path": "src/proactive/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-jobs', 'gen-003', 'source-area', 'src/jobs/ (background jobs)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/jobs/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-goals', 'gen-003', 'source-area', 'src/goals/ (goal system)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/goals/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-tasks', 'gen-003', 'source-area', 'src/tasks.ts + src/tasks/ (task system)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/tasks.ts"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-src-memdir', 'gen-003', 'source-area', 'src/memdir/ (memory directory)', 'high', '{"category": "source-surface", "criticality": "important", "path": "src/memdir/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-bin-launcher', 'gen-003', 'entrypoint', 'bin/claude-haha (Bash launcher entrypoint)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "bin/claude-haha"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-preload-ts', 'gen-003', 'source-area', 'preload.ts (injects MACRO globals: VERSION, BUILD_TIME)', 'high', '{"category": "source-surface", "criticality": "low-risk", "path": "preload.ts"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- desktop/ source areas
('n-desktop-entrypoint', 'gen-003', 'entrypoint', 'desktop/src/main.tsx (React bootstrap entrypoint)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "desktop/src/main.tsx"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-app', 'gen-003', 'source-area', 'desktop/src/App.tsx (AppShell root component)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "desktop/src/App.tsx"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-api', 'gen-003', 'module', 'desktop/src/api/ (27 API client modules)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "desktop/src/api/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-components', 'gen-003', 'module', 'desktop/src/components/ (React UI components)', 'high', '{"category": "source-surface", "criticality": "important", "path": "desktop/src/components/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-stores', 'gen-003', 'module', 'desktop/src/stores/ (22 Zustand stores)', 'high', '{"category": "source-surface", "criticality": "critical", "path": "desktop/src/stores/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-pages', 'gen-003', 'module', 'desktop/src/pages/ (22 page components)', 'high', '{"category": "source-surface", "criticality": "important", "path": "desktop/src/pages/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-hooks', 'gen-003', 'source-area', 'desktop/src/hooks/ (keyboard, mobile viewport, notifications)', 'high', '{"category": "source-surface", "criticality": "important", "path": "desktop/src/hooks/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-types', 'gen-003', 'source-area', 'desktop/src/types/ (15 type modules)', 'high', '{"category": "source-surface", "criticality": "important", "path": "desktop/src/types/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-i18n', 'gen-003', 'module', 'desktop/src/i18n/ (internationalization zh/en locales)', 'high', '{"category": "source-surface", "criticality": "important", "path": "desktop/src/i18n/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-theme', 'gen-003', 'source-area', 'desktop/src/theme/ (Tailwind CSS, globals)', 'high', '{"category": "source-surface", "criticality": "low-risk", "path": "desktop/src/theme/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-lib', 'gen-003', 'source-area', 'desktop/src/lib/ (zoom, notifications, persistence migrations)', 'high', '{"category": "source-surface", "criticality": "important", "path": "desktop/src/lib/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- adapters
('n-adapters-common', 'gen-003', 'module', 'adapters/common/ (shared adapter library)', 'high', '{"category": "source-surface", "criticality": "important", "path": "adapters/common/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-adapters-feishu', 'gen-003', 'module', 'adapters/feishu/ (Feishu/Lark IM adapter)', 'high', '{"category": "source-surface", "criticality": "important", "path": "adapters/feishu/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-adapters-dingtalk', 'gen-003', 'module', 'adapters/dingtalk/ (DingTalk IM adapter)', 'high', '{"category": "source-surface", "criticality": "important", "path": "adapters/dingtalk/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-adapters-telegram', 'gen-003', 'module', 'adapters/telegram/ (Telegram Bot adapter)', 'high', '{"category": "source-surface", "criticality": "important", "path": "adapters/telegram/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-adapters-wechat', 'gen-003', 'module', 'adapters/wechat/ (WeChat adapter)', 'high', '{"category": "source-surface", "criticality": "important", "path": "adapters/wechat/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-stubs', 'gen-003', 'source-area', 'stubs/ (Chrome MCP stub, color-diff NAPI stub)', 'high', '{"category": "source-surface", "criticality": "low-risk", "path": "stubs/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- config
('n-root-package', 'gen-003', 'source-area', 'package.json (CLI config, claude-code-local)', 'high', '{"category": "config-surface", "criticality": "critical", "path": "package.json"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-package', 'gen-003', 'source-area', 'desktop/package.json (desktop config, v0.2.7)', 'high', '{"category": "config-surface", "criticality": "critical", "path": "desktop/package.json"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-adapters-package', 'gen-003', 'source-area', 'adapters/package.json', 'high', '{"category": "config-surface", "criticality": "important", "path": "adapters/package.json"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- docs & infra
('n-docs-layer', 'gen-003', 'doc-surface', 'docs/ (VitePress documentation site)', 'high', '{"category": "doc-surface", "criticality": "important", "path": "docs/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-scripts-quality-gate', 'gen-003', 'infrastructure', 'scripts/quality-gate/ (CI quality automation)', 'high', '{"category": "infrastructure", "criticality": "important", "path": "scripts/quality-gate/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-scripts-pr', 'gen-003', 'infrastructure', 'scripts/pr/ (PR change policy, impact report)', 'high', '{"category": "infrastructure", "criticality": "important", "path": "scripts/pr/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-ci-cd-workflows', 'gen-003', 'infrastructure', '.github/workflows/ (5 CI/CD workflows)', 'high', '{"category": "infrastructure", "criticality": "important", "path": ".github/workflows/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-tauri-native', 'gen-003', 'module', 'desktop/src-tauri/ (Tauri native Rust layer)', 'high', '{"category": "source-surface", "criticality": "important", "path": "desktop/src-tauri/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-runtime-python', 'gen-003', 'source-area', 'runtime/ (Python sandbox helper scripts)', 'high', '{"category": "source-surface", "criticality": "low-risk", "path": "runtime/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-release-notes', 'gen-003', 'doc-surface', 'release-notes/ (18 versions v0.1.0-v0.2.7)', 'high', '{"category": "doc-surface", "criticality": "low-risk", "path": "release-notes/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- test surfaces
('n-server-tests', 'gen-003', 'test-surface', 'src/server/__tests__/ (46 test files)', 'high', '{"category": "test-surface", "criticality": "critical", "path": "src/server/__tests__/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-desktop-tests', 'gen-003', 'test-surface', 'desktop tests (stores .test.ts + __tests__/)', 'high', '{"category": "test-surface", "criticality": "critical", "path": "desktop/src/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-adapter-tests', 'gen-003', 'test-surface', 'adapter tests (per-package __tests__/)', 'high', '{"category": "test-surface", "criticality": "important", "path": "adapters/"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- capabilities
('n-cap-tui', 'gen-003', 'capability', 'Terminal UI (Ink REPL)', 'high', '{"category": "capability", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-desktop', 'gen-003', 'capability', 'Desktop App (Tauri 2 + React)', 'high', '{"category": "capability", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-commands', 'gen-003', 'capability', 'Slash Commands (70+)', 'high', '{"category": "capability", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-agent', 'gen-003', 'capability', 'Multi-Agent Orchestration', 'high', '{"category": "capability", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-skills', 'gen-003', 'capability', 'Skills System', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-memory', 'gen-003', 'capability', 'Cross-Session Memory System', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-mcp', 'gen-003', 'capability', 'MCP Protocol Support', 'high', '{"category": "capability", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-lsp', 'gen-003', 'capability', 'LSP Integration', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-tools', 'gen-003', 'capability', 'Agent Tool Ecosystem (59 tools)', 'high', '{"category": "capability", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-model-providers', 'gen-003', 'capability', 'Multi-Model Provider Support', 'high', '{"category": "capability", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-computer-use', 'gen-003', 'capability', 'Computer Use (Desktop Control)', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-im-integration', 'gen-003', 'capability', 'IM Platform Integration (4 platforms)', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-worktree', 'gen-003', 'capability', 'Git Worktree Isolation', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-teams', 'gen-003', 'capability', 'Agent Teams Collaboration', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-plan-mode', 'gen-003', 'capability', 'Plan Mode', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-voice', 'gen-003', 'capability', 'Voice Mode', 'high', '{"category": "capability", "criticality": "low-risk"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-h5-remote', 'gen-003', 'capability', 'H5 Remote Access', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-plugins', 'gen-003', 'capability', 'Plugin System', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-quality-gate', 'gen-003', 'capability', 'Quality Gate Automation', 'high', '{"category": "capability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cap-auth', 'gen-003', 'capability', 'Authentication System (OAuth, API keys)', 'high', '{"category": "capability", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- risks
('n-risk-permissions', 'gen-003', 'risk', 'Permission system (27 files: filesystem, shell, approval, YOLO)', 'high', '{"category": "risk", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-risk-oauth', 'gen-003', 'risk', 'OAuth credential management (6 files)', 'high', '{"category": "risk", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-risk-mcp', 'gen-003', 'risk', 'MCP external code execution (24 files)', 'high', '{"category": "risk", "criticality": "critical"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-risk-plugins', 'gen-003', 'risk', 'Third-party plugin risk (hot-reload)', 'high', '{"category": "risk", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-risk-persistence', 'gen-003', 'risk', 'Persistence data integrity (protected files)', 'high', '{"category": "risk", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-risk-doctor', 'gen-003', 'risk', 'Doctor repair (deny-by-default, destructive potential)', 'high', '{"category": "risk", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-risk-computer-use', 'gen-003', 'risk', 'Computer Use (native Python bridge)', 'high', '{"category": "risk", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-risk-h5-access', 'gen-003', 'risk', 'H5 LAN remote access (CORS/auth boundary)', 'high', '{"category": "risk", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- observability
('n-obs-telemetry', 'gen-003', 'observability', 'Analytics and telemetry (9 files, Datadog+GrowthBook)', 'high', '{"category": "observability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-obs-doctor', 'gen-003', 'observability', 'Doctor diagnostics (CLI + desktop + server)', 'high', '{"category": "observability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-obs-errors', 'gen-003', 'observability', 'Error tracking (src/services/api/errors.ts)', 'high', '{"category": "observability", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- coverage gaps
('n-cov-agent-tools', 'gen-003', 'coverage', 'Coverage gap: agent-tools (17.1% lines vs 60% target)', 'high', '{"category": "coverage", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cov-agent-utils', 'gen-003', 'coverage', 'Coverage gap: agent-utils (14.42% lines vs 60% target)', 'high', '{"category": "coverage", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-cov-desktop-fn', 'gen-003', 'coverage', 'Coverage gap: desktop functions (52.49% vs 70% target)', 'high', '{"category": "coverage", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('n-quarantine-tests', 'gen-003', 'coverage', '5 quarantined server tests (timing instability)', 'high', '{"category": "coverage", "criticality": "important"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z');

-- Link nodes to evidence
INSERT OR REPLACE INTO node_evidence(node_id, evidence_id)
SELECT 'n-src-entrypoints', 'evt-source-symbol'
UNION ALL SELECT 'n-src-main', 'evt-source-symbol'
UNION ALL SELECT 'n-src-tool-def', 'evt-source-symbol'
UNION ALL SELECT 'n-src-tools-registry', 'evt-source-symbol'
UNION ALL SELECT 'n-src-task-def', 'evt-source-symbol'
UNION ALL SELECT 'n-src-commands-registry', 'evt-source-symbol'
UNION ALL SELECT 'n-src-query-engine', 'evt-source-symbol'
UNION ALL SELECT 'n-src-ink-renderer', 'evt-source-symbol'
UNION ALL SELECT 'n-src-setup', 'evt-source-symbol'
UNION ALL SELECT 'n-src-screens', 'evt-source-symbol'
UNION ALL SELECT 'n-src-components', 'evt-source-symbol'
UNION ALL SELECT 'n-src-commands', 'evt-source-symbol'
UNION ALL SELECT 'n-src-tools', 'evt-source-symbol'
UNION ALL SELECT 'n-src-services', 'evt-source-symbol'
UNION ALL SELECT 'n-src-state', 'evt-source-symbol'
UNION ALL SELECT 'n-src-types', 'evt-source-symbol'
UNION ALL SELECT 'n-src-utils', 'evt-source-symbol'
UNION ALL SELECT 'n-src-constants', 'evt-source-symbol'
UNION ALL SELECT 'n-src-server', 'evt-source-symbol'
UNION ALL SELECT 'n-src-server-api', 'evt-source-symbol'
UNION ALL SELECT 'n-src-server-ws', 'evt-source-symbol'
UNION ALL SELECT 'n-src-server-proxy', 'evt-source-symbol'
UNION ALL SELECT 'n-src-server-services', 'evt-source-symbol'
UNION ALL SELECT 'n-src-server-middleware', 'evt-source-symbol'
UNION ALL SELECT 'n-src-skills', 'evt-source-symbol'
UNION ALL SELECT 'n-src-plugins', 'evt-source-symbol'
UNION ALL SELECT 'n-src-vim', 'evt-source-symbol'
UNION ALL SELECT 'n-src-coordinator', 'evt-source-symbol'
UNION ALL SELECT 'n-src-daemon', 'evt-source-symbol'
UNION ALL SELECT 'n-src-native-ts', 'evt-source-symbol'
UNION ALL SELECT 'n-src-migrations', 'evt-source-symbol'
UNION ALL SELECT 'n-src-voice', 'evt-source-symbol'
UNION ALL SELECT 'n-src-bridge', 'evt-source-symbol'
UNION ALL SELECT 'n-src-proactive', 'evt-source-symbol'
UNION ALL SELECT 'n-src-jobs', 'evt-source-symbol'
UNION ALL SELECT 'n-src-goals', 'evt-source-symbol'
UNION ALL SELECT 'n-src-tasks', 'evt-source-symbol'
UNION ALL SELECT 'n-src-memdir', 'evt-source-symbol'
UNION ALL SELECT 'n-bin-launcher', 'evt-source-symbol'
UNION ALL SELECT 'n-preload-ts', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-entrypoint', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-app', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-api', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-components', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-stores', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-pages', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-hooks', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-types', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-i18n', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-theme', 'evt-source-symbol'
UNION ALL SELECT 'n-desktop-lib', 'evt-source-symbol'
UNION ALL SELECT 'n-adapters-common', 'evt-source-symbol'
UNION ALL SELECT 'n-adapters-feishu', 'evt-source-symbol'
UNION ALL SELECT 'n-adapters-dingtalk', 'evt-source-symbol'
UNION ALL SELECT 'n-adapters-telegram', 'evt-source-symbol'
UNION ALL SELECT 'n-adapters-wechat', 'evt-source-symbol'
UNION ALL SELECT 'n-stubs', 'evt-source-symbol'
UNION ALL SELECT 'n-root-package', 'evt-build-test-runtime'
UNION ALL SELECT 'n-desktop-package', 'evt-build-test-runtime'
UNION ALL SELECT 'n-adapters-package', 'evt-build-test-runtime'
UNION ALL SELECT 'n-docs-layer', 'evt-build-test-runtime'
UNION ALL SELECT 'n-scripts-quality-gate', 'evt-build-test-runtime'
UNION ALL SELECT 'n-scripts-pr', 'evt-build-test-runtime'
UNION ALL SELECT 'n-ci-cd-workflows', 'evt-build-test-runtime'
UNION ALL SELECT 'n-tauri-native', 'evt-build-test-runtime'
UNION ALL SELECT 'n-runtime-python', 'evt-build-test-runtime'
UNION ALL SELECT 'n-release-notes', 'evt-build-test-runtime'
UNION ALL SELECT 'n-server-tests', 'evt-build-test-runtime'
UNION ALL SELECT 'n-desktop-tests', 'evt-build-test-runtime'
UNION ALL SELECT 'n-adapter-tests', 'evt-build-test-runtime'
UNION ALL SELECT 'n-cap-tui', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-desktop', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-commands', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-agent', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-skills', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-memory', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-mcp', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-lsp', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-tools', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-model-providers', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-computer-use', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-im-integration', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-worktree', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-teams', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-plan-mode', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-voice', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-h5-remote', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-plugins', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-quality-gate', 'evt-capability-workflow'
UNION ALL SELECT 'n-cap-auth', 'evt-capability-workflow'
UNION ALL SELECT 'n-risk-permissions', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-risk-oauth', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-risk-mcp', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-risk-plugins', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-risk-persistence', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-risk-doctor', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-risk-computer-use', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-risk-h5-access', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-obs-telemetry', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-obs-doctor', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-obs-errors', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-cov-agent-tools', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-cov-agent-utils', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-cov-desktop-fn', 'evt-git-evolution-risk'
UNION ALL SELECT 'n-quarantine-tests', 'evt-git-evolution-risk';

-- Step 4: Insert all 56 edges from provisional scan
INSERT OR REPLACE INTO edges(id, generation_id, type, source_id, target_id, confidence, attrs_json, created_at, updated_at)
VALUES
('e-bin-executes-entrypoints', 'gen-003', 'executes', 'n-bin-launcher', 'n-src-entrypoints', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-entrypoints-imports-main', 'gen-003', 'imports', 'n-src-entrypoints', 'n-src-main', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-main-runs-query', 'gen-003', 'runs', 'n-src-main', 'n-src-query-engine', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-query-calls-tools', 'gen-003', 'calls', 'n-src-query-engine', 'n-src-tools-registry', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-query-calls-commands', 'gen-003', 'calls', 'n-src-query-engine', 'n-src-commands-registry', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-tools-reg-registers', 'gen-003', 'registers', 'n-src-tools-registry', 'n-src-tools', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-commands-reg-registers', 'gen-003', 'registers', 'n-src-commands-registry', 'n-src-commands', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-commands-uses-services', 'gen-003', 'uses', 'n-src-commands', 'n-src-services', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-commands-uses-tools', 'gen-003', 'uses', 'n-src-commands', 'n-src-tools', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-tools-uses-services', 'gen-003', 'uses', 'n-src-tools', 'n-src-services', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-tools-uses-utils', 'gen-003', 'uses', 'n-src-tools', 'n-src-utils', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-services-uses-utils', 'gen-003', 'uses', 'n-src-services', 'n-src-utils', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-services-uses-constants', 'gen-003', 'uses', 'n-src-services', 'n-src-constants', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-services-uses-types', 'gen-003', 'uses', 'n-src-services', 'n-src-types', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-server-uses-services', 'gen-003', 'uses', 'n-src-server', 'n-src-services', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-server-api-calls-services', 'gen-003', 'calls', 'n-src-server-api', 'n-src-server-services', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-server-ws-calls-services', 'gen-003', 'calls', 'n-src-server-ws', 'n-src-server-services', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-desktop-api-communicates', 'gen-003', 'communicates-with', 'n-desktop-api', 'n-src-server', 'high', '{"protocol": "HTTP/WS"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-desktop-stores-calls-api', 'gen-003', 'calls', 'n-desktop-stores', 'n-desktop-api', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-desktop-components-subscribes', 'gen-003', 'subscribes', 'n-desktop-components', 'n-desktop-stores', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-desktop-app-renders-components', 'gen-003', 'renders', 'n-desktop-app', 'n-desktop-components', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-desktop-app-renders-pages', 'gen-003', 'renders', 'n-desktop-app', 'n-desktop-pages', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-adapters-common-depends-server', 'gen-003', 'depends-on', 'n-adapters-common', 'n-src-server', 'high', '{"mechanism": "tsconfig @server/* path"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-feishu-depends-common', 'gen-003', 'depends-on', 'n-adapters-feishu', 'n-adapters-common', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-dingtalk-depends-common', 'gen-003', 'depends-on', 'n-adapters-dingtalk', 'n-adapters-common', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-telegram-depends-common', 'gen-003', 'depends-on', 'n-adapters-telegram', 'n-adapters-common', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-wechat-depends-common', 'gen-003', 'depends-on', 'n-adapters-wechat', 'n-adapters-common', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- Capability edges
('e-cap-tui-implemented-by', 'gen-003', 'implemented-by', 'n-cap-tui', 'n-src-main', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-desktop-implemented-by', 'gen-003', 'implemented-by', 'n-cap-desktop', 'n-desktop-app', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-commands-implemented-by', 'gen-003', 'implemented-by', 'n-cap-commands', 'n-src-commands', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-tools-implemented-by', 'gen-003', 'implemented-by', 'n-cap-tools', 'n-src-tools', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-agent-depends-tools', 'gen-003', 'depends-on', 'n-cap-agent', 'n-cap-tools', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-agent-uses-worktree', 'gen-003', 'uses', 'n-cap-agent', 'n-cap-worktree', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-agent-uses-teams', 'gen-003', 'uses', 'n-cap-agent', 'n-cap-teams', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-mcp-extends-tools', 'gen-003', 'extends', 'n-cap-mcp', 'n-cap-tools', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-lsp-extends-tools', 'gen-003', 'extends', 'n-cap-lsp', 'n-cap-tools', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-memory-implemented-by', 'gen-003', 'implemented-by', 'n-cap-memory', 'n-src-services', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-skills-extends-commands', 'gen-003', 'extends', 'n-cap-skills', 'n-cap-commands', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-computer-use-served-by', 'gen-003', 'implemented-by', 'n-cap-computer-use', 'n-src-server-services', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-im-served-by', 'gen-003', 'implemented-by', 'n-cap-im-integration', 'n-adapters-common', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-plan-related-agent', 'gen-003', 'related-to', 'n-cap-plan-mode', 'n-cap-agent', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-auth-exposes-oauth', 'gen-003', 'exposes', 'n-cap-auth', 'n-risk-oauth', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cap-quality-gate-by', 'gen-003', 'implemented-by', 'n-cap-quality-gate', 'n-scripts-quality-gate', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- Risk edges
('e-risk-permissions-protects', 'gen-003', 'protects', 'n-risk-permissions', 'n-src-utils', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-risk-mcp-exposes', 'gen-003', 'exposes', 'n-risk-mcp', 'n-cap-mcp', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-risk-plugins-exposes', 'gen-003', 'exposes', 'n-risk-plugins', 'n-cap-plugins', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-risk-doctor-may-modify', 'gen-003', 'may-modify', 'n-risk-doctor', 'n-risk-persistence', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-risk-h5-bypasses-permissions', 'gen-003', 'bypasses', 'n-risk-h5-access', 'n-risk-permissions', 'medium', '{"note": "H5 remote access provides alternative auth path that may bypass local permission checks"}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- Observability edges
('e-obs-telemetry-monitors', 'gen-003', 'monitors', 'n-obs-telemetry', 'n-src-services', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-obs-doctor-controls', 'gen-003', 'controls', 'n-obs-doctor', 'n-risk-doctor', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cov-tools-under-tested', 'gen-003', 'under-tested', 'n-cov-agent-tools', 'n-src-tools', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-cov-utils-under-tested', 'gen-003', 'under-tested', 'n-cov-agent-utils', 'n-src-utils', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-quarantine-unstable', 'gen-003', 'unstable', 'n-quarantine-tests', 'n-src-server', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
-- Test edges
('e-server-tests-tests', 'gen-003', 'tests', 'n-server-tests', 'n-src-server', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-desktop-tests-tests', 'gen-003', 'tests', 'n-desktop-tests', 'n-desktop-stores', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('e-adapter-tests-tests', 'gen-003', 'tests', 'n-adapter-tests', 'n-adapters-common', 'high', '{}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z');

-- Link edges to evidence
INSERT OR REPLACE INTO edge_evidence(edge_id, evidence_id)
SELECT id, 'evt-source-symbol' FROM edges WHERE generation_id = 'gen-003'
UNION ALL
SELECT id, 'evt-capability-workflow' FROM edges WHERE generation_id = 'gen-003' AND (type = 'implemented-by' OR type = 'depends-on' OR type = 'uses' OR type = 'extends' OR type = 'related-to')
UNION ALL
SELECT id, 'evt-git-evolution-risk' FROM edges WHERE generation_id = 'gen-003' AND (type = 'protects' OR type = 'exposes' OR type = 'may-modify' OR type = 'bypasses' OR type = 'monitors' OR type = 'controls' OR type = 'under-tested' OR type = 'unstable');

-- Step 5: Insert observations
INSERT OR REPLACE INTO observations(id, generation_id, observation_type, summary, attrs_json, created_at, updated_at)
VALUES
('o-dual-arch', 'gen-003', 'architecture', 'Project has dual-architecture: Bun CLI (Ink TUI) and Tauri 2 desktop app (React+Vite+Zustand) connecting via HTTP/WS server', '{"confidence": "high", "evidence": ["evt-source-symbol", "evt-module-boundary"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-server-bridge', 'gen-003', 'architecture', 'Server bridges CLI agent capabilities to desktop frontend via 26 REST API routes and WebSocket session events', '{"confidence": "high", "evidence": ["evt-source-symbol"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-im-adapters', 'gen-003', 'architecture', 'IM adapters (Telegram, Feishu, WeChat, DingTalk) share common library under adapters/common/ and depend on server via tsconfig paths', '{"confidence": "high", "evidence": ["evt-source-symbol", "evt-build-test-runtime"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-cov-agent-tools-gap', 'gen-003', 'coverage', 'Agent-tools and agent-utils have critical coverage gaps (17.1% and 14.42% lines) — largest untested surface', '{"confidence": "high", "evidence": ["evt-git-evolution-risk"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-quarantine', 'gen-003', 'coverage', '5 server tests quarantined due to timing instability: cron-scheduler, providers-real, tasks, e2e:business-flow, e2e:full-flow', '{"confidence": "high", "evidence": ["evt-git-evolution-risk"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-risk-boundaries', 'gen-003', 'risk', 'MCP, OAuth, and plugin systems are highest-risk external trust boundaries — third-party code execution, credential management, hot-reloaded plugins', '{"confidence": "high", "evidence": ["evt-git-evolution-risk", "evt-source-symbol"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-permissions-security', 'gen-003', 'risk', 'Permission system spans 27 files across filesystem, shell, and approval sub-systems with auto-mode and YOLO classifier prompting', '{"confidence": "high", "evidence": ["evt-git-evolution-risk"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-volatility-hotspots', 'gen-003', 'evolution', 'Volatility hotspots: ActiveSession.tsx (11), MessageList.tsx (9), i18n zh/en.ts (7), chatStore.ts (6), goalState.ts (6), teamStore.ts (6)', '{"confidence": "high", "evidence": ["evt-git-evolution-risk"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-desktop-stores-zustand', 'gen-003', 'architecture', 'Desktop state management uses 22 Zustand stores — chatStore (1728 lines) is largest, followed by sessionStore, uiStore, settingsStore', '{"confidence": "high", "evidence": ["evt-source-symbol"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-21-capabilities', 'gen-003', 'capability', '21 capabilities identified across CLI, desktop, tools, services, and adapters', '{"confidence": "high", "evidence": ["evt-capability-workflow"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-quality-gate-modes', 'gen-003', 'architecture', 'Quality gate system supports 3 modes (pr/baseline/release) with enforcement across provider-smoke, desktop-smoke, coverage, quarantine, persistence-upgrade', '{"confidence": "high", "evidence": ["evt-build-test-runtime"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-bun-runtime', 'gen-003', 'architecture', 'Bun is primary runtime; npm used only for docs build (VitePress); Cargo for Tauri native layer', '{"confidence": "high", "evidence": ["evt-build-test-runtime"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-utils-dependency-uncertainty', 'gen-003', 'uncertainty', 'Exact import graph within src/utils/ (346 modules) not traced exhaustively — edges inferred from directory structure', '{"confidence": "medium", "evidence": ["evt-source-symbol"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z'),
('o-api-route-uncertainty', 'gen-003', 'uncertainty', 'Specific API route mapping between desktop/src/api/ and src/server/api/ not exhaustively validated — inferred from filenames', '{"confidence": "medium", "evidence": ["evt-source-symbol"]}', '2026-05-16T21:59:00Z', '2026-05-16T21:59:00Z');

-- Link observation evidence
INSERT OR REPLACE INTO observation_evidence(observation_id, evidence_id)
VALUES
('o-dual-arch', 'evt-source-symbol'), ('o-dual-arch', 'evt-module-boundary'),
('o-server-bridge', 'evt-source-symbol'),
('o-im-adapters', 'evt-source-symbol'), ('o-im-adapters', 'evt-build-test-runtime'),
('o-cov-agent-tools-gap', 'evt-git-evolution-risk'),
('o-quarantine', 'evt-git-evolution-risk'),
('o-risk-boundaries', 'evt-git-evolution-risk'),
('o-permissions-security', 'evt-git-evolution-risk'),
('o-volatility-hotspots', 'evt-git-evolution-risk'),
('o-desktop-stores-zustand', 'evt-source-symbol'),
('o-21-capabilities', 'evt-capability-workflow'),
('o-quality-gate-modes', 'evt-build-test-runtime'),
('o-bun-runtime', 'evt-build-test-runtime'),
('o-utils-dependency-uncertainty', 'evt-source-symbol'),
('o-api-route-uncertainty', 'evt-source-symbol');

-- Step 6: Create claims
INSERT OR REPLACE INTO claims(id, generation_id, subject_ref, predicate, object_ref, object_value, truth_layer, confidence, status, last_validated_at, attrs_json)
VALUES
('c-dual-arch', 'gen-003', 'system:architecture', 'has_design', 'system:dual-architecture', 'Bun CLI (Ink TUI) + Tauri 2 desktop app (React/Vite) communicating via HTTP/WS server', 'functional', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-entrypoint-chain', 'gen-003', 'system:call-chain', 'starts_at', 'entrypoint:bin/claude-haha', 'bin/claude-haha -> src/entrypoints/cli.tsx -> src/main.tsx -> query engine -> tool/command dispatch', 'functional', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-tool-count', 'gen-003', 'src/tools/', 'contains', '59-tools', '59 tool modules in src/tools/ covering Bash, FileEdit, Grep, Glob, WebSearch, MCP, AgentTool, and more', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-command-count', 'gen-003', 'src/commands/', 'contains', '115-commands', '115+ command modules in src/commands/ covering git, review, config, session, skills, MCP, and more', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-capability-count', 'gen-003', 'system:capabilities', 'has_count', '21-capabilities', '21 capabilities: TUI, Desktop, Commands, Agent, Skills, Memory, MCP, LSP, Tools, Model Providers, Computer Use, IM, Worktree, Teams, Plan, Voice, H5, Plugins, Quality Gate, Auth, Doctor', 'functional', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-server-26-routes', 'gen-003', 'src/server/api/', 'has_count', '26-routes', '26 REST API route handlers in src/server/api/', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-desktop-22-stores', 'gen-003', 'desktop/src/stores/', 'has_count', '22-stores', '22 Zustand stores for desktop state management', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-desktop-27-api-clients', 'gen-003', 'desktop/src/api/', 'has_count', '27-api-clients', '27 API client modules in desktop/src/api/', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-risk-permissions', 'gen-003', 'risk:permissions', 'is_critical', 'system:security', 'Permission system with 27 files is critical security boundary controlling filesystem, shell, and approval', 'functional', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-risk-mcp-external', 'gen-003', 'risk:mcp', 'is_critical', 'system:security', 'MCP with 24 files handles external code execution and server auth — critical trust boundary', 'functional', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-coverage-agent-tools', 'gen-003', 'coverage:agent-tools', 'is_gap', '17.1-percent', 'agent-tools at 17.1% line coverage vs 60% target (42.9pp gap)', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-coverage-agent-utils', 'gen-003', 'coverage:agent-utils', 'is_gap', '14.42-percent', 'agent-utils at 14.42% line coverage vs 60% target (45.58pp gap)', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-quarantine-5-tests', 'gen-003', 'coverage:quarantine', 'has_count', '5-tests', '5 quarantined server tests with timing instability', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-im-4-adapters', 'gen-003', 'adapters/', 'has_count', '4-adapters', '4 IM adapters: Telegram, Feishu, DingTalk, WeChat', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-utils-346-modules', 'gen-003', 'src/utils/', 'has_count', '346-modules', '346+ utility modules under src/utils/', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-ci-5-workflows', 'gen-003', '.github/workflows/', 'has_count', '5-workflows', '5 GitHub Actions workflows: PR triage, PR quality, desktop release, docs deploy, dev build', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-18-release-versions', 'gen-003', 'release-notes/', 'has_count', '18-versions', '18 release versions from v0.1.0 to v0.2.7', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}'),
('c-server-46-tests', 'gen-003', 'src/server/__tests__/', 'has_count', '46-tests', '46 server test files covering API routes, services, and middleware', 'inventory', 'high', 'active', '2026-05-16T21:59:00Z', '{}');

-- Link claims to evidence
INSERT OR REPLACE INTO claim_evidence(claim_id, evidence_id)
VALUES
('c-dual-arch', 'evt-source-symbol'), ('c-dual-arch', 'evt-module-boundary'),
('c-entrypoint-chain', 'evt-source-symbol'),
('c-tool-count', 'evt-source-symbol'),
('c-command-count', 'evt-source-symbol'),
('c-capability-count', 'evt-capability-workflow'),
('c-server-26-routes', 'evt-source-symbol'),
('c-desktop-22-stores', 'evt-source-symbol'),
('c-desktop-27-api-clients', 'evt-source-symbol'),
('c-risk-permissions', 'evt-git-evolution-risk'),
('c-risk-mcp-external', 'evt-git-evolution-risk'),
('c-coverage-agent-tools', 'evt-git-evolution-risk'),
('c-coverage-agent-utils', 'evt-git-evolution-risk'),
('c-quarantine-5-tests', 'evt-git-evolution-risk'),
('c-im-4-adapters', 'evt-source-symbol'),
('c-utils-346-modules', 'evt-source-symbol'),
('c-ci-5-workflows', 'evt-build-test-runtime'),
('c-18-release-versions', 'evt-build-test-runtime'),
('c-server-46-tests', 'evt-build-test-runtime');

-- Step 7: Create queryable slices (task-local bundles)
-- Slice: implement slice for CLI core work
INSERT OR REPLACE INTO slice_members(id, generation_id, slice_id, object_type, object_id, rank, reason, updated_at)
VALUES
('sm-cli-1', 'gen-003', 'slice:implement-cli-core', 'node', 'n-src-main', 1, 'primary CLI entrypoint', '2026-05-16T21:59:00Z'),
('sm-cli-2', 'gen-003', 'slice:implement-cli-core', 'node', 'n-src-entrypoints', 2, 'entrypoint sources', '2026-05-16T21:59:00Z'),
('sm-cli-3', 'gen-003', 'slice:implement-cli-core', 'node', 'n-src-query-engine', 3, 'query engine', '2026-05-16T21:59:00Z'),
('sm-cli-4', 'gen-003', 'slice:implement-cli-core', 'node', 'n-src-tools', 4, 'tool implementations', '2026-05-16T21:59:00Z'),
('sm-cli-5', 'gen-003', 'slice:implement-cli-core', 'node', 'n-src-commands', 5, 'command implementations', '2026-05-16T21:59:00Z'),
('sm-cli-6', 'gen-003', 'slice:implement-cli-core', 'node', 'n-src-services', 6, 'service layer', '2026-05-16T21:59:00Z'),
('sm-cli-7', 'gen-003', 'slice:implement-cli-core', 'node', 'n-src-utils', 7, 'utility layer', '2026-05-16T21:59:00Z'),
('sm-cli-8', 'gen-003', 'slice:implement-cli-core', 'node', 'n-src-screens', 8, 'TUI screens', '2026-05-16T21:59:00Z'),
('sm-cli-9', 'gen-003', 'slice:implement-cli-core', 'node', 'n-bin-launcher', 9, 'bash launcher', '2026-05-16T21:59:00Z'),
-- Slice: debug slice for desktop issues
('sm-desktop-1', 'gen-003', 'slice:debug-desktop', 'node', 'n-desktop-app', 1, 'root app', '2026-05-16T21:59:00Z'),
('sm-desktop-2', 'gen-003', 'slice:debug-desktop', 'node', 'n-desktop-stores', 2, 'state management', '2026-05-16T21:59:00Z'),
('sm-desktop-3', 'gen-003', 'slice:debug-desktop', 'node', 'n-desktop-api', 3, 'API client', '2026-05-16T21:59:00Z'),
('sm-desktop-4', 'gen-003', 'slice:debug-desktop', 'node', 'n-desktop-components', 4, 'UI components', '2026-05-16T21:59:00Z'),
('sm-desktop-5', 'gen-003', 'slice:debug-desktop', 'node', 'n-desktop-pages', 5, 'page components', '2026-05-16T21:59:00Z'),
('sm-desktop-6', 'gen-003', 'slice:debug-desktop', 'node', 'n-src-server', 6, 'backend server', '2026-05-16T21:59:00Z'),
('sm-desktop-7', 'gen-003', 'slice:debug-desktop', 'node', 'n-desktop-tests', 7, 'desktop tests', '2026-05-16T21:59:00Z'),
-- Slice: security review slice
('sm-sec-1', 'gen-003', 'slice:security-review', 'node', 'n-risk-permissions', 1, 'permission system', '2026-05-16T21:59:00Z'),
('sm-sec-2', 'gen-003', 'slice:security-review', 'node', 'n-risk-oauth', 2, 'OAuth', '2026-05-16T21:59:00Z'),
('sm-sec-3', 'gen-003', 'slice:security-review', 'node', 'n-risk-mcp', 3, 'MCP', '2026-05-16T21:59:00Z'),
('sm-sec-4', 'gen-003', 'slice:security-review', 'node', 'n-risk-plugins', 4, 'plugins', '2026-05-16T21:59:00Z'),
('sm-sec-5', 'gen-003', 'slice:security-review', 'node', 'n-cap-auth', 5, 'auth system', '2026-05-16T21:59:00Z'),
('sm-sec-6', 'gen-003', 'slice:security-review', 'node', 'n-risk-h5-access', 6, 'H5 remote access', '2026-05-16T21:59:00Z'),
-- Slice: adapters slice
('sm-adp-1', 'gen-003', 'slice:adapters', 'node', 'n-adapters-common', 1, 'shared library', '2026-05-16T21:59:00Z'),
('sm-adp-2', 'gen-003', 'slice:adapters', 'node', 'n-adapters-telegram', 2, 'Telegram', '2026-05-16T21:59:00Z'),
('sm-adp-3', 'gen-003', 'slice:adapters', 'node', 'n-adapters-feishu', 3, 'Feishu', '2026-05-16T21:59:00Z'),
('sm-adp-4', 'gen-003', 'slice:adapters', 'node', 'n-adapters-dingtalk', 4, 'DingTalk', '2026-05-16T21:59:00Z'),
('sm-adp-5', 'gen-003', 'slice:adapters', 'node', 'n-adapters-wechat', 5, 'WeChat', '2026-05-16T21:59:00Z'),
('sm-adp-6', 'gen-003', 'slice:adapters', 'node', 'n-adapter-tests', 6, 'adapter tests', '2026-05-16T21:59:00Z');

-- Step 8: Populate path_index
INSERT OR REPLACE INTO path_index(id, generation_id, path, node_id, relation, confidence, evidence_id, updated_at)
SELECT 'pi-' || substr(id, 3), 'gen-003', json_extract(attrs_json, '$.path'), id, 'owned-by', 'high', 'evt-source-symbol', '2026-05-16T21:59:00Z'
FROM nodes WHERE generation_id = 'gen-003' AND json_extract(attrs_json, '$.path') IS NOT NULL AND json_extract(attrs_json, '$.path') != '';

-- Step 9: Populate entrypoint_index
INSERT OR REPLACE INTO entrypoint_index(id, generation_id, entrypoint_key, entrypoint_type, node_id, capability_id, path, evidence_id, confidence)
VALUES
('ei-bin-launcher', 'gen-003', 'bin/claude-haha', 'bash-launcher', 'n-bin-launcher', 'n-cap-tui', 'bin/claude-haha', 'evt-source-symbol', 'high'),
('ei-cli-tsx', 'gen-003', 'src/entrypoints/cli.tsx', 'cli-entry', 'n-src-entrypoints', 'n-cap-tui', 'src/entrypoints/cli.tsx', 'evt-source-symbol', 'high'),
('ei-desktop-main', 'gen-003', 'desktop/src/main.tsx', 'react-entry', 'n-desktop-entrypoint', 'n-cap-desktop', 'desktop/src/main.tsx', 'evt-source-symbol', 'high'),
('ei-server-index', 'gen-003', 'src/server/index.ts', 'server-entry', 'n-src-server', 'n-cap-desktop', 'src/server/index.ts', 'evt-source-symbol', 'high'),
('ei-mcp-server', 'gen-003', 'src/entrypoints/mcp.ts', 'mcp-entry', 'n-src-entrypoints', 'n-cap-mcp', 'src/entrypoints/mcp.ts', 'evt-source-symbol', 'medium');

-- Step 10: Populate test_index
INSERT OR REPLACE INTO test_index(id, generation_id, test_path, test_name, node_id, capability_id, verification_node_id, evidence_id, confidence)
VALUES
('ti-server-tests', 'gen-003', 'src/server/__tests__/', 'server tests', 'n-server-tests', 'n-cap-desktop', 'n-src-server', 'evt-build-test-runtime', 'high'),
('ti-desktop-tests', 'gen-003', 'desktop/src/', 'desktop tests', 'n-desktop-tests', 'n-cap-desktop', 'n-desktop-stores', 'evt-build-test-runtime', 'high'),
('ti-adapter-tests', 'gen-003', 'adapters/', 'adapter tests', 'n-adapter-tests', 'n-cap-im-integration', 'n-adapters-common', 'evt-build-test-runtime', 'high');

-- Step 11: Populate alias_index
INSERT OR REPLACE INTO alias_index(id, generation_id, alias, normalized_alias, target_type, target_id, language, source, confidence, evidence_id)
VALUES
('ai-cli', 'gen-003', 'CLI', 'cli', 'capability', 'n-cap-tui', 'en', 'map-scan', 'high', 'evt-capability-workflow'),
('ai-desktop', 'gen-003', 'Desktop', 'desktop', 'capability', 'n-cap-desktop', 'en', 'map-scan', 'high', 'evt-capability-workflow'),
('ai-mcp', 'gen-003', 'MCP', 'mcp', 'capability', 'n-cap-mcp', 'en', 'map-scan', 'high', 'evt-capability-workflow'),
('ai-agent', 'gen-003', 'Agent', 'agent', 'capability', 'n-cap-agent', 'en', 'map-scan', 'high', 'evt-capability-workflow'),
('ai-tools', 'gen-003', 'Tools', 'tools', 'capability', 'n-cap-tools', 'en', 'map-scan', 'high', 'evt-capability-workflow'),
('ai-commands', 'gen-003', 'Commands', 'commands', 'capability', 'n-cap-commands', 'en', 'map-scan', 'high', 'evt-capability-workflow'),
('ai-memory', 'gen-003', 'Memory', 'memory', 'capability', 'n-cap-memory', 'en', 'map-scan', 'high', 'evt-capability-workflow'),
('ai-permissions', 'gen-003', 'Permissions', 'permissions', 'risk', 'n-risk-permissions', 'en', 'map-scan', 'high', 'evt-git-evolution-risk'),
('ai-oauth', 'gen-003', 'OAuth', 'oauth', 'risk', 'n-risk-oauth', 'en', 'map-scan', 'high', 'evt-git-evolution-risk');

-- Step 12: Populate symbol_index
INSERT OR REPLACE INTO symbol_index(id, generation_id, symbol_name, normalized_symbol, node_id, path, relation, evidence_id, confidence)
VALUES
('si-main', 'gen-003', 'main.tsx', 'main.tsx', 'n-src-main', 'src/main.tsx', 'defines', 'evt-source-symbol', 'high'),
('si-repl', 'gen-003', 'REPL.tsx', 'repl.tsx', 'n-src-screens', 'src/screens/REPL.tsx', 'defines', 'evt-source-symbol', 'high'),
('si-commands-ts', 'gen-003', 'commands.ts', 'commands.ts', 'n-src-commands-registry', 'src/commands.ts', 'defines', 'evt-source-symbol', 'high'),
('si-tools-ts', 'gen-003', 'tools.ts', 'tools.ts', 'n-src-tools-registry', 'src/tools.ts', 'defines', 'evt-source-symbol', 'high'),
('si-app-tsx', 'gen-003', 'App.tsx', 'app.tsx', 'n-desktop-app', 'desktop/src/App.tsx', 'defines', 'evt-source-symbol', 'high');

-- Step 13: Update metadata
INSERT OR REPLACE INTO metadata(key, value_json, updated_at) VALUES
('active_generation_id', '"gen-003"', '2026-05-16T21:59:00Z'),
('baseline_state', '"ready"', '2026-05-16T21:59:00Z'),
('graph_ready', 'true', '2026-05-16T21:59:00Z'),
('graph_store_path', '".specify/project-cognition/project-cognition.db"', '2026-05-16T21:59:00Z'),
('query_contract_version', '1', '2026-05-16T21:59:00Z'),
('update_contract_version', '1', '2026-05-16T21:59:00Z');
