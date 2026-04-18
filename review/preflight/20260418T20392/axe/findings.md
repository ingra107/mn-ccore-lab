# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 13
Findings: 1 (P0=0, P1=1, P2=0, INFO=0)

## Findings

### [P1] /dashboard: Scrollable region must have keyboard access
- id: AXE-SCROLLABLE-REGION-FOCUSABLE
- observed: 1 element(s): .bento-span-1x2 > .bento-card.h-full > .min-h-0.flex-1 > .flex-col.h-full.flex > .-mx-1.overflow-y-auto.px-1
- expected: https://dequeuniversity.com/rules/axe/4.11/scrollable-region-focusable?application=playwright — Ensure elements that have scrollable content are accessible by keyboard in Safari
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:39:28.016Z
