#!/usr/bin/env python3
"""Generate repository-universe.json for sp-map-scan."""
import json
from collections import Counter

import os
with open(os.path.join(os.environ.get('TEMP', '/tmp'), 'cc-jiangxia-included.txt')) as f:
    files = [l.strip() for l in f if l.strip()]

included = list(files)
excluded_paths = [
    {'path': 'node_modules/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': 'desktop/node_modules/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': 'dist/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': 'build/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': 'desktop/build/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': 'desktop/dist/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': 'desktop/src-tauri/target/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': 'target/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': 'artifacts/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': '.opencode/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': '.planning/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': '.git/', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
    {'path': '.specify/', 'reason': 'cognitionignore rule - workflow/runtime state', 'decision_source': '.cognitionignore'},
    {'path': '.env', 'reason': 'cognitionignore rule', 'decision_source': '.cognitionignore'},
]

dispositions = {}
criticality = {}
classification_reasons = {}

def classify(path):
    """Return (disposition, criticality, reason) for a path."""
    # Critical entry points and state
    if path.startswith('src/commands/'):
        return 'deep_read', 'critical', 'command entrypoints - primary user interaction surface'
    if path.startswith('src/tools/'):
        return 'deep_read', 'critical', 'tool definitions - agent capability surface'
    if path.startswith('src/server/'):
        return 'deep_read', 'critical', 'server layer - core API and state management'
    if path.startswith('src/services/'):
        return 'deep_read', 'critical', 'service layer - business logic and data access'
    if path.startswith('src/skills/'):
        return 'deep_read', 'critical', 'skill system - agent capability orchestration'
    if path.startswith('src/cli/'):
        return 'deep_read', 'critical', 'CLI entrypoints - user command surface'
    if path.startswith('src/entrypoints/'):
        return 'deep_read', 'critical', 'application entrypoints - startup and initialization'
    if path.startswith('src/state/'):
        return 'deep_read', 'critical', 'state management - core application state'
    if path.startswith('src/migrations/'):
        return 'deep_read', 'critical', 'database migrations - schema evolution'
    if path.startswith('desktop/src-tauri/'):
        return 'deep_read', 'critical', 'desktop backend - Tauri Rust layer'

    # Important surfaces
    if path.startswith('src/components/'):
        return 'deep_read', 'important', 'UI components - core user-facing surface'
    if path.startswith('src/hooks/'):
        return 'sampled', 'important', 'React hooks - shared state logic'
    if path.startswith('src/ink/'):
        return 'sampled', 'important', 'Ink terminal UI framework - rendering surface'
    if path.startswith('src/bridge/'):
        return 'sampled', 'important', 'bridge layer - cross-process communication'
    if path.startswith('src/types/'):
        return 'sampled', 'important', 'type definitions - shared contracts'
    if path.startswith('src/tasks/'):
        return 'sampled', 'important', 'task system - workflow orchestration'
    if path.startswith('src/context/'):
        return 'sampled', 'important', 'React context - shared state providers'
    if path.startswith('desktop/src/'):
        return 'sampled', 'important', 'desktop frontend - Tauri/React UI surface'
    if path.startswith('adapters/'):
        return 'sampled', 'important', 'platform adapters - integration surfaces'
    if path.startswith('scripts/'):
        return 'sampled', 'important', 'build/deploy scripts - operational surface'
    if path.startswith('.github/'):
        return 'sampled', 'important', 'GitHub config - CI/CD and issue templates'
    if path.startswith('runtime/'):
        return 'sampled', 'important', 'runtime configuration - execution environment'
    if path.startswith('bin/'):
        return 'sampled', 'important', 'binary/script entrypoints - execution surface'
    if path.startswith('tests/'):
        return 'sampled', 'important', 'test suite - verification surface'
    if path.startswith('fixtures/'):
        return 'sampled', 'important', 'test fixtures - verification data'

    # Low risk - inventory only
    if path.startswith('src/utils/'):
        return 'inventory_only', 'low_risk', 'utility code - inventory scan sufficient'
    if path.startswith('src/vendor/'):
        return 'inventory_only', 'low_risk', 'vendor code - third-party bundled'
    if path.startswith('src/constants/'):
        return 'inventory_only', 'low_risk', 'constants - static configuration values'
    if path.startswith('docs/'):
        return 'inventory_only', 'low_risk', 'documentation - reference material'
    if path.startswith('.codex/skills/'):
        return 'inventory_only', 'low_risk', 'codex skills - workflow reference material'
    if path.startswith('release-notes/'):
        return 'inventory_only', 'low_risk', 'release notes - historical reference'
    if path.startswith('stubs/'):
        return 'inventory_only', 'low_risk', 'stubs - type stubs for external packages'

    # Other small src modules
    if path.startswith('src/'):
        return 'sampled', 'important', 'source module - code surface'

    # Root-level files
    return 'sampled', 'important', 'root configuration - project metadata'

for f in files:
    disp, crit, reason = classify(f)
    dispositions[f] = disp
    criticality[f] = crit
    classification_reasons[f] = reason

universe = {
    'schema_version': '1.0.0',
    'generated_at': '2026-06-10T12:00:00Z',
    'candidate_universe': files,
    'included_paths': included,
    'excluded_paths': excluded_paths,
    'ambiguous_paths': [],
    'dispositions': dispositions,
    'criticality': criticality,
    'classification_reasons': classification_reasons,
    'decision_source': '.cognitionignore + leader path classification'
}

with open('.specify/project-cognition/workbench/repository-universe.json', 'w', encoding='utf-8') as out:
    json.dump(universe, out, indent=2, ensure_ascii=False)

print(f'Total included: {len(included)}')
print(f'Total excluded patterns: {len(excluded_paths)}')
print(f'Dispositions assigned: {len(dispositions)}')

disp_counts = Counter(dispositions.values())
crit_counts = Counter(criticality.values())
print(f'By disposition: {dict(disp_counts)}')
print(f'By criticality: {dict(crit_counts)}')
