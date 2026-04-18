# Persona: accessibility (Keyboard-only + screen reader user)

Base: https://mn-ccore-lab.pages.dev
Pass count: 7
Findings: 4 (P0=0, P1=0, P2=4, INFO=0)

## Findings

### [P2] Skip-to-content anchor
- id: NO-SKIP-LINK
- observed: not found
- expected: first focusable element
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:25:13.172Z

### [P2] Form fields labeled
- id: UNLABELED-FIELDS
- observed: 2 unlabeled: <select> id=none, <select> id=none
- expected: all fields labeled
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:25:35.782Z

### [P2] aria-live regions present
- id: NO-ARIA-LIVE
- observed: 0 elements
- expected: PageHeader count/subtitle should be live
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T15:25:42.553Z

### [P2] Text contrast sanity
- id: LOW-CONTRAST
- observed: 5 low-contrast: "Minnesota Critical C" ratio=1.91, "University of Minnes" ratio=1.91, "Mayo Memorial Buildi" ratio=1.91, "Dashboard" ratio=1.91, "Projects" ratio=1.91
- expected: all text ≥3:1 (informal)
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T15:25:42.560Z
