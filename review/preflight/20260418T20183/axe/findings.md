# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 3
Findings: 14 (P0=0, P1=12, P2=2, INFO=0)

## Findings

### [P1] Uncaught page error during persona journey
- id: PAGE-ERROR
- observed: Failed to fetch dynamically imported module: https://mn-ccore-lab.pages.dev/assets/BugReportModal-jkv1N7Wf.js
- expected: no page errors
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:18:31.907Z

### [P1] /my-tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 13 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .ml-auto.px-1\.5.py-0\.5 | .dark\:hover\:bg-white\/5 > span | .px-4.text-sm.font-medium
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T20:18:41.429Z

### [P1] /tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 10 element(s): .flex-wrap.gap-3.flex > .text-\[11px\].py-1.px-2\.5 | .text-\[11px\].py-1.px-2\.5:nth-child(1) > span | .text-\[11px\].py-1.px-2\.5:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T20:18:47.786Z

### [P1] /projects: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 2 element(s): .gap-1\.5.py-1\.5.cursor-pointer:nth-child(1) | .filter-pill.py-1[type="button"]:nth-child(1)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T20:18:55.850Z

### [P1] /manuscripts: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 1 element(s): button[title="List"]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/manuscripts
- at: 2026-04-18T20:19:03.337Z

### [P1] /meetings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 8 element(s): .text-left.w-full.cursor-pointer:nth-child(1) > .justify-between.gap-2.items-center > span:nth-child(1) | .text-left.w-full.cursor-pointer:nth-child(2) > .justify-between.gap-2.items-center > span:nth-child(1) | .text-left.w-full.cursor-pointer:nth-child(3) > .justify-between.gap-2.items-center > sp
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings
- at: 2026-04-18T20:19:07.436Z

### [P1] /deadlines: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 2 element(s): button[aria-label="Export to .ics"] | span:nth-child(2) > span
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T20:19:11.888Z

### [P1] /ideas: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 22 element(s): .idea-row.group:nth-child(1) > .sm\:grid.hidden > div:nth-child(1) > span:nth-child(2) | .idea-row.group:nth-child(2) > .sm\:grid.hidden > div:nth-child(1) > span:nth-child(2) | .idea-row.group:nth-child(3) > .sm\:grid.hidden > div:nth-child(1) > span:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/ideas
- at: 2026-04-18T20:19:17.485Z

### [P1] /grants: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 4 element(s): button[title="List"] | div:nth-child(2) > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].sm\:grid > .min-w-0 > .mt-1.gap-2.flex > .flex-shrink-0.text-\[10px\] | div:nth-child(3) > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].sm\:grid > .min-w-0 > .mt-1.gap-2.flex > .fle
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/grants
- at: 2026-04-18T20:19:26.028Z

### [P1] /analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 4 element(s): .py-1.text-\[11px\].font-medium:nth-child(2) | .gap-3.items-center.flex:nth-child(1) > .h-5.overflow-hidden.flex-1 > .px-2.h-full.transition-all > .font-semibold.text-\[10px\] | .gap-3.items-center.flex:nth-child(2) > .h-5.overflow-hidden.flex-1 > .px-2.h-full.transition-all > .font-semibold.text-\[
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/analytics
- at: 2026-04-18T20:19:30.309Z

### [P1] /pi-analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 2 element(s): .gap-3.items-center.flex:nth-child(1) > .h-5.flex-1.overflow-hidden > .px-2.h-full.rounded > .font-semibold.text-\[10px\] | .gap-3.items-center.flex:nth-child(2) > .h-5.flex-1.overflow-hidden > .px-2.h-full.rounded > .font-semibold.text-\[10px\]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/pi-analytics
- at: 2026-04-18T20:19:34.555Z

### [P1] /team: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 2 element(s): .mt-8 | .mt-8 > div
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T20:19:38.855Z

### [P2] Console error during persona journey
- id: CONSOLE-ERROR
- observed: Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML sp
- expected: no console errors
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:18:31.658Z

### [P2] Console error during persona journey
- id: CONSOLE-ERROR
- observed: Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML sp
- expected: no console errors
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:18:31.687Z
