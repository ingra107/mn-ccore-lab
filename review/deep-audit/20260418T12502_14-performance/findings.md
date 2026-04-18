# Deep Audit — 20260418T12502_14-performance

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 3
Bugs: 2 (P0 0, P1 0, P2 2)

## Bugs

- **[PERF-SLOW-APIPROJECTSHEALTH] [P2] 14.B /api/projects/health slow**
  - Observed: p95=8818ms, size=20.2kb
  - Expected: <1500ms p95
- **[PERF-BIG-APITASKS] [P2] 14.C /api/tasks payload**
  - Observed: 605.8kb
  - Expected: <500kb (consider pagination)

## Full trace


══════ SUITE: 14-performance (run 20260418T12502_14-performance) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 14.A  Measuring 22 GET endpoints × 5 runs ━━━
  ✓ /api/version                                   p50=  39ms p95=  78ms size=0kb
  ✓ /api/tasks                                     p50= 115ms p95= 118ms size=605.8kb
  ✓ /api/tasks/overdue-count                       p50=  35ms p95=  39ms size=0kb
  ✓ /api/projects                                  p50=  51ms p95=  55ms size=65kb
  ⚠ SLOW /api/projects/health                           p50=8329ms p95=8818ms size=20.2kb
  ✓ /api/team                                      p50=  40ms p95=  55ms size=8.5kb
  ✓ /api/meetings                                  p50=  44ms p95=  79ms size=9kb
  ✓ /api/publications                              p50=  43ms p95=  51ms size=42.3kb
  ✓ /api/ideas                                     p50=  39ms p95=  42ms size=9.6kb
  ✓ /api/decisions                                 p50=  37ms p95=  40ms size=9.2kb
  ✓ /api/grants                                    p50=  38ms p95=  41ms size=1.5kb
  ✓ /api/activity?limit=50                         p50=  72ms p95= 159ms size=11.8kb
  ✓ /api/notifications?recipient=nick              p50=  39ms p95=  45ms size=17kb
  ✓ /api/notifications/count?recipient=nick        p50=  35ms p95=  37ms size=0kb
  ✓ /api/digest                                    p50=  47ms p95=  50ms size=47.7kb
  ✓ /api/digest/dates                              p50=  46ms p95=  72ms size=0.4kb
  ✓ /api/narratives                                p50=  64ms p95= 143ms size=44.6kb
  ✓ /api/calendar/events                           p50=  50ms p95=  58ms size=5.7kb
  ✓ /api/stats                                     p50=  65ms p95=  70ms size=0.1kb
  ✓ /api/search?q=CLIF                             p50=  88ms p95= 118ms size=4.4kb
  ✓ /api/settings                                  p50=  48ms p95= 117ms size=0.5kb
  ✓ /api/commitments                               p50=  69ms p95=  85ms size=1.2kb

━━━ 14.B  Flag any endpoint with p95 >1500ms ━━━
- **[PERF-SLOW-APIPROJECTSHEALTH] [P2] 14.B /api/projects/health slow**
  - Observed: p95=8818ms, size=20.2kb
  - Expected: <1500ms p95

━━━ 14.C  Flag oversized payloads (>500kb) ━━━
- **[PERF-BIG-APITASKS] [P2] 14.C /api/tasks payload**
  - Observed: 605.8kb
  - Expected: <500kb (consider pagination)

━━━ 14.D  Measure cold-vs-warm task create (detect connection overhead) ━━━
  14.D task-create cold=288ms warm=230ms
- [PASS] 14.D task create latency acceptable

━━━ 14.E  Large list endpoint (all tasks) with expected size check ━━━
  14.E /api/tasks: 605.8kb, p95=118ms
  14.E 574 tasks, ~1081 bytes/task
- [PASS] 14.E /api/tasks size reasonable for 574 rows

━━━ 14.F  Parallel load test — 10 concurrent /api/version hits ━━━
- [PASS] 14.F 10 concurrent /api/version in 257ms, all 200

──── CLEANUP (2 items) ────