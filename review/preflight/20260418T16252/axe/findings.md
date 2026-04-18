# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 0
Findings: 23 (P0=8, P1=15, P2=0, INFO=0)

## Findings

### [P0] /dashboard: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 1 element(s): .gap-2.items-center.flex > button
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T16:25:28.760Z

### [P0] /my-tasks: Certain ARIA roles must contain particular children
- id: AXE-ARIA-REQUIRED-CHILDREN
- observed: 28 element(s): div[aria-rowcount="14"] | div[aria-rowcount="14"] > div[role="rowgroup"] > div[role="presentation"] > div[data-index="0"][role="presentation"] > .task-grid-row.hover\:bg-black\/\[0\.02\][aria-rowindex="2"] | div[aria-rowcount="14"] > div[role="rowgroup"] > div[role="presentation"] > div[data-index="
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-required-children?application=playwright — Ensure elements with an ARIA role that require child roles contain them
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:25:35.936Z

### [P0] /my-tasks: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 70 element(s): div[aria-rowcount="14"] > div[role="rowgroup"] > div[role="presentation"] > div[data-index="0"][role="presentation"] > .task-grid-row.hover\:bg-black\/\[0\.02\][aria-rowindex="2"] > .task-row-meta[role="gridcell"]:nth-child(4) > div > .inline-flex[role="combobox"][aria-haspopup="listbox"] | div[aria
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:25:35.936Z

### [P0] /tasks: Certain ARIA roles must contain particular children
- id: AXE-ARIA-REQUIRED-CHILDREN
- observed: 28 element(s): div[aria-rowcount="14"] | div[aria-rowcount="14"] > div[role="rowgroup"] > div[role="presentation"] > div[data-index="0"][role="presentation"] > .task-grid-row.hover\:bg-black\/\[0\.02\][aria-rowindex="2"] | div[aria-rowcount="14"] > div[role="rowgroup"] > div[role="presentation"] > div[data-index="
- expected: https://dequeuniversity.com/rules/axe/4.11/aria-required-children?application=playwright — Ensure elements with an ARIA role that require child roles contain them
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:25:42.944Z

### [P0] /tasks: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 70 element(s): div[aria-rowcount="14"] > div[role="rowgroup"] > div[role="presentation"] > div[data-index="0"][role="presentation"] > .task-grid-row.hover\:bg-black\/\[0\.02\][aria-rowindex="2"] > .task-row-meta[role="gridcell"]:nth-child(4) > div > .inline-flex[role="combobox"][aria-haspopup="listbox"] | div[aria
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:25:42.945Z

### [P0] /projects: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 1 element(s): .gap-2.flex.items-center:nth-child(2) > button
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T16:25:50.854Z

### [P0] /meetings: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 1 element(s): #portal-main > div > div > .gap-2.items-center.flex > button
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/meetings
- at: 2026-04-18T16:26:02.737Z

### [P0] /deadlines: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 2 element(s): .gap-2.flex.items-center:nth-child(4) > button | #portal-main > div > div > div:nth-child(4) > button:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T16:26:07.513Z

### [P1] /dashboard: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 16 element(s): .text-xs | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T16:25:28.761Z

### [P1] /dashboard: Scrollable region must have keyboard access
- id: AXE-SCROLLABLE-REGION-FOCUSABLE
- observed: 1 element(s): .bento-span-1x2 > .bento-card.h-full > .min-h-0.flex-1 > .flex-col.h-full.flex > .-mx-1.overflow-y-auto.px-1
- expected: https://dequeuniversity.com/rules/axe/4.11/scrollable-region-focusable?application=playwright — Ensure elements that have scrollable content are accessible by keyboard in Safari
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T16:25:28.765Z

### [P1] /my-tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 69 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .px-2.font-normal.uppercase | div:nth-child(3) > .px-2.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:25:35.937Z

### [P1] /tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 69 element(s): .ml-auto | div:nth-child(2) > .px-2.font-normal.uppercase | div:nth-child(3) > .px-2.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T16:25:42.945Z

### [P1] /projects: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 38 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.rounded-full | div:nth-child(2) > .font-normal.uppercase.tracking-wider | div:nth-child(3) > .font-normal.uppercase.tracking-wider
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T16:25:50.854Z

### [P1] /manuscripts: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 82 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/manuscripts
- at: 2026-04-18T16:25:58.481Z

### [P1] /meetings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 37 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .font-normal.uppercase.tracking-wider | div:nth-child(3) > .font-normal.uppercase.tracking-wider
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings
- at: 2026-04-18T16:26:02.738Z

### [P1] /deadlines: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 63 element(s): .ml-auto.px-1\.5.text-xs | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T16:26:07.513Z

### [P1] /ideas: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 127 element(s): .text-xs | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/ideas
- at: 2026-04-18T16:26:13.443Z

### [P1] /decisions: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 83 element(s): .ml-auto | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/decisions
- at: 2026-04-18T16:26:18.220Z

### [P1] /grants: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 34 element(s): .ml-auto | div:nth-child(2) > .uppercase.tracking-wider.py-1 | div:nth-child(3) > .uppercase.tracking-wider.py-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/grants
- at: 2026-04-18T16:26:22.239Z

### [P1] /analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 20 element(s): .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .uppercase.tracking-wider.py-1 | div:nth-child(3) > .uppercase.tracking-wider.py-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/analytics
- at: 2026-04-18T16:26:26.554Z

### [P1] /pi-analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 23 element(s): .ml-auto | div:nth-child(2) > .py-1.font-normal.px-2 | div:nth-child(3) > .py-1.font-normal.px-2
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/pi-analytics
- at: 2026-04-18T16:26:30.657Z

### [P1] /team: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 4 element(s): .pt-4 > .mt-2 | .mt-2 > span | .mt-8
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T16:26:35.032Z

### [P1] /settings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 51 element(s): .ml-auto | div:nth-child(2) > .font-normal.uppercase.tracking-wider | div:nth-child(3) > .font-normal.uppercase.tracking-wider
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/settings
- at: 2026-04-18T16:26:39.736Z
