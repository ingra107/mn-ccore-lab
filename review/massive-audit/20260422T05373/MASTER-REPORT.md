# MASSIVE AUDIT — Run 20260422T05373

**Sections run:** 2
**Sections clean (0 bugs):** 1/2
**Total PASS findings:** 13
**Total bugs:** 2

## Section results

| Section | PASS | BUGS | Status |
|---|---|---|---|
| D-modals | 12 | 0 | ✓ clean |
| F-context-menus | 1 | 2 | 2 bug(s) |

## Cleanup

See `cleanup-report.json` for per-entity-type purge counts.

## Per-section findings (drill-down)

- [D-modals](./D-modals/findings.md)
- [F-context-menus](./F-context-menus/findings.md)

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