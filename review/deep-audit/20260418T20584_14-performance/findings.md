# Deep Audit — 20260418T20584_14-performance

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 4
Bugs: 1 (P0 0, P1 0, P2 1)

## Bugs

- **[PERF-BIG-APITASKS] [P2] 14.C /api/tasks payload**
  - Observed: 611.1kb
  - Expected: <500kb (consider pagination)

## Full trace


══════ SUITE: 14-performance (run 20260418T20584_14-performance) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 14.A  Measuring 22 GET endpoints × 5 runs ━━━
  ✓ /api/version                                   p50=  39ms p95= 103ms size=0kb
  ✓ /api/tasks                                     p50= 104ms p95= 121ms size=611.1kb
  ✓ /api/tasks/overdue-count                       p50=  41ms p95=  43ms size=0kb
  ✓ /api/projects                                  p50=  51ms p95= 172ms size=65.7kb
  ✓ /api/projects/health                           p50=  99ms p95= 126ms size=20.3kb
  ✓ /api/team                                      p50=  45ms p95=  55ms size=8.5kb
  ✓ /api/meetings                                  p50=  43ms p95=  48ms size=9.2kb
  ✓ /api/publications                              p50=  49ms p95=  51ms size=42.3kb
  ✓ /api/ideas                                     p50=  49ms p95=  55ms size=13.6kb
  ✓ /api/decisions                                 p50=  47ms p95=  76ms size=12.5kb
  ✓ /api/grants                                    p50=  48ms p95=  53ms size=1.5kb
  ✓ /api/activity?limit=50                         p50=  64ms p95=  88ms size=11.6kb
  ✓ /api/notifications?recipient=nick              p50=  51ms p95=  59ms size=17kb
  ✓ /api/notifications/count?recipient=nick        p50=  40ms p95=  43ms size=0kb
  ✓ /api/digest                                    p50=  55ms p95=  61ms size=47.7kb
  ✓ /api/digest/dates                              p50=  44ms p95=  52ms size=0.4kb
  ✓ /api/narratives                                p50= 100ms p95= 140ms size=44.9kb
  ✓ /api/calendar/events                           p50=  58ms p95=  66ms size=11.1kb
  ✓ /api/stats                                     p50=  66ms p95=  74ms size=0.1kb
  ✓ /api/search?q=CLIF                             p50= 129ms p95= 163ms size=4.4kb
  ✓ /api/settings                                  p50=  43ms p95=  47ms size=0.5kb
  ✓ /api/commitments                               p50=  40ms p95=  47ms size=1.2kb

━━━ 14.B  Flag any endpoint with p95 >1500ms ━━━
- [PASS] 14.B All endpoints p95 <1500ms

━━━ 14.C  Flag oversized payloads (>500kb) ━━━
- **[PERF-BIG-APITASKS] [P2] 14.C /api/tasks payload**
  - Observed: 611.1kb
  - Expected: <500kb (consider pagination)

━━━ 14.D  Measure cold-vs-warm task create (detect connection overhead) ━━━
  14.D task-create cold=232ms warm=253ms
- [PASS] 14.D task create latency acceptable

━━━ 14.E  Large list endpoint (all tasks) with expected size check ━━━
  14.E /api/tasks: 611.1kb, p95=121ms
  14.E 581 tasks, ~1077 bytes/task
- [PASS] 14.E /api/tasks size reasonable for 581 rows

━━━ 14.F  Parallel load test — 10 concurrent /api/version hits ━━━
- [PASS] 14.F 10 concurrent /api/version in 100ms, all 200

──── CLEANUP (2 items) ────