# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 1
Findings: 16 (P0=0, P1=14, P2=2, INFO=0)

## Findings

### [P1] Uncaught page error during persona journey
- id: PAGE-ERROR
- observed: Failed to fetch dynamically imported module: https://mn-ccore-lab.pages.dev/assets/BugReportModal-DurqSviu.js
- expected: no page errors
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:06:09.590Z

### [P1] /my-tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 69 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .px-2.font-normal.uppercase | div:nth-child(3) > .px-2.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T20:06:19.140Z

### [P1] /tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 69 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | div:nth-child(2) > .px-2.font-normal.uppercase | div:nth-child(3) > .px-2.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T20:06:25.754Z

### [P1] /projects: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 38 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.rounded-full | div:nth-child(2) > .font-normal.uppercase.tracking-wider | div:nth-child(3) > .font-normal.uppercase.tracking-wider
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T20:06:33.458Z

### [P1] /manuscripts: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 86 element(s): .ml-auto | div:nth-child(2) > .py-1.font-normal.uppercase | div:nth-child(3) > .py-1.font-normal.uppercase
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/manuscripts
- at: 2026-04-18T20:06:40.942Z

### [P1] /meetings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 13 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | .dark\:hover\:bg-white\/5 > span | .mb-1 > .flex-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings
- at: 2026-04-18T20:06:45.252Z

### [P1] /deadlines: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 41 element(s): .ml-auto.px-1\.5.text-xs | .dark\:hover\:bg-white\/5 > span | .mb-1 > .flex-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T20:06:50.022Z

### [P1] /ideas: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 28 element(s): .text-xs | .dark\:hover\:bg-white\/5 > span | .mb-1 > .flex-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/ideas
- at: 2026-04-18T20:06:55.737Z

### [P1] /decisions: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 6 element(s): .ml-auto | .dark\:hover\:bg-white\/5 > span | .mb-1 > .flex-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/decisions
- at: 2026-04-18T20:07:00.463Z

### [P1] /grants: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 10 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | .dark\:hover\:bg-white\/5 > span | .mb-1 > .flex-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/grants
- at: 2026-04-18T20:07:04.482Z

### [P1] /analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 11 element(s): .ml-auto.px-1\.5.py-0\.5 | .cursor-pointer > span | .gap-2\.5.px-2\.5[href$="search"] > .flex-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/analytics
- at: 2026-04-18T20:07:08.893Z

### [P1] /pi-analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 10 element(s): .ml-auto | .dark\:hover\:bg-white\/5 > span | .gap-2\.5.px-2\.5[href$="search"] > .flex-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/pi-analytics
- at: 2026-04-18T20:07:12.952Z

### [P1] /team: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 4 element(s): .pt-4 > .mt-2 | .mt-2 > span | .mt-8
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T20:07:17.301Z

### [P1] /settings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 19 element(s): .ml-auto | .dark\:hover\:bg-white\/5.gap-2\.5.hover\:bg-black\/5 > span | .gap-2\.5.mb-1[href$="search"] > .flex-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/settings
- at: 2026-04-18T20:07:21.737Z

### [P2] Console error during persona journey
- id: CONSOLE-ERROR
- observed: Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML sp
- expected: no console errors
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:06:09.333Z

### [P2] Console error during persona journey
- id: CONSOLE-ERROR
- observed: Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML sp
- expected: no console errors
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:06:09.350Z
