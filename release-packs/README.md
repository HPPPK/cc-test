# Importable mode packs

Desktop releases attach every ZIP from these maintained directories:

- `src/server/packs/`: five workflow packs, rebuilt from `workflows/`.
- `src/server/packs/experts/`: three bundled experts, rebuilt from `experts/`.
- `release-packs/experts/`: two additional user-authored experts, exported from the installed pack library: `uiux-design-system-expert` 0.3.28 and `website-reference` 1.2.0.

The additional experts are download/import attachments. Their presence here does not silently install them or change the built-in expert list. These ZIPs contain mode definitions and resources, not user sessions or provider credentials. Backups and disabled-mode preferences are not release attachments.

The software updater and all release downloads use [HPPPK/cc-test](https://github.com/HPPPK/cc-test/releases).
