Refine this insights dashboard for the MN-CCORE Lab Hub. Apply these specific changes:

**1. Force the exact palette. Drop Material 3 tokens.**
- Page bg: `#0b1017` (deep neutral, NOT Material's `#171c23` or `#0d1117`)
- Card surface: `rgba(255,255,255,0.06)` over the page bg
- Primary accent (interactive, ONE per view): TEAL `#5cbcb4` exact hex
- Warning: GOLD `#dcb355`
- Critical / outlier: MAROON `#f0737e`
- Success: GREEN `#6ee89a`
- Text primary: `#e2e8f0` (softened white, NOT pure white)
- Text muted: `rgba(226,232,240,0.7)`
- DO NOT use Material 3 token names like `surface-container`, `on-surface`, `inverse-primary`, `tertiary-fixed`, etc. Use the exact hex values above.

**2. Force DM Sans. If you would normally use Inter, use DM Sans instead.**
- All body, labels, headings: DM Sans
- Numbers in metric cards: DM Sans 700 weight (`tabular-nums`)
- JetBrains Mono ONLY for keyboard-shortcut keys (none on this page)

**3. Pin the pipeline funnel to OUR 7 stages.**
The funnel section must show these exact stages in order, with project counts:
- Idea
- Data Collection
- Data Analysis
- Writing
- Review
- Submitted
- Published

Use these exact stage colors as the bar fills (theme-stable hex):
- Idea: `#4b5563`
- Data Collection: `#0d6f68` (teal solid)
- Data Analysis: `#6b5420` (gold dark)
- Writing: `#a23d08` (orange dark)
- Review: `#8a1f2e` (maroon dark)
- Submitted: `#0d6f68` (teal solid)
- Published: `#066e2f` (green dark)

White text on top of these fills must be `#ffffff` (passes AA on all of them).

**4. Replace the 4 hero "This Week's Insights" cards with 4 concrete metrics.**
Hub team is 19 members. Specific cards:
- **Stalled projects (14d+)** — count + delta vs last week + sparkline of past 8 weeks
- **Open tasks per person** — average across 19 team members + heatmap mini showing distribution
- **Manuscripts in revision** — count + how many awaiting reviewer response >7d (in maroon)
- **Grant applications in pipeline** — count + days to next deadline (in gold if <14d)

Each card uses ONE accent color max, large 700-weight number top-left, sparkline bottom-right.

**5. Improve the workload heatmap.**
- Show a clear legend below: low (1-3 tasks) / med (4-8) / high (9+) — three discrete bins, not continuous gradient
- Y-axis: 19 actual team member rows (use placeholder names like "M. Bromley", "S. Chen", "K. Brunelle")
- X-axis: 5 weekdays (Mon Tue Wed Thu Fri)
- Color scale: empty cell = `rgba(255,255,255,0.03)`, low = `#0d6f68` 30%, med = `#0d6f68` 60%, high = `#0d6f68` 100%

**6. Keep the project velocity scatter and stalled-projects table mostly as-is** — both are good. Just:
- Scatter outliers (>30 days since update OR >10 open tasks) should use MAROON `#f0737e` not the current orange-ish.
- Stalled table should have an inline "+ Set follow-up task" action button per row (teal outline, hover state) rather than the current generic "View Details" link.

**7. NEVER use the following anywhere on this page:**
- glassmorphism / backdrop-filter blur
- gradients (use solid colors only)
- pure black `#000`
- purple
- italics for body content
- centered editorial heroes
- generic Sparkles icon for AI (use a HermesMark-style avatar — circle with small wing/crown if you must, but NOT Sparkles)

**8. Mood:** quiet, considered, operational. This is a research operations dashboard — Linear-adjacent, NOT a marketing landing page. Density is good. White space between sections is good. Decoration is bad.
