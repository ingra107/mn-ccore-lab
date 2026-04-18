# Persona: mobile (Team member on iPhone 12-class device)

Base: https://mn-ccore-lab.pages.dev
Pass count: 8
Findings: 1 (P0=0, P1=0, P2=1, INFO=0)

## Findings

### [P2] Mobile tap target sizes
- id: MOBILE-TAP-TARGETS
- observed: 4 sub-44 elements: A 1×1 "Skip to content", A 16×16 "", A 16×16 "", SPAN 8×2 "Open task:    "
- expected: all ≥44×44
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T20:45:04.179Z
