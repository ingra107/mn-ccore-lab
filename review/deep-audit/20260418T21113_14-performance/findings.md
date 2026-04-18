# Deep Audit — 20260418T21113_14-performance

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 4
Bugs: 1 (P0 0, P1 0, P2 1)

## Bugs

- **[PERF-BIG-APITASKS] [P2] 14.C /api/tasks wire payload**
  - Observed: 611.8kb over the wire (raw 611.8kb)
  - Expected: <500kb (consider pagination)

## Full trace


══════ SUITE: 14-performance (run 20260418T21113_14-performance) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 14.A  Measuring 22 GET endpoints × 5 runs ━━━
  ✓ /api/version                                   p50=  37ms p95=  80ms wire=0kb raw=0kb
  ✓ /api/tasks                                     p50= 103ms p95= 136ms wire=611.8kb raw=611.8kb
  ✓ /api/tasks/overdue-count                       p50=  37ms p95=  40ms wire=0kb raw=0kb
  ✓ /api/projects                                  p50=  53ms p95= 164ms wire=65.7kb raw=65.7kb
  ✓ /api/projects/health                           p50= 111ms p95= 123ms wire=20.3kb raw=20.3kb
  ✓ /api/team                                      p50=  40ms p95=  55ms wire=8.5kb raw=8.5kb
  ✓ /api/meetings                                  p50=  43ms p95=  69ms wire=9.5kb raw=9.5kb
  ✓ /api/publications                              p50=  47ms p95=  51ms wire=42.3kb raw=42.3kb
  ✓ /api/ideas                                     p50=  41ms p95=  46ms wire=13.9kb raw=13.9kb
  ✓ /api/decisions                                 p50=  42ms p95=  53ms wire=12.5kb raw=12.5kb
  ✓ /api/grants                                    p50=  43ms p95=  52ms wire=1.5kb raw=1.5kb
  ✓ /api/activity?limit=50                         p50=  72ms p95=  80ms wire=11.5kb raw=11.5kb
  ✓ /api/notifications?recipient=nick              p50=  51ms p95=  83ms wire=17.7kb raw=17.7kb
  ✓ /api/notifications/count?recipient=nick        p50=  44ms p95=  46ms wire=0kb raw=0kb
  ✓ /api/digest                                    p50=  48ms p95=  64ms wire=47.7kb raw=47.7kb
  ✓ /api/digest/dates                              p50=  43ms p95=  44ms wire=0.4kb raw=0.4kb
  ✓ /api/narratives                                p50=  67ms p95=  75ms wire=44.9kb raw=44.9kb
  ✓ /api/calendar/events                           p50=  56ms p95=  60ms wire=11.4kb raw=11.4kb
  ✓ /api/stats                                     p50=  74ms p95=  80ms wire=0.1kb raw=0.1kb
  ✓ /api/search?q=CLIF                             p50=  84ms p95=  88ms wire=4.4kb raw=4.4kb
  ✓ /api/settings                                  p50=  41ms p95=  43ms wire=0.5kb raw=0.5kb
  ✓ /api/commitments                               p50=  47ms p95=  65ms wire=1.2kb raw=1.2kb

━━━ 14.B  Flag any endpoint with p95 >1500ms ━━━
- [PASS] 14.B All endpoints p95 <1500ms

━━━ 14.C  Flag oversized wire payloads (>500kb after CF br/gzip) ━━━
- **[PERF-BIG-APITASKS] [P2] 14.C /api/tasks wire payload**
  - Observed: 611.8kb over the wire (raw 611.8kb)
  - Expected: <500kb (consider pagination)

━━━ 14.D  Measure cold-vs-warm task create (detect connection overhead) ━━━
  14.D task-create cold=253ms warm=234ms
- [PASS] 14.D task create latency acceptable

━━━ 14.E  Large list endpoint (all tasks) with expected size check ━━━
  14.E /api/tasks: 611.8kb, p95=136ms
  14.E 582 tasks, ~1076 bytes/task
- [PASS] 14.E /api/tasks size reasonable for 582 rows

━━━ 14.F  Parallel load test — 10 concurrent /api/version hits ━━━
- [PASS] 14.F 10 concurrent /api/version in 103ms, all 200

──── CLEANUP (2 items) ────