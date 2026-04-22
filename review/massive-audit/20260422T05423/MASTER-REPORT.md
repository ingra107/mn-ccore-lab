# MASSIVE AUDIT — Run 20260422T05423

**Sections run:** 12
**Sections clean (0 bugs):** 11/12
**Total PASS findings:** 269
**Total bugs:** 79

## Section results

| Section | PASS | BUGS | Status |
|---|---|---|---|
| A-smoke | 6 | 0 | ✓ clean |
| B-visual | 204 | 79 | 79 bug(s) |
| C-entities | 22 | 0 | ✓ clean |
| D-modals | 12 | 0 | ✓ clean |
| E-keyboard | 9 | 0 | ✓ clean |
| F-context-menus | 4 | 0 | ✓ clean |
| G-drag-drop | 3 | 0 | ✓ clean |
| H-realtime | 3 | 0 | ✓ clean |
| I-uploads | 1 | 0 | ✓ clean |
| J-hermes | 1 | 0 | ✓ clean |
| K-notifications | 2 | 0 | ✓ clean |
| L-search | 2 | 0 | ✓ clean |

## Cleanup

See `cleanup-report.json` for per-entity-type purge counts.

## Per-section findings (drill-down)

- [A-smoke](./A-smoke/findings.md)
- [B-visual](./B-visual/findings.md)
- [C-entities](./C-entities/findings.md)
- [D-modals](./D-modals/findings.md)
- [E-keyboard](./E-keyboard/findings.md)
- [F-context-menus](./F-context-menus/findings.md)
- [G-drag-drop](./G-drag-drop/findings.md)
- [H-realtime](./H-realtime/findings.md)
- [I-uploads](./I-uploads/findings.md)
- [J-hermes](./J-hermes/findings.md)
- [K-notifications](./K-notifications/findings.md)
- [L-search](./L-search/findings.md)

## Coverage notes

- **B-visual** sweeps all 41 routes × 6 viewport+theme combos. Per-page table is in B-visual/findings.md. Axe/overlap/console findings persisted to JSON.
- **C-entities** lifecycle: C1 (task) + C2 (project) full UI inline-edit; C3-C13 lightweight create + API verify.
- **D-L** scaffolded with representative checks. Each section can be deepened independently via the `--section` flag.

## Re-run a single section

```bash
npx tsx scripts/massive-audit/run.ts --section=A
```

## Cleanup-only (after a crashed run)

```bash
npx tsx scripts/massive-audit/run.ts --cleanup-only
```