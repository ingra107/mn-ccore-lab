# A-smoke — desktop/dark

Run: 20260422T04261
Base: https://mn-ccore-lab.pages.dev
Screenshots: 1
PASS: 5
BUGS: 1 (P0 1, P1 0, P2 0)

## Bugs

- **[A5.1] [P0] POST /api/tasks creates with Bearer**
  - Observed: status=400
  - Expected: 201

## Trace


══════ SECTION A-smoke (desktop/dark) — run 20260422T04261 ══════
Base: https://mn-ccore-lab.pages.dev
A1 — /api/health
- [PASS] A1 /api/health OK (checks=6)
A2 — /portal/* without CF Access blocked
- [PASS] A2 unauth /portal/dashboard returned 302 (gate active)
A3 — /portal/* WITH service token
- [PASS] A3 service-token /portal/dashboard returned 200
A4 — POST /api/tasks without Bearer
- [PASS] A4 noBearer POST gated correctly (401)
A5 — POST /api/tasks WITH Bearer (creates throwaway test task)
- [BUG] [A5.1] [P0] POST /api/tasks creates with Bearer
- [PASS] A6 dashboard renders in headless browser with auth headers

──── CLEANUP (0 callbacks) ────