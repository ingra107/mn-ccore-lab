# Deep Audit — 20260418T23084_14-performance

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 5
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 14-performance (run 20260418T23084_14-performance) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 14.A  Measuring 22 GET endpoints × 5 runs ━━━
  ✓ /api/version                                   p50=  48ms p95=  83ms wire=0kb raw=0kb
  ✓ /api/tasks                                     p50= 100ms p95= 116ms wire=613.7kb raw=613.7kb
  ✓ /api/tasks/overdue-count                       p50=  40ms p95=  40ms wire=0kb raw=0kb
  ✓ /api/projects                                  p50=  56ms p95=  59ms wire=67.1kb raw=67.1kb
  ✓ /api/projects/health                           p50= 119ms p95= 121ms wire=21kb raw=21kb
  ✓ /api/team                                      p50=  45ms p95=  54ms wire=8.5kb raw=8.5kb
  ✓ /api/meetings                                  p50=  46ms p95=  48ms wire=10.6kb raw=10.6kb
  ✓ /api/publications                              p50=  49ms p95=  55ms wire=42.3kb raw=42.3kb
  ✓ /api/ideas                                     p50=  46ms p95=  67ms wire=15.8kb raw=15.8kb
  ✓ /api/decisions                                 p50=  50ms p95=  63ms wire=13.5kb raw=13.5kb
  ✓ /api/grants                                    p50=  56ms p95=  83ms wire=1.5kb raw=1.5kb
  ✓ /api/activity?limit=50                         p50=  75ms p95= 100ms wire=11.6kb raw=11.6kb
  ✓ /api/notifications?recipient=nick              p50=  66ms p95= 316ms wire=17.6kb raw=17.6kb
  ✓ /api/notifications/count?recipient=nick        p50=  41ms p95=  43ms wire=0kb raw=0kb
  ✓ /api/digest                                    p50=  48ms p95= 111ms wire=47.7kb raw=47.7kb
  ✓ /api/digest/dates                              p50=  43ms p95=  44ms wire=0.4kb raw=0.4kb
  ✓ /api/narratives                                p50=  59ms p95=  64ms wire=45.6kb raw=45.6kb
  ✓ /api/calendar/events                           p50=  55ms p95= 349ms wire=14.3kb raw=14.3kb
  ✓ /api/stats                                     p50=  67ms p95=  74ms wire=0.1kb raw=0.1kb
  ✓ /api/search?q=CLIF                             p50=  70ms p95=  97ms wire=4.4kb raw=4.4kb
  ✓ /api/settings                                  p50=  38ms p95=  43ms wire=0.5kb raw=0.5kb
  ✓ /api/commitments                               p50=  43ms p95=  49ms wire=1.2kb raw=1.2kb

━━━ 14.B  Flag any endpoint with p95 >1500ms ━━━
- [PASS] 14.B All endpoints p95 <1500ms

━━━ 14.C  Flag oversized payloads (wire size preferred, raw fallback) ━━━
- [PASS] 14.C All payloads <1000kb (raw; wire ~5× smaller after CF br)

━━━ 14.D  Measure cold-vs-warm task create (detect connection overhead) ━━━
  14.D task-create cold=238ms warm=249ms
- [PASS] 14.D task create latency acceptable

━━━ 14.E  Large list endpoint (all tasks) with expected size check ━━━
  14.E /api/tasks: 613.7kb, p95=116ms
  14.E 585 tasks, ~1074 bytes/task
- [PASS] 14.E /api/tasks size reasonable for 585 rows

━━━ 14.F  Parallel load test — 10 concurrent /api/version hits ━━━
- [PASS] 14.F 10 concurrent /api/version in 110ms, all 200

──── CLEANUP (2 items) ────