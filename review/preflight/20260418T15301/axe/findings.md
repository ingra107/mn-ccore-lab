# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 0
Findings: 46 (P0=25, P1=21, P2=0, INFO=0)

## Findings

### [P0] /dashboard: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 21 element(s): .gap-2.items-center.flex > button | div:nth-child(1) > .pl-7.action-board-row.py-1\.5:nth-child(2) > .action-board-status-btn.cursor-pointer[type="button"] | .pl-7.action-board-row.py-1\.5:nth-child(3) > .action-board-status-btn.cursor-pointer[type="button"]
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T15:30:18.279Z

### [P0] /my-tasks: Elements must only use supported ARIA attributes
- id: AXE-ARIA-ALLOWED-ATTR
- observed: 30 element(s): div[aria-rowcount="14"] > .task-grid-header[aria-rowindex="1"][role="row"] > div[role="columnheader"][aria-describedby="column-reorder"][aria-roledescription="sortable"]:nth-child(2) > .col-header[aria-label="Sort by TITLE"][aria-sort="none"] | div[aria-rowcount="14"] > .task-grid-header[aria-rowind
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-allowed-attr?application=playwright — Ensure an element's role supports its ARIA attributes
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:24.671Z

### [P0] /my-tasks: Certain ARIA roles must contain particular children
- id: AXE-ARIA-REQUIRED-CHILDREN
- observed: 25 element(s): div[aria-rowcount="14"] | div[aria-rowcount="14"] > div:nth-child(4) > div > div[data-index="0"] > .task-grid-row.hover\:bg-black\/\[0\.02\][aria-rowindex="2"] | div[aria-rowcount="14"] > div:nth-child(4) > div > div[data-index="1"] > .task-grid-row.hover\:bg-black\/\[0\.02\][aria-rowindex="3"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-required-children?application=playwright — Ensure elements with an ARIA role that require child roles contain them
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:24.672Z

### [P0] /my-tasks: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 64 element(s): .group.text-left[aria-describedby="DndDescribedBy-0"]:nth-child(1) > .cursor-grab.active\:cursor-grabbing.group-hover\:opacity-40 | .group.text-left[aria-describedby="DndDescribedBy-0"]:nth-child(2) > .cursor-grab.active\:cursor-grabbing.group-hover\:opacity-40 | .group.text-left[aria-describedby="D
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:24.673Z

### [P0] /my-tasks: Select element must have an accessible name
- id: AXE-SELECT-NAME
- observed: 2 element(s): .gap-1\.5.flex.items-center:nth-child(4) > select | .gap-1\.5.flex.items-center:nth-child(5) > select
- expected: https://dequeuniversity.com/rules/axe/4.11/select-name?application=playwright — Ensure select element has an accessible name
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:24.674Z

### [P0] /tasks: Elements must only use supported ARIA attributes
- id: AXE-ARIA-ALLOWED-ATTR
- observed: 30 element(s): div[aria-rowcount="14"] > .task-grid-header[aria-rowindex="1"][role="row"] > div[role="columnheader"][aria-describedby="column-reorder"][aria-roledescription="sortable"]:nth-child(2) > .col-header[aria-label="Sort by TITLE"][aria-sort="none"] | div[aria-rowcount="14"] > .task-grid-header[aria-rowind
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-allowed-attr?application=playwright — Ensure an element's role supports its ARIA attributes
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:30.597Z

### [P0] /tasks: Certain ARIA roles must contain particular children
- id: AXE-ARIA-REQUIRED-CHILDREN
- observed: 25 element(s): div[aria-rowcount="14"] | div[aria-rowcount="14"] > div:nth-child(4) > div > div[data-index="0"] > .task-grid-row.hover\:bg-black\/\[0\.02\][aria-rowindex="2"] | div[aria-rowcount="14"] > div:nth-child(4) > div > div[data-index="1"] > .task-grid-row.hover\:bg-black\/\[0\.02\][aria-rowindex="3"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-required-children?application=playwright — Ensure elements with an ARIA role that require child roles contain them
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:30.598Z

### [P0] /tasks: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 64 element(s): .group.text-left[aria-describedby="DndDescribedBy-1"]:nth-child(1) > .cursor-grab.active\:cursor-grabbing.group-hover\:opacity-40 | .group.text-left[aria-describedby="DndDescribedBy-1"]:nth-child(2) > .cursor-grab.active\:cursor-grabbing.group-hover\:opacity-40 | .group.text-left[aria-describedby="D
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:30.599Z

### [P0] /tasks: Select element must have an accessible name
- id: AXE-SELECT-NAME
- observed: 2 element(s): .gap-1\.5.flex.items-center:nth-child(4) > select | .gap-1\.5.flex.items-center:nth-child(5) > select
- expected: https://dequeuniversity.com/rules/axe/4.11/select-name?application=playwright — Ensure select element has an accessible name
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:30.600Z

### [P0] /projects: Elements must only use supported ARIA attributes
- id: AXE-ARIA-ALLOWED-ATTR
- observed: 5 element(s): button[aria-label="Sort by Title"] | button[aria-label="Sort by Status"] | button[aria-sort="ascending"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-allowed-attr?application=playwright — Ensure an element's role supports its ARIA attributes
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T15:30:37.876Z

### [P0] /projects: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 1 element(s): .gap-2.flex.items-center:nth-child(2) > button
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T15:30:37.877Z

### [P0] /manuscripts: Elements must only use supported ARIA attributes
- id: AXE-ARIA-ALLOWED-ATTR
- observed: 6 element(s): button[aria-label="Sort by Title"] | button[aria-label="Sort by Status"] | button[aria-sort="ascending"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-allowed-attr?application=playwright — Ensure an element's role supports its ARIA attributes
- url: https://mn-ccore-lab.pages.dev/manuscripts
- at: 2026-04-18T15:30:45.087Z

### [P0] /manuscripts: Select element must have an accessible name
- id: AXE-SELECT-NAME
- observed: 2 element(s): select:nth-child(1) | select:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/select-name?application=playwright — Ensure select element has an accessible name
- url: https://mn-ccore-lab.pages.dev/manuscripts
- at: 2026-04-18T15:30:45.088Z

### [P0] /meetings: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 1 element(s): main > div > div > .gap-2.items-center.flex > button
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/meetings
- at: 2026-04-18T15:30:49.294Z

### [P0] /deadlines: Elements must only use supported ARIA attributes
- id: AXE-ARIA-ALLOWED-ATTR
- observed: 6 element(s): button[aria-label="Sort by Title"] | button[aria-label="Sort by Project"] | button[aria-sort="ascending"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-allowed-attr?application=playwright — Ensure an element's role supports its ARIA attributes
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T15:30:53.837Z

### [P0] /deadlines: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 2 element(s): .gap-2.flex.items-center:nth-child(4) > button | main > div > div > div:nth-child(4) > button:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T15:30:53.837Z

### [P0] /deadlines: Select element must have an accessible name
- id: AXE-SELECT-NAME
- observed: 1 element(s): select
- expected: https://dequeuniversity.com/rules/axe/4.11/select-name?application=playwright — Ensure select element has an accessible name
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T15:30:53.838Z

### [P0] /ideas: Elements must only use supported ARIA attributes
- id: AXE-ARIA-ALLOWED-ATTR
- observed: 5 element(s): button[aria-label="Sort by Title"] | button[aria-label="Sort by Submitter"] | button[aria-label="Sort by Status"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-allowed-attr?application=playwright — Ensure an element's role supports its ARIA attributes
- url: https://mn-ccore-lab.pages.dev/ideas
- at: 2026-04-18T15:30:59.961Z

### [P0] /ideas: Certain ARIA roles must be contained by particular parents
- id: AXE-ARIA-REQUIRED-PARENT
- observed: 1 element(s): .sm\:grid.hidden[role="row"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-required-parent?application=playwright — Ensure elements with an ARIA role that require parent roles are contained by them
- url: https://mn-ccore-lab.pages.dev/ideas
- at: 2026-04-18T15:30:59.961Z

### [P0] /ideas: Select element must have an accessible name
- id: AXE-SELECT-NAME
- observed: 1 element(s): select
- expected: https://dequeuniversity.com/rules/axe/4.11/select-name?application=playwright — Ensure select element has an accessible name
- url: https://mn-ccore-lab.pages.dev/ideas
- at: 2026-04-18T15:30:59.962Z

### [P0] /decisions: Elements must only use supported ARIA attributes
- id: AXE-ARIA-ALLOWED-ATTR
- observed: 5 element(s): button[aria-label="Sort by Title"] | button[aria-label="Sort by Outcome"] | button[aria-label="Sort by Decided By"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-allowed-attr?application=playwright — Ensure an element's role supports its ARIA attributes
- url: https://mn-ccore-lab.pages.dev/decisions
- at: 2026-04-18T15:31:04.991Z

### [P0] /decisions: Certain ARIA roles must be contained by particular parents
- id: AXE-ARIA-REQUIRED-PARENT
- observed: 1 element(s): .table-container > div[role="row"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-required-parent?application=playwright — Ensure elements with an ARIA role that require parent roles are contained by them
- url: https://mn-ccore-lab.pages.dev/decisions
- at: 2026-04-18T15:31:04.992Z

### [P0] /grants: Elements must only use supported ARIA attributes
- id: AXE-ARIA-ALLOWED-ATTR
- observed: 6 element(s): button[aria-label="Sort by TITLE"] | button[aria-label="Sort by PI"] | button[aria-label="Sort by STATUS"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-allowed-attr?application=playwright — Ensure an element's role supports its ARIA attributes
- url: https://mn-ccore-lab.pages.dev/grants
- at: 2026-04-18T15:31:08.969Z

### [P0] /analytics: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 2 element(s): .w-8.h-8.dark\:hover\:bg-white\/5:nth-child(1) | .w-8.h-8.dark\:hover\:bg-white\/5:nth-child(3)
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/analytics
- at: 2026-04-18T15:31:13.197Z

### [P0] /settings: Select element must have an accessible name
- id: AXE-SELECT-NAME
- observed: 1 element(s): select
- expected: https://dequeuniversity.com/rules/axe/4.11/select-name?application=playwright — Ensure select element has an accessible name
- url: https://mn-ccore-lab.pages.dev/settings
- at: 2026-04-18T15:31:26.831Z

### [P1] /dashboard: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 16 element(s): .text-xs | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T15:30:18.279Z

### [P1] /dashboard: Interactive controls must not be nested
- id: AXE-NESTED-INTERACTIVE
- observed: 4 element(s): div[data-testid="card-action-board"] > .dashboard-grid-card[role="button"] | div[data-testid="card-project-health"] > .dashboard-grid-card[role="button"] | div[data-testid="card-pipeline"] > .dashboard-grid-card[role="button"]
- expected: https://dequeuniversity.com/rules/axe/4.11/nested-interactive?application=playwright — Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T15:30:18.280Z

### [P1] /dashboard: Scrollable region must have keyboard access
- id: AXE-SCROLLABLE-REGION-FOCUSABLE
- observed: 1 element(s): .bento-span-1x2 > .bento-card.h-full > .min-h-0.flex-1 > .flex-col.h-full.flex > .-mx-1.overflow-y-auto.px-1
- expected: https://dequeuniversity.com/rules/axe/4.11/scrollable-region-focusable?application=playwright — Ensure elements that have scrollable content are accessible by keyboard in Safari
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T15:30:18.281Z

### [P1] /my-tasks: ARIA commands must have an accessible name
- id: AXE-ARIA-COMMAND-NAME
- observed: 1 element(s): div[aria-rowcount="3"] > div:nth-child(4) > div > div[data-index="0"] > .task-grid-row.hover\:bg-black\/\[0\.02\][aria-rowindex="2"] > .task-row-title[role="gridcell"] > .gap-1.flex.items-center > .task-title-clickable[role="button"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-command-name?application=playwright — Ensure every ARIA button, link and menuitem has an accessible name
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:24.672Z

### [P1] /my-tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 69 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .px-2.font-normal.uppercase | div:nth-child(3) > .px-2.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:24.673Z

### [P1] /my-tasks: Interactive controls must not be nested
- id: AXE-NESTED-INTERACTIVE
- observed: 3 element(s): .group.text-left[aria-describedby="DndDescribedBy-0"]:nth-child(1) | .group.text-left[aria-describedby="DndDescribedBy-0"]:nth-child(2) | .group.text-left[aria-describedby="DndDescribedBy-0"]:nth-child(3)
- expected: https://dequeuniversity.com/rules/axe/4.11/nested-interactive?application=playwright — Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:24.673Z

### [P1] /tasks: ARIA commands must have an accessible name
- id: AXE-ARIA-COMMAND-NAME
- observed: 1 element(s): div[aria-rowcount="3"] > div:nth-child(4) > div > div[data-index="0"] > .task-grid-row.hover\:bg-black\/\[0\.02\][aria-rowindex="2"] > .task-row-title[role="gridcell"] > .gap-1.flex.items-center > .task-title-clickable[role="button"]
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-command-name?application=playwright — Ensure every ARIA button, link and menuitem has an accessible name
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:30.598Z

### [P1] /tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 69 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .px-2.font-normal.uppercase | div:nth-child(3) > .px-2.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:30.599Z

### [P1] /tasks: Interactive controls must not be nested
- id: AXE-NESTED-INTERACTIVE
- observed: 3 element(s): .group.text-left[aria-describedby="DndDescribedBy-1"]:nth-child(1) | .group.text-left[aria-describedby="DndDescribedBy-1"]:nth-child(2) | .group.text-left[aria-describedby="DndDescribedBy-1"]:nth-child(3)
- expected: https://dequeuniversity.com/rules/axe/4.11/nested-interactive?application=playwright — Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T15:30:30.599Z

### [P1] /projects: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 38 element(s): .ml-auto.px-1\.5.rounded-full | div:nth-child(2) > .font-normal.uppercase.tracking-wider | div:nth-child(3) > .font-normal.uppercase.tracking-wider
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T15:30:37.877Z

### [P1] /manuscripts: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 82 element(s): .ml-auto | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/manuscripts
- at: 2026-04-18T15:30:45.088Z

### [P1] /meetings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 37 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .font-normal.uppercase.tracking-wider | div:nth-child(3) > .font-normal.uppercase.tracking-wider
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings
- at: 2026-04-18T15:30:49.294Z

### [P1] /deadlines: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 61 element(s): .ml-auto | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T15:30:53.838Z

### [P1] /ideas: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 127 element(s): .text-xs | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/ideas
- at: 2026-04-18T15:30:59.962Z

### [P1] /decisions: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 83 element(s): .text-xs | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/decisions
- at: 2026-04-18T15:31:04.992Z

### [P1] /grants: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 34 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .uppercase.tracking-wider.py-1 | div:nth-child(3) > .uppercase.tracking-wider.py-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/grants
- at: 2026-04-18T15:31:08.969Z

### [P1] /grants: Interactive controls must not be nested
- id: AXE-NESTED-INTERACTIVE
- observed: 5 element(s): div:nth-child(2) > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\][role="button"] | div:nth-child(3) > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\][role="button"] | div:nth-child(4) > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\][role="button"]
- expected: https://dequeuniversity.com/rules/axe/4.11/nested-interactive?application=playwright — Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies
- url: https://mn-ccore-lab.pages.dev/grants
- at: 2026-04-18T15:31:08.970Z

### [P1] /analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 20 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .uppercase.tracking-wider.py-1 | div:nth-child(3) > .uppercase.tracking-wider.py-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/analytics
- at: 2026-04-18T15:31:13.197Z

### [P1] /pi-analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 23 element(s): .ml-auto | div:nth-child(2) > .py-1.font-normal.px-2 | div:nth-child(3) > .py-1.font-normal.px-2
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/pi-analytics
- at: 2026-04-18T15:31:17.226Z

### [P1] /team: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 4 element(s): .pt-4 > .mt-2 | .mt-2 > span | .mt-8
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T15:31:22.122Z

### [P1] /settings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 51 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .font-normal.uppercase.tracking-wider | div:nth-child(3) > .font-normal.uppercase.tracking-wider
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/settings
- at: 2026-04-18T15:31:26.830Z
