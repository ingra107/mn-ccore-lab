# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 5
Findings: 9 (P0=0, P1=9, P2=0, INFO=0)

## Findings

### [P1] /dashboard: Scrollable region must have keyboard access
- id: AXE-SCROLLABLE-REGION-FOCUSABLE
- observed: 1 element(s): .bento-span-1x2 > .bento-card.h-full > .min-h-0.flex-1 > .flex-col.h-full.flex > .-mx-1.overflow-y-auto.px-1
- expected: https://dequeuniversity.com/rules/axe/4.11/scrollable-region-focusable?application=playwright — Ensure elements that have scrollable content are accessible by keyboard in Safari
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T20:29:23.839Z

### [P1] /my-tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 10 element(s): .flex-wrap.gap-3.flex > .text-\[11px\].py-1.px-2\.5 | .text-\[11px\].py-1.px-2\.5:nth-child(1) > span | .text-\[11px\].py-1.px-2\.5:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T20:29:30.513Z

### [P1] /tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 10 element(s): .flex-wrap.gap-3.flex > .text-\[11px\].py-1.px-2\.5 | .text-\[11px\].py-1.px-2\.5:nth-child(1) > span | .text-\[11px\].py-1.px-2\.5:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T20:29:36.734Z

### [P1] /meetings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 6 element(s): .text-left.w-full.cursor-pointer:nth-child(1) > .justify-between.gap-2.items-center > span:nth-child(1) | .text-left.w-full.cursor-pointer:nth-child(2) > .justify-between.gap-2.items-center > span:nth-child(1) | .text-left.w-full.cursor-pointer:nth-child(3) > .justify-between.gap-2.items-center > sp
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings
- at: 2026-04-18T20:29:55.519Z

### [P1] /deadlines: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 2 element(s): button[aria-label="Export to .ics"] | span:nth-child(2) > span
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T20:30:00.157Z

### [P1] /grants: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 3 element(s): div:nth-child(2) > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].sm\:grid > .min-w-0 > .mt-1.gap-2.flex > .flex-shrink-0.text-\[10px\] | div:nth-child(3) > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].sm\:grid > .min-w-0 > .mt-1.gap-2.flex > .flex-shrink-0.text-\[10px\
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/grants
- at: 2026-04-18T20:30:14.996Z

### [P1] /analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 3 element(s): .gap-3.items-center.flex:nth-child(1) > .h-5.overflow-hidden.flex-1 > .px-2.h-full.transition-all > .font-semibold.text-\[10px\] | .gap-3.items-center.flex:nth-child(2) > .h-5.overflow-hidden.flex-1 > .px-2.h-full.transition-all > .font-semibold.text-\[10px\] | .gap-3.items-center.flex:nth-child(3) 
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/analytics
- at: 2026-04-18T20:30:19.446Z

### [P1] /pi-analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 2 element(s): .gap-3.items-center.flex:nth-child(1) > .h-5.flex-1.overflow-hidden > .px-2.h-full.rounded > .font-semibold.text-\[10px\] | .gap-3.items-center.flex:nth-child(2) > .h-5.flex-1.overflow-hidden > .px-2.h-full.rounded > .font-semibold.text-\[10px\]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/pi-analytics
- at: 2026-04-18T20:30:23.487Z

### [P1] /team: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 2 element(s): .mt-8 | .mt-8 > div
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T20:30:27.906Z
