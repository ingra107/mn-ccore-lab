# Deep Audit — 20260418T12533_14-performance

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 4
Bugs: 1 (P0 0, P1 0, P2 1)

## Bugs

- **[PERF-BIG-APITASKS] [P2] 14.C /api/tasks payload**
  - Observed: 605.8kb
  - Expected: <500kb (consider pagination)

## Full trace


══════ SUITE: 14-performance (run 20260418T12533_14-performance) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 14.A  Measuring 22 GET endpoints × 5 runs ━━━
  ✓ /api/version                                   p50=  36ms p95= 118ms size=0kb
  ✓ /api/tasks                                     p50= 106ms p95= 297ms size=605.8kb
  ✓ /api/tasks/overdue-count                       p50=  37ms p95=  42ms size=0kb
  ✓ /api/projects                                  p50=  45ms p95=  53ms size=65kb
  ✓ /api/projects/health                           p50= 101ms p95= 103ms size=20.1kb
  ✓ /api/team                                      p50=  39ms p95=  42ms size=8.5kb
  ✓ /api/meetings                                  p50=  41ms p95=  44ms size=9kb
  ✓ /api/publications                              p50=  38ms p95=  41ms size=42.3kb
  ✓ /api/ideas                                     p50=  37ms p95=  41ms size=9.6kb
  ✓ /api/decisions                                 p50=  38ms p95=  42ms size=9.2kb
  ✓ /api/grants                                    p50=  37ms p95=  40ms size=1.5kb
  ✓ /api/activity?limit=50                         p50=  58ms p95=  64ms size=11.6kb
  ✓ /api/notifications?recipient=nick              p50=  43ms p95=  58ms size=17kb
  ✓ /api/notifications/count?recipient=nick        p50=  34ms p95=  40ms size=0kb
  ✓ /api/digest                                    p50=  42ms p95=  94ms size=47.7kb
  ✓ /api/digest/dates                              p50=  37ms p95=  39ms size=0.4kb
  ✓ /api/narratives                                p50=  55ms p95=  60ms size=44.6kb
  ✓ /api/calendar/events                           p50=  47ms p95=  52ms size=5.7kb
  ✓ /api/stats                                     p50=  56ms p95=  66ms size=0.1kb
  ✓ /api/search?q=CLIF                             p50=  68ms p95=  94ms size=4.4kb
  ✓ /api/settings                                  p50=  38ms p95=  40ms size=0.5kb
  ✓ /api/commitments                               p50=  38ms p95=  40ms size=1.2kb

━━━ 14.B  Flag any endpoint with p95 >1500ms ━━━
- [PASS] 14.B All endpoints p95 <1500ms

━━━ 14.C  Flag oversized payloads (>500kb) ━━━
- **[PERF-BIG-APITASKS] [P2] 14.C /api/tasks payload**
  - Observed: 605.8kb
  - Expected: <500kb (consider pagination)

━━━ 14.D  Measure cold-vs-warm task create (detect connection overhead) ━━━
  14.D task-create cold=242ms warm=232ms
- [PASS] 14.D task create latency acceptable

━━━ 14.E  Large list endpoint (all tasks) with expected size check ━━━
  14.E /api/tasks: 605.8kb, p95=297ms
  14.E 574 tasks, ~1081 bytes/task
- [PASS] 14.E /api/tasks size reasonable for 574 rows

━━━ 14.F  Parallel load test — 10 concurrent /api/version hits ━━━
- [PASS] 14.F 10 concurrent /api/version in 88ms, all 200

──── CLEANUP (2 items) ────