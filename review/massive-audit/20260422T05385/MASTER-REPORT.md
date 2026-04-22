# MASSIVE AUDIT — Run 20260422T05385

**Sections run:** 3
**Sections clean (0 bugs):** 0/3
**Total PASS findings:** 11
**Total bugs:** 4

## Section results

| Section | PASS | BUGS | Status |
|---|---|---|---|
| F-context-menus | 2 | 2 | 2 bug(s) |
| L-search | 1 | 1 | 1 bug(s) |
| E-keyboard | 8 | 1 | 1 bug(s) |

## Cleanup

See `cleanup-report.json` for per-entity-type purge counts.

## Per-section findings (drill-down)

- [F-context-menus](./F-context-menus/findings.md)
- [L-search](./L-search/findings.md)
- [E-keyboard](./E-keyboard/findings.md)

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