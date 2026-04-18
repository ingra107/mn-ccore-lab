# Deep Audit — 20260418T21203_14-performance

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 5
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 14-performance (run 20260418T21203_14-performance) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 14.A  Measuring 22 GET endpoints × 5 runs ━━━
  ✓ /api/version                                   p50=  46ms p95=  92ms wire=0kb raw=0kb
  ✓ /api/tasks                                     p50= 106ms p95= 115ms wire=612.4kb raw=612.4kb
  ✓ /api/tasks/overdue-count                       p50=  40ms p95=  45ms wire=0kb raw=0kb
  ✓ /api/projects                                  p50=  52ms p95= 118ms wire=65.7kb raw=65.7kb
  ✓ /api/projects/health                           p50= 118ms p95= 131ms wire=20.3kb raw=20.3kb
  ✓ /api/team                                      p50=  43ms p95=  46ms wire=8.5kb raw=8.5kb
  ✓ /api/meetings                                  p50=  54ms p95=  71ms wire=9.8kb raw=9.8kb
  ✓ /api/publications                              p50=  51ms p95=  66ms wire=42.3kb raw=42.3kb
  ✓ /api/ideas                                     p50=  44ms p95=  59ms wire=14.2kb raw=14.2kb
  ✓ /api/decisions                                 p50=  47ms p95=  62ms wire=12.5kb raw=12.5kb
  ✓ /api/grants                                    p50=  48ms p95=  59ms wire=1.5kb raw=1.5kb
  ✓ /api/activity?limit=50                         p50=  75ms p95= 103ms wire=11.5kb raw=11.5kb
  ✓ /api/notifications?recipient=nick              p50=  54ms p95=  77ms wire=17.6kb raw=17.6kb
  ✓ /api/notifications/count?recipient=nick        p50=  41ms p95=  45ms wire=0kb raw=0kb
  ✓ /api/digest                                    p50=  49ms p95=  58ms wire=47.7kb raw=47.7kb
  ✓ /api/digest/dates                              p50=  45ms p95=  93ms wire=0.4kb raw=0.4kb
  ✓ /api/narratives                                p50=  70ms p95=  79ms wire=44.9kb raw=44.9kb
  ✓ /api/calendar/events                           p50=  65ms p95=  73ms wire=11.7kb raw=11.7kb
  ✓ /api/stats                                     p50=  71ms p95=  88ms wire=0.1kb raw=0.1kb
  ✓ /api/search?q=CLIF                             p50=  87ms p95=  91ms wire=4.4kb raw=4.4kb
  ✓ /api/settings                                  p50=  49ms p95=  60ms wire=0.5kb raw=0.5kb
  ✓ /api/commitments                               p50=  50ms p95=  56ms wire=1.2kb raw=1.2kb

━━━ 14.B  Flag any endpoint with p95 >1500ms ━━━
- [PASS] 14.B All endpoints p95 <1500ms

━━━ 14.C  Flag oversized payloads (wire size preferred, raw fallback) ━━━
- [PASS] 14.C All payloads <1000kb (raw; wire ~5× smaller after CF br)

━━━ 14.D  Measure cold-vs-warm task create (detect connection overhead) ━━━
  14.D task-create cold=283ms warm=318ms
- [PASS] 14.D task create latency acceptable

━━━ 14.E  Large list endpoint (all tasks) with expected size check ━━━
  14.E /api/tasks: 612.4kb, p95=115ms
  14.E 583 tasks, ~1076 bytes/task
- [PASS] 14.E /api/tasks size reasonable for 583 rows

━━━ 14.F  Parallel load test — 10 concurrent /api/version hits ━━━
- [PASS] 14.F 10 concurrent /api/version in 125ms, all 200

──── CLEANUP (2 items) ────