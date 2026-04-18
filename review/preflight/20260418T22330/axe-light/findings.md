# Persona: axe-light (axe-core formal WCAG 2.1 scan (light mode))

Base: https://mn-ccore-lab.pages.dev
Pass count: 2
Findings: 27 (P0=0, P1=27, P2=0, INFO=0)

## Findings

### [P1] /dashboard: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 14 element(s): .text-\[12px\].duration-\[150ms\][href$="dashboard"] > .truncate | .text-\[12px\].duration-\[150ms\][href$="meetings"] > .ml-auto.px-1\.5.py-0\.5 | span:nth-child(6)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/dashboard
- at: 2026-04-18T22:33:14.215Z

### [P1] /my-tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 15 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .truncate | .text-\[13px\] | a[href$="login"]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T22:33:20.698Z

### [P1] /tasks: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 16 element(s): .text-\[12px\].duration-\[150ms\][href$="my-tasks"] > .truncate | a[href$="meetings"] > .ml-auto.px-1\.5.py-0\.5 | .text-\[13px\]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/my-tasks
- at: 2026-04-18T22:33:26.630Z

### [P1] /projects: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 9 element(s): .text-\[12px\].duration-\[150ms\][href$="projects"] > .truncate | .new-project-btn | .col-header:nth-child(3)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/projects
- at: 2026-04-18T22:33:33.987Z

### [P1] /manuscripts: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 14 element(s): a[href$="manuscripts"] > .truncate | a[href$="meetings"] > .ml-auto.px-1\.5.py-0\.5 | .new-project-btn
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/manuscripts
- at: 2026-04-18T22:33:41.284Z

### [P1] /meetings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 21 element(s): a[href$="meetings"] > .truncate | a[href$="meetings"] > .ml-auto.px-1\.5.py-0\.5 | .ml-1\.5
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings
- at: 2026-04-18T22:33:45.499Z

### [P1] /deadlines: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 40 element(s): a[href$="deadlines"] > .truncate | .text-\[13px\].py-1\.5.border:nth-child(1) | .hover\:bg-black\/\[0\.03\]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadlines
- at: 2026-04-18T22:33:50.012Z

### [P1] /ideas: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 37 element(s): a[href$="ideas"] > .truncate | .gap-1.flex.items-center:nth-child(1) > .rounded-full | .gap-1.flex.items-center:nth-child(2) > .rounded-full
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/ideas
- at: 2026-04-18T22:33:57.008Z

### [P1] /decisions: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 73 element(s): .overflow-hidden.flex.items-center > .py-1\.5.px-3:nth-child(1) | .flex-wrap.gap-2.flex > .py-1\.5.px-3:nth-child(1) | .px-2.py-0\.5:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/decisions
- at: 2026-04-18T22:34:02.425Z

### [P1] /grants: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 12 element(s): a[href$="grants"] > .truncate | a[href$="meetings"] > .ml-auto.px-1\.5.py-0\.5 | .py-1\.5.border.rounded-full:nth-child(1)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/grants
- at: 2026-04-18T22:34:06.764Z

### [P1] /analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 13 element(s): a[href$="analytics"] > .truncate | .mt-3.text-\[11px\].gap-2 > span:nth-child(1) | .mt-3.text-\[11px\].gap-2 > span:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/analytics
- at: 2026-04-18T22:34:11.544Z

### [P1] /pi-analytics: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 10 element(s): .grid-cols-1.lg\:grid-cols-2.gap-6:nth-child(3) > div:nth-child(1) > .mb-3.gap-2.items-center > h3 | .grid-cols-1.lg\:grid-cols-2.gap-6:nth-child(3) > div:nth-child(2) > .mb-3.gap-2.items-center > h3 | .p-3.rounded-lg:nth-child(1) > .text-lg.font-semibold
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/pi-analytics
- at: 2026-04-18T22:34:15.938Z

### [P1] /team: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 39 element(s): .whitespace-nowrap.py-2[href$="team"] | .mt-2 > span | .inline-flex.px-2\.5.py-1:nth-child(1)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T22:34:21.564Z

### [P1] /settings: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 21 element(s): a[href$="settings"] > .truncate | .mb-1.gap-2.items-center > .px-1\.5.py-0\.5.text-\[10px\] | .p-4.rounded-lg.border:nth-child(1) > .flex-wrap.gap-1\.5.mb-2 > .px-2\.5.text-\[11px\].py-1:nth-child(1)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/settings
- at: 2026-04-18T22:34:26.281Z

