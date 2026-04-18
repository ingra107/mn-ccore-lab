# Pre-flight Run 20260418T14542

**Target:** https://mn-ccore-lab.pages.dev
**Completed:** 2026-04-18T14:57:54.069Z
**Elapsed:** 3m 25s total across 7 personas

## Launch gate: 🟢 GREEN

- ✓ **73** passes across 7 personas
- 🔥 **P0:** 0 (clean)
- ❌ **P1:** 0 (within gate)
- ⚠ **P2:** 13
- ℹ **INFO:** 0

**Decision criteria:** P0=0 AND P1<3 → green. Current: P0=0, P1=0 → GREEN.

## Per-persona summary

| Persona | Role | Pass | P0 | P1 | P2 | INFO | Time |
|---------|------|------|----|----|----|------|------|
| pi-power-user | Nick — daily power user | 15 | 0 | 0 | 3 | 0 | 31s |
| collaborator | Mesfin — Monday-morning catchup | 10 | 0 | 0 | 1 | 0 | 26s |
| coordinator | Research coordinator — heavy data entry | 14 | 0 | 0 | 1 | 0 | 19s |
| trainee | Student/mentee — limited access | 8 | 0 | 0 | 2 | 0 | 28s |
| mobile | iPhone 12 @ 375×812 | 7 | 0 | 0 | 2 | 0 | 37s |
| accessibility | Keyboard-only + screen reader | 7 | 0 | 0 | 4 | 0 | 34s |
| breaker | Adversary — races, XSS, throttle | 12 | 0 | 0 | 0 | 0 | 30s |

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
- **pi-power-user** (Nick — daily power user): 15 check(s) passed, 3 finding(s)
- **collaborator** (Mesfin — Monday-morning catchup): 10 check(s) passed, 1 finding(s)
- **coordinator** (Research coordinator — heavy data entry): 14 check(s) passed, 1 finding(s)
- **trainee** (Student/mentee — limited access): 8 check(s) passed, 2 finding(s)
- **mobile** (iPhone 12 @ 375×812): 7 check(s) passed, 2 finding(s)
- **accessibility** (Keyboard-only + screen reader): 7 check(s) passed, 4 finding(s)
- **breaker** (Adversary — races, XSS, throttle): 12 check(s) passed, 0 finding(s)

## Artifacts
- Screenshots: `review/preflight/${RUN_ID}/<persona>/*.png`
- Per-persona findings: `review/preflight/${RUN_ID}/<persona>/findings.md`
- Per-persona journey log: `review/preflight/${RUN_ID}/<persona>/journey.log`