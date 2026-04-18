# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 10
Findings: 7 (P0=0, P1=5, P2=2, INFO=0)

## Findings

### [P1] Uncaught page error during persona journey
- id: PAGE-ERROR
- observed: Failed to fetch dynamically imported module: https://mn-ccore-lab.pages.dev/assets/BugReportModal-DAd8dCzu.js
- expected: no page errors
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:35:20.019Z

### [P1] /my-tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 10 element(s): .flex-wrap.gap-3.flex > .text-\[11px\].py-1.px-2\.5 | .text-\[11px\].py-1.px-2\.5:nth-child(1) > span | .text-\[11px\].py-1.px-2\.5:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T20:35:29.504Z

### [P1] /meetings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 6 element(s): .text-left.w-full.cursor-pointer:nth-child(1) > .justify-between.gap-2.items-center > span:nth-child(1) | .text-left.w-full.cursor-pointer:nth-child(2) > .justify-between.gap-2.items-center > span:nth-child(1) | .text-left.w-full.cursor-pointer:nth-child(3) > .justify-between.gap-2.items-center > sp
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings
- at: 2026-04-18T20:35:54.790Z

### [P1] /deadlines: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 1 element(s): button[aria-label="Export to .ics"]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T20:35:59.459Z

### [P1] /team: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 2 element(s): .mt-8 | .mt-8 > div
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T20:36:26.463Z

### [P2] Console error during persona journey
- id: CONSOLE-ERROR
- observed: Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML sp
- expected: no console errors
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:35:19.771Z

### [P2] Console error during persona journey
- id: CONSOLE-ERROR
- observed: Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML sp
- expected: no console errors
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:35:19.793Z
