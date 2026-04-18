# Persona: axe (axe-core formal WCAG 2.1 scan)

Base: https://mn-ccore-lab.pages.dev
Pass count: 26
Findings: 3 (P0=0, P1=3, P2=0, INFO=0)

## Findings

### [P1] /pulse: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 5 element(s): span | .text-center:nth-child(1) > .mt-2.text-sm | .text-center:nth-child(2) > .mt-2.text-sm
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/pulse
- at: 2026-04-18T22:20:27.871Z

### [P1] /narratives: Elements must meet minimum color contrast ratio thresholds
- id: AXE-COLOR-CONTRAST
- observed: 11 element(s): .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].p-2:nth-child(33) > span:nth-child(3) | .p-5.rounded-xl:nth-child(2) > .grid.grid-cols-1.md\:grid-cols-2 > .hover\:bg-black\/\[0\.02\].dark\:hover\:bg-white\/\[0\.02\].p-2:nth-child(5) > span:nth-child(3) | .p-5.rounded-xl:nth-child(2) > .
- expected: https://dequeuniversity.com/rules/axe/4.11/color-contrast?application=playwright — Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- url: https://mn-ccore-lab.pages.dev/narratives
- at: 2026-04-18T22:20:52.399Z

### [P1] /meetings/mtg-2026-05-01-9c74588c: Interactive controls must not be nested
- id: AXE-NESTED-INTERACTIVE
- observed: 1 element(s): .action-item-row
- expected: https://dequeuniversity.com/rules/axe/4.11/nested-interactive?application=playwright — Ensure interactive controls are not nested as they are not always announced by screen readers or can cause focus problems for assistive technologies
- url: https://mn-ccore-lab.pages.dev/meetings/mtg-2026-05-01-9c74588c
- at: 2026-04-18T22:21:44.334Z
