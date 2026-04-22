# MASSIVE AUDIT — Run 20260422T05335

**Sections run:** 1
**Sections clean (0 bugs):** 1/1
**Total PASS findings:** 22
**Total bugs:** 0

## Section results

| Section | PASS | BUGS | Status |
|---|---|---|---|
| C-entities | 22 | 0 | ✓ clean |

## Cleanup

See `cleanup-report.json` for per-entity-type purge counts.

## Per-section findings (drill-down)

- [C-entities](./C-entities/findings.md)

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