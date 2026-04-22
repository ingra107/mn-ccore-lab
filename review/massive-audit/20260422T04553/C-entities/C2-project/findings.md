# C-entities/C2-project — desktop/dark

Run: 20260422T04553
Base: https://mn-ccore-lab.pages.dev
Screenshots: 7
PASS: 5
BUGS: 0 (P0 0, P1 0, P2 0)

## Bugs


## Trace


══════ SECTION C-entities/C2-project (desktop/dark) — run 20260422T04553 ══════
Base: https://mn-ccore-lab.pages.dev
C2 — project lifecycle
C2.1 Create project via CreateProjectModal
- [PASS] C2.1 project created (54fa11be6a7d…, slug=test-delete-c2proj-mo9ky4t3-tjfm)
C2.2 inline edit stage
- [PASS] C2.2 API reflects stage=Data Collection
C2.3 reload persistence
- [PASS] C2.3 project visible after reload
C2.4 soft-delete via POST :id/delete
- [PASS] C2.4 soft-delete returned ok
- [PASS] C2.4 project absent from default list after delete

──── CLEANUP (1 callbacks) ────