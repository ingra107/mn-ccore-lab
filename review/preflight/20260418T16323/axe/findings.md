# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 0
Findings: 21 (P0=4, P1=17, P2=0, INFO=0)

## Findings

### [P0] /my-tasks: Elements must only use supported ARIA attributes
- id: AXE-ARIA-ALLOWED-ATTR
- observed: 23 element(s): div:nth-child(1) > .table-container[aria-label="Tasks"] > div:nth-child(4) > div > div[data-index="0"] > .task-grid-row.hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\] | div:nth-child(1) > .table-container[aria-label="Tasks"] > div:nth-child(4) > div > div[data-index="1"] > .task-grid-ro
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-allowed-attr?application=playwright — Ensure an element's role supports its ARIA attributes
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:32:45.638Z

### [P0] /my-tasks: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 69 element(s): div:nth-child(1) > .table-container[aria-label="Tasks"] > div:nth-child(4) > div > div[data-index="0"] > .task-grid-row.hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\] > .task-row-meta:nth-child(4) > div > .inline-flex[role="combobox"][aria-haspopup="listbox"] | div:nth-child(1) > .table
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:32:45.639Z

### [P0] /tasks: Elements must only use supported ARIA attributes
- id: AXE-ARIA-ALLOWED-ATTR
- observed: 23 element(s): div:nth-child(1) > .table-container[aria-label="Tasks"] > div:nth-child(4) > div > div[data-index="0"] > .task-grid-row.hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\] | div:nth-child(1) > .table-container[aria-label="Tasks"] > div:nth-child(4) > div > div[data-index="1"] > .task-grid-ro
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-allowed-attr?application=playwright — Ensure an element's role supports its ARIA attributes
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:32:51.643Z

### [P0] /tasks: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 69 element(s): div:nth-child(1) > .table-container[aria-label="Tasks"] > div:nth-child(4) > div > div[data-index="0"] > .task-grid-row.hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\] > .task-row-meta:nth-child(4) > div > .inline-flex[role="combobox"][aria-haspopup="listbox"] | div:nth-child(1) > .table
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:32:51.643Z

### [P1] /dashboard: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 16 element(s): .text-xs | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T16:32:39.142Z

### [P1] /dashboard: Scrollable region must have keyboard access
- id: AXE-SCROLLABLE-REGION-FOCUSABLE
- observed: 1 element(s): .bento-span-1x2 > .bento-card.h-full > .min-h-0.flex-1 > .flex-col.h-full.flex > .-mx-1.overflow-y-auto.px-1
- expected: https://dequeuniversity.com/rules/axe/4.11/scrollable-region-focusable?application=playwright — Ensure elements that have scrollable content are accessible by keyboard in Safari
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T16:32:39.142Z

### [P1] /my-tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 69 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .px-2.font-normal.uppercase | div:nth-child(3) > .px-2.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:32:45.640Z

### [P1] /my-tasks: Interactive controls must not be nested
- id: AXE-NESTED-INTERACTIVE
- observed: 30 element(s): div:nth-child(1) > .table-container[aria-label="Tasks"] > .task-grid-header > div[aria-describedby="column-reorder"][aria-roledescription="sortable"][role="button"]:nth-child(2) | div:nth-child(1) > .table-container[aria-label="Tasks"] > .task-grid-header > div[aria-describedby="column-reorder"][ari
- expected: https://dequeuniversity.com/rules/axe/4.11/nested-interactive?application=playwright — Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:32:45.640Z

### [P1] /tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 69 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .px-2.font-normal.uppercase | div:nth-child(3) > .px-2.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:32:51.644Z

### [P1] /tasks: Interactive controls must not be nested
- id: AXE-NESTED-INTERACTIVE
- observed: 30 element(s): div:nth-child(1) > .table-container[aria-label="Tasks"] > .task-grid-header > div[aria-describedby="column-reorder"][aria-roledescription="sortable"][role="button"]:nth-child(2) | div:nth-child(1) > .table-container[aria-label="Tasks"] > .task-grid-header > div[aria-describedby="column-reorder"][ari
- expected: https://dequeuniversity.com/rules/axe/4.11/nested-interactive?application=playwright — Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:32:51.644Z

### [P1] /projects: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 38 element(s): .ml-auto.px-1\.5.rounded-full | div:nth-child(2) > .font-normal.uppercase.tracking-wider | div:nth-child(3) > .font-normal.uppercase.tracking-wider
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T16:32:58.910Z

### [P1] /manuscripts: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 82 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/manuscripts
- at: 2026-04-18T16:33:06.320Z

### [P1] /meetings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 37 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .font-normal.uppercase.tracking-wider | div:nth-child(3) > .font-normal.uppercase.tracking-wider
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings
- at: 2026-04-18T16:33:10.452Z

### [P1] /deadlines: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 63 element(s): .ml-auto | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T16:33:15.061Z

### [P1] /ideas: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 127 element(s): .text-xs | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/ideas
- at: 2026-04-18T16:33:20.758Z

### [P1] /decisions: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 83 element(s): .ml-auto | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/decisions
- at: 2026-04-18T16:33:25.504Z

### [P1] /grants: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 34 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .uppercase.tracking-wider.py-1 | div:nth-child(3) > .uppercase.tracking-wider.py-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/grants
- at: 2026-04-18T16:33:29.419Z

### [P1] /analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 20 element(s): .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .uppercase.tracking-wider.py-1 | div:nth-child(3) > .uppercase.tracking-wider.py-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/analytics
- at: 2026-04-18T16:33:33.802Z

### [P1] /pi-analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 23 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .py-1.font-normal.px-2 | div:nth-child(3) > .py-1.font-normal.px-2
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/pi-analytics
- at: 2026-04-18T16:33:37.811Z

### [P1] /team: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 4 element(s): .pt-4 > .mt-2 | .mt-2 > span | .mt-8
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T16:33:42.045Z

### [P1] /settings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 51 element(s): .ml-auto | div:nth-child(2) > .font-normal.uppercase.tracking-wider | div:nth-child(3) > .font-normal.uppercase.tracking-wider
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/settings
- at: 2026-04-18T16:33:46.332Z
