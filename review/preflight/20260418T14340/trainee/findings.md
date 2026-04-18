# Persona: trainee (Student/mentee, limited write access)

Base: https://mn-ccore-lab.pages.dev
Pass count: 8
Findings: 3 (P0=0, P1=1, P2=2, INFO=0)

## Findings

### [P1] Navigate to /network
- id: NAV-FAIL
- observed: page.goto: Timeout 20000ms exceeded.
Call log:
[2m  - navigating to "https://mn-ccore-lab.pages.dev/network", waiting until "networkidle"[22m

- expected: page loads within timeout
- url: https://mn-ccore-lab.pages.dev/network
- at: 2026-04-18T14:35:56.410Z

### [P2] Mentee milestones page title
- id: MENTEE-TITLE
- observed: MN-CCORE | Minnesota Critical Care Outcomes & Research Effort
- expected: contains "mentee" or "milestone"
- url: https://mn-ccore-lab.pages.dev/mentee-milestones
- at: 2026-04-18T14:35:21.642Z

### [P2] Trajectory page has expected header
- id: TRAJECTORY-HEADER
- observed: no Trajectory/Growth header
- expected: heading visible
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T14:35:30.187Z
