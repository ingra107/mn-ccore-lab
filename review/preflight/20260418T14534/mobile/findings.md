# Persona: mobile (Team member on iPhone 12-class device)

Base: https://mn-ccore-lab.pages.dev
Pass count: 7
Findings: 2 (P0=0, P1=0, P2=2, INFO=0)

## Findings

### [P2] Mobile tab bar present
- id: MOBILE-TABBAR
- observed: no tab bar visible
- expected: bottom nav on mobile
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T14:53:46.789Z

### [P2] Mobile tap target sizes
- id: MOBILE-TAP-TARGETS
- observed: 3 sub-44 elements: A 16×16 "", A 16×16 "", SPAN 8×2 ""
- expected: all ≥44×44
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T14:53:46.794Z
