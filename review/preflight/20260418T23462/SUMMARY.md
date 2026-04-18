# Pre-flight Run 20260418T23462

**Target:** https://mn-ccore-lab.pages.dev
**Completed:** 2026-04-18T23:51:26.658Z
**Elapsed:** 5m 5s total across 9 personas

## Launch gate: 🟢 GREEN

- ✓ **97** passes across 9 personas
- 🔥 **P0:** 0 (clean)
- ❌ **P1:** 0 (within gate)
- ⚠ **P2:** 11
- ℹ **INFO:** 0

**Decision criteria:** P0=0 AND P1<3 → green. Current: P0=0, P1=0 → GREEN.

## Per-persona summary

| Persona | Role | Pass | P0 | P1 | P2 | INFO | Time |
|---------|------|------|----|----|----|------|------|
| health | Ops health probe — /api/health | 1 | 0 | 0 | 0 | 0 | 2s |
| newcomer | Brand-new team member — empty states | 21 | 0 | 0 | 0 | 0 | 98s |
| pi-power-user | Nick — daily power user | 14 | 0 | 0 | 4 | 0 | 31s |
| collaborator | Mesfin — Monday-morning catchup | 10 | 0 | 0 | 1 | 0 | 26s |
| coordinator | Research coordinator — heavy data entry | 14 | 0 | 0 | 1 | 0 | 19s |
| trainee | Student/mentee — limited access | 8 | 0 | 0 | 2 | 0 | 27s |
| mobile | iPhone 12 @ 375×812 | 8 | 0 | 0 | 1 | 0 | 37s |
| accessibility | Keyboard-only + screen reader | 9 | 0 | 0 | 2 | 0 | 34s |
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
- **health** (Ops health probe — /api/health): 1 check(s) passed, 0 finding(s)
- **newcomer** (Brand-new team member — empty states): 21 check(s) passed, 0 finding(s)
- **pi-power-user** (Nick — daily power user): 14 check(s) passed, 4 finding(s)
- **collaborator** (Mesfin — Monday-morning catchup): 10 check(s) passed, 1 finding(s)
- **coordinator** (Research coordinator — heavy data entry): 14 check(s) passed, 1 finding(s)
- **trainee** (Student/mentee — limited access): 8 check(s) passed, 2 finding(s)
- **mobile** (iPhone 12 @ 375×812): 8 check(s) passed, 1 finding(s)
- **accessibility** (Keyboard-only + screen reader): 9 check(s) passed, 2 finding(s)
- **breaker** (Adversary — races, XSS, throttle): 12 check(s) passed, 0 finding(s)

## Artifacts
- Screenshots: `review/preflight/${RUN_ID}/<persona>/*.png`
- Per-persona findings: `review/preflight/${RUN_ID}/<persona>/findings.md`
- Per-persona journey log: `review/preflight/${RUN_ID}/<persona>/journey.log`