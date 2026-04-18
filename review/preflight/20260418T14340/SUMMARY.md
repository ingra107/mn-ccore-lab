# Pre-flight Run 20260418T14340

**Target:** https://mn-ccore-lab.pages.dev
**Completed:** 2026-04-18T14:37:42.907Z
**Elapsed:** 4m 40s total across 7 personas

## Launch gate: 🔴 HOLD

- ✓ **64** passes across 7 personas
- 🔥 **P0:** 2 — LAUNCH BLOCKER
- ❌ **P1:** 4 — gate threshold is <3
- ⚠ **P2:** 12
- ℹ **INFO:** 0

**Decision criteria:** P0=0 AND P1<3 → green. Current: P0=2, P1=4 → HOLD.

## Per-persona summary

| Persona | Role | Pass | P0 | P1 | P2 | INFO | Time |
|---------|------|------|----|----|----|------|------|
| pi-power-user | Nick — daily power user | 9 | 1 | 1 | 3 | 0 | 27s |
| collaborator | Mesfin — Monday-morning catchup | 10 | 0 | 0 | 1 | 0 | 26s |
| coordinator | Research coordinator — heavy data entry | 14 | 0 | 0 | 1 | 0 | 19s |
| trainee | Student/mentee — limited access | 8 | 0 | 1 | 2 | 0 | 47s |
| mobile | iPhone 12 @ 375×812 | 6 | 0 | 1 | 2 | 0 | 37s |
| accessibility | Keyboard-only + screen reader | 5 | 1 | 1 | 3 | 0 | 33s |
| breaker | Adversary — races, XSS, throttle | 12 | 0 | 0 | 0 | 0 | 31s |

## Findings detail

### pi-power-user

See: [pi-power-user/findings.md](./pi-power-user/findings.md)

### collaborator

See: [collaborator/findings.md](./collaborator/findings.md)

### coordinator

See: [coordinator/findings.md](./coordinator/findings.md)

### trainee

See: [trainee/findings.md](./trainee/findings.md)

### mobile

See: [mobile/findings.md](./mobile/findings.md)

### accessibility

See: [accessibility/findings.md](./accessibility/findings.md)

---

## What each persona covered
- **pi-power-user** (Nick — daily power user): 9 check(s) passed, 5 finding(s)
- **collaborator** (Mesfin — Monday-morning catchup): 10 check(s) passed, 1 finding(s)
- **coordinator** (Research coordinator — heavy data entry): 14 check(s) passed, 1 finding(s)
- **trainee** (Student/mentee — limited access): 8 check(s) passed, 3 finding(s)
- **mobile** (iPhone 12 @ 375×812): 6 check(s) passed, 3 finding(s)
- **accessibility** (Keyboard-only + screen reader): 5 check(s) passed, 5 finding(s)
- **breaker** (Adversary — races, XSS, throttle): 12 check(s) passed, 0 finding(s)

## Artifacts
- Screenshots: `review/preflight/${RUN_ID}/<persona>/*.png`
- Per-persona findings: `review/preflight/${RUN_ID}/<persona>/findings.md`
- Per-persona journey log: `review/preflight/${RUN_ID}/<persona>/journey.log`