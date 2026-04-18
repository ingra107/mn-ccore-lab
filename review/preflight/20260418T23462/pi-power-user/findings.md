# Persona: pi-power-user (Principal Investigator, daily power user)

Base: https://mn-ccore-lab.pages.dev
Pass count: 14
Findings: 4 (P0=0, P1=0, P2=4, INFO=0)

## Findings

### [P2] Focus Next card
- id: NOT-VISIBLE
- observed: selector "text=Focus Next" not visible
- expected: selector visible on current page
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T23:48:05.748Z

### [P2] Filter projects by PI
- id: PI-FILTER-MISSING
- observed: no PI filter control
- expected: filter to show only my projects
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T23:48:16.639Z

### [P2] PI Analytics populated
- id: PI-ANALYTICS-EMPTY
- observed: 0 panels
- expected: >0
- url: https://mn-ccore-lab.pages.dev/pi-analytics
- at: 2026-04-18T23:48:22.903Z

### [P2] Ctrl+. toggles theme
- id: THEME-TOGGLE
- observed: still dark=true
- expected: toggled
- url: https://mn-ccore-lab.pages.dev/ideas
- at: 2026-04-18T23:48:32.053Z
