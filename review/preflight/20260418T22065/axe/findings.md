# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 19
Findings: 14 (P0=3, P1=11, P2=0, INFO=0)

## Findings

### [P0] /pulse: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 6 element(s): button:nth-child(1) | button:nth-child(2) | button:nth-child(3)
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/pulse
- at: 2026-04-18T22:08:08.986Z

### [P0] /activity: Select element must have an accessible name
- id: AXE-SELECT-NAME
- observed: 2 element(s): select:nth-child(1) | select:nth-child(2)
- expected: https://dequeuniversity.com/rules/axe/4.11/select-name?application=playwright — Ensure select element has an accessible name
- url: https://mn-ccore-lab.pages.dev/activity
- at: 2026-04-18T22:09:16.246Z

### [P0] /meetings/mtg-2026-05-01-9c74588c: Buttons must have discernible text
- id: AXE-BUTTON-NAME
- observed: 1 element(s): .cursor-grab
- expected: https://dequeuniversity.com/rules/axe/4.11/button-name?application=playwright — Ensure buttons have discernible text
- url: https://mn-ccore-lab.pages.dev/meetings/mtg-2026-05-01-9c74588c
- at: 2026-04-18T22:09:24.112Z

### [P1] /pulse: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 5 element(s): span | .text-center:nth-child(1) > .mt-2.text-sm | .text-center:nth-child(2) > .mt-2.text-sm
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/pulse
- at: 2026-04-18T22:08:08.987Z

### [P1] /personal: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 12 element(s): .mb-3:nth-child(3) > .mb-1.gap-2.items-center > span | .mb-3:nth-child(3) > .flex-col.flex > .cursor-pointer.rounded-md.gap-2:nth-child(1) > .flex-shrink-0 | .mb-3:nth-child(3) > .flex-col.flex > .cursor-pointer.rounded-md.gap-2:nth-child(2) > .flex-shrink-0
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/personal
- at: 2026-04-18T22:08:13.022Z

### [P1] /digest: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 1 element(s): .py-1\.5.px-3.text-sm:nth-child(2) > .ml-1
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/digest
- at: 2026-04-18T22:08:21.653Z

### [P1] /search: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 1 element(s): #portal-main > div > div > div:nth-child(3)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/search
- at: 2026-04-18T22:08:25.307Z

### [P1] /narratives: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 26 element(s): a[href$="cci-in-ards"] > span:nth-child(3) | .p-5.rounded-xl:nth-child(1) > .grid.grid-cols-1.md\:grid-cols-2 > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].p-2:nth-child(12) > span:nth-child(3) | a[href$="lpv-adherence-paper"] > span:nth-child(3)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/narratives
- at: 2026-04-18T22:08:33.983Z

### [P1] /deadline-cascade: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 67 element(s): .table-container:nth-child(1) > div:nth-child(2) > div > div:nth-child(2) > div:nth-child(1) > .group > span:nth-child(5) | .table-container:nth-child(1) > div:nth-child(2) > div > div:nth-child(2) > div:nth-child(2) > .group > span:nth-child(5) | .table-container:nth-child(2) > div:nth-child(2) > d
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/deadline-cascade
- at: 2026-04-18T22:08:38.746Z

### [P1] Navigate to /network
- id: NAV-FAIL
- observed: page.goto: Timeout 20000ms exceeded.
Call log:
[2m  - navigating to "https://mn-ccore-lab.pages.dev/network", waiting until "networkidle"[22m

- expected: page loads within timeout
- url: https://mn-ccore-lab.pages.dev/network
- at: 2026-04-18T22:08:58.767Z

### [P1] /publications: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 10 element(s): button[title="2019: 1 publications"] > .text-\[7px\] | button[title="2020: 8 publications"] > .text-\[7px\] | button[title="2021: 12 publications"] > .text-\[7px\]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/publications
- at: 2026-04-18T22:09:08.848Z

### [P1] /projects/mceachron-central-line-days-disparities: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 9 element(s): .hover\:\!opacity-100 | .justify-between > div:nth-child(1) > span | button[title="Watch for updates"]
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/projects/mceachron-central-line-days-disparities
- at: 2026-04-18T22:09:20.298Z

### [P1] /meetings/mtg-2026-05-01-9c74588c: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 3 element(s): .hover\:\!opacity-100 | button[title="Watch for updates"] | .gap-1.inline-flex.text-xs:nth-child(5)
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/meetings/mtg-2026-05-01-9c74588c
- at: 2026-04-18T22:09:24.112Z

### [P1] /meetings/mtg-2026-05-01-9c74588c: Interactive controls must not be nested
- id: AXE-NESTED-INTERACTIVE
- observed: 2 element(s): .group\/action | .action-item-row
- expected: https://dequeuniversity.com/rules/axe/4.11/nested-interactive?application=playwright — Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies
- url: https://mn-ccore-lab.pages.dev/meetings/mtg-2026-05-01-9c74588c
- at: 2026-04-18T22:09:24.113Z
