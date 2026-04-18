# Persona: pi-power-user (Principal Investigator, daily power user)

Base: https://mn-ccore-lab.pages.dev
Pass count: 9
Findings: 5 (P0=1, P1=1, P2=3, INFO=0)

## Findings

### [P0] Persona journey aborted
- id: FATAL
- observed: Cannot create property 'passCount' on string 'Focus Next picked up new urgent task'
- expected: journey completes without fatal error
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T14:34:29.243Z

### [P1] Dashboard header with icon
- id: NOT-VISIBLE
- observed: selector "h1:has-text("Dashboard"), [aria-label*="Dashboard"]" not visible
- expected: selector visible on current page
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T14:34:08.049Z

### [P2] Focus Next card
- id: NOT-VISIBLE
- observed: selector "text=Focus Next" not visible
- expected: selector visible on current page
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T14:34:08.060Z

### [P2] Filter projects by PI
- id: PI-FILTER-MISSING
- observed: no PI filter control
- expected: filter to show only my projects
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T14:34:19.002Z

### [P2] PI Analytics populated
- id: PI-ANALYTICS-EMPTY
- observed: 0 panels
- expected: >0
- url: https://mn-ccore-lab.pages.dev/pi-analytics
- at: 2026-04-18T14:34:25.322Z
