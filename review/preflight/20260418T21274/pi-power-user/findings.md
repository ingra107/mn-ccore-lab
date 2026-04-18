# Persona: pi-power-user (Principal Investigator, daily power user)

Base: https://mn-ccore-lab.pages.dev
Pass count: 15
Findings: 3 (P0=0, P1=0, P2=3, INFO=0)

## Findings

### [P2] Focus Next card
- id: NOT-VISIBLE
- observed: selector "text=Focus Next" not visible
- expected: selector visible on current page
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T21:27:46.147Z

### [P2] Filter projects by PI
- id: PI-FILTER-MISSING
- observed: no PI filter control
- expected: filter to show only my projects
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T21:27:57.314Z

### [P2] PI Analytics populated
- id: PI-ANALYTICS-EMPTY
- observed: 0 panels
- expected: >0
- url: https://mn-ccore-lab.pages.dev/pi-analytics
- at: 2026-04-18T21:28:03.797Z
