# Persona: accessibility (Keyboard-only + screen reader user)

Base: https://mn-ccore-lab.pages.dev
Pass count: 9
Findings: 2 (P0=0, P1=0, P2=2, INFO=0)

## Findings

### [P2] aria-live regions present
- id: NO-ARIA-LIVE
- observed: 0 elements
- expected: PageHeader count/subtitle should be live
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T21:30:38.548Z

### [P2] Text contrast sanity
- id: LOW-CONTRAST
- observed: 5 low-contrast: "Home" ratio=1.38, "Research" ratio=1.38, "Team" ratio=1.38, "Publications" ratio=1.38, "Contact" ratio=1.38
- expected: all text ≥3:1 (informal)
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T21:30:38.558Z