### [P1] /personal: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 15 element(s): a[href$="personal"] > .truncate | div:nth-child(2) > button > span | a[href$="login"]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/personal
- at: 2026-04-18T22:34:34.511Z

### [P1] /calendar: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 28 element(s): a[href$="calendar"] > .truncate | .text-\[13px\].py-1\.5.capitalize:nth-child(1) | .p-1\.5.relative.min-h-\[80px\]:nth-child(10) > .gap-0\.5.mt-0\.5.flex-col > .block[data-discover="true"]:nth-child(1)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/calendar
- at: 2026-04-18T22:34:38.803Z

### [P1] /digest: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 43 element(s): a[href$="digest"] > .truncate | .flex-wrap.gap-2.flex > .py-1\.5.px-3.text-sm:nth-child(1) | .py-1\.5.px-3.text-sm:nth-child(1) > .ml-1\.5
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/digest
- at: 2026-04-18T22:34:43.721Z

### [P1] /ask: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 32 element(s): .text-\[13px\].py-1\.5.rounded-md:nth-child(1) | .rounded-xl.transition-shadow.border:nth-child(1) > .text-left.py-4.items-start > .pt-0\.5.flex-shrink-0.gap-3 > .whitespace-nowrap.py-0\.5.px-2 | .rounded-xl.transition-shadow.border:nth-child(2) > .text-left.py-4.items-start > .pt-0\.5.flex-shrink-0
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/ask
- at: 2026-04-18T22:34:51.789Z

### [P1] /narratives: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 36 element(s): .p-5.rounded-xl:nth-child(1) > .grid.grid-cols-1.md\:grid-cols-2 > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].p-2:nth-child(8) > span:nth-child(3) | .p-5.rounded-xl:nth-child(1) > .grid.grid-cols-1.md\:grid-cols-2 > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].p-2:n
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/narratives
- at: 2026-04-18T22:34:56.033Z

### [P1] /deadline-cascade: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 120 element(s): .table-container:nth-child(1) > div:nth-child(2) > div > div:nth-child(2) > div:nth-child(1) > .group > span:nth-child(6) | .table-container:nth-child(1) > div:nth-child(2) > div > div:nth-child(2) > div:nth-child(2) > .group > span:nth-child(6) | .table-container:nth-child(2) > div:nth-child(2) > d
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadline-cascade
- at: 2026-04-18T22:35:00.851Z

### [P1] /network: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 1 element(s): .gap-1.whitespace-nowrap.py-2
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/network
- at: 2026-04-18T22:35:27.122Z

### [P1] /publications: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 85 element(s): .whitespace-nowrap.py-2[href$="publications"] | h2 | .items-start.rounded-lg.py-2:nth-child(1) > .px-1\.5.py-0\.5.mt-0\.5
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/publications
- at: 2026-04-18T22:35:33.289Z

### [P1] /activity: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 202 element(s): a[href$="meetings"] > .ml-auto.px-1\.5.py-0\.5 | a[href$="activity"] > .truncate | div:nth-child(1) > .border-l-2.flex-col.flex > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].gap-2:nth-child(1) > .capitalize.px-1\.5.py-0\.5
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/activity
- at: 2026-04-18T22:35:40.555Z

### [P1] /projects/mceachron-central-line-days-disparities: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 16 element(s): .text-\[12px\].duration-\[150ms\][href$="projects"] > .truncate | .inline-flex.gap-1.text-\[10px\] | .whitespace-nowrap.text-xs.py-1\.5:nth-child(1)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/projects/mceachron-central-line-days-disparities
- at: 2026-04-18T22:35:44.740Z

### [P1] /meetings/mtg-2026-05-01-9c74588c: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 9 element(s): .text-\[12px\].duration-\[150ms\][href$="meetings"] > .truncate | .ml-auto.px-1\.5.text-\[10px\] | .inline-flex.text-xs.gap-1\.5:nth-child(1)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings/mtg-2026-05-01-9c74588c
- at: 2026-04-18T22:35:48.641Z

### [P1] /team/nate: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 39 element(s): .whitespace-nowrap.py-2[href$="team"] | .mt-2 > span | .inline-flex.px-2\.5.py-1:nth-child(1)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T22:35:53.048Z

### [P1] /team/nate/trajectory: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 39 element(s): .whitespace-nowrap.py-2[href$="team"] | .mt-2 > span | .inline-flex.px-2\.5.py-1:nth-child(1)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/team
- at: 2026-04-18T22:35:57.395Z
