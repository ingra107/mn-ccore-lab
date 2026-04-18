# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 22
Findings: 8 (P0=0, P1=8, P2=0, INFO=0)

## Findings

### [P1] /pulse: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 5 element(s): span | .text-center:nth-child(1) > .mt-2.text-sm | .text-center:nth-child(2) > .mt-2.text-sm
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/pulse
- at: 2026-04-18T22:15:59.941Z

### [P1] /personal: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 10 element(s): .mb-3:nth-child(3) > .mb-1.gap-2.items-center > span | .mb-3:nth-child(3) > .flex-col.flex > .cursor-pointer.rounded-md.gap-2:nth-child(1) > .flex-shrink-0 | .mb-3:nth-child(3) > .flex-col.flex > .cursor-pointer.rounded-md.gap-2:nth-child(2) > .flex-shrink-0
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/personal
- at: 2026-04-18T22:16:04.112Z

### [P1] /narratives: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 26 element(s): a[href$="cci-in-ards"] > span:nth-child(3) | .p-5.rounded-xl:nth-child(1) > .grid.grid-cols-1.md\:grid-cols-2 > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].p-2:nth-child(12) > span:nth-child(3) | a[href$="lpv-adherence-paper"] > span:nth-child(3)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/narratives
- at: 2026-04-18T22:16:24.834Z

### [P1] /deadline-cascade: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 67 element(s): .table-container:nth-child(1) > div:nth-child(2) > div > div:nth-child(2) > div:nth-child(1) > .group > span:nth-child(5) | .table-container:nth-child(1) > div:nth-child(2) > div > div:nth-child(2) > div:nth-child(2) > .group > span:nth-child(5) | .table-container:nth-child(2) > div:nth-child(2) > d
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadline-cascade
- at: 2026-04-18T22:16:29.596Z

### [P1] /publications: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 9 element(s): button[title="2019: 1 publications"] > .text-\[7px\] | button[title="2020: 8 publications"] > .text-\[7px\] | button[title="2021: 12 publications"] > .text-\[7px\]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/publications
- at: 2026-04-18T22:17:01.629Z

### [P1] /projects/mceachron-central-line-days-disparities: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 8 element(s): .justify-between > div:nth-child(1) > span | button[title="Watch for updates"] | .whitespace-nowrap.text-xs.py-1\.5:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/projects/mceachron-central-line-days-disparities
- at: 2026-04-18T22:17:12.827Z

### [P1] /meetings/mtg-2026-05-01-9c74588c: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 2 element(s): button[title="Watch for updates"] | .gap-1.inline-flex.text-xs:nth-child(5)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings/mtg-2026-05-01-9c74588c
- at: 2026-04-18T22:17:16.611Z

### [P1] /meetings/mtg-2026-05-01-9c74588c: Interactive controls must not be nested
- id: AXE-NESTED-INTERACTIVE
- observed: 1 element(s): .action-item-row
- expected: https://dequeuniversity.com/rules/axe/4.11/nested-interactive?application=playwright — Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies
- url: https://mn-ccore-lab.pages.dev/meetings/mtg-2026-05-01-9c74588c
- at: 2026-04-18T22:17:16.611Z
