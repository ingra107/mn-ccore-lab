# Deep Audit — 20260418T21264_14-performance

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 5
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 14-performance (run 20260418T21264_14-performance) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 14.A  Measuring 22 GET endpoints × 5 runs ━━━
  ✓ /api/version                                   p50= 138ms p95= 268ms wire=0kb raw=0kb
  ✓ /api/tasks                                     p50= 121ms p95= 333ms wire=613.1kb raw=613.1kb
  ✓ /api/tasks/overdue-count                       p50=  47ms p95=  56ms wire=0kb raw=0kb
  ✓ /api/projects                                  p50=  64ms p95=  73ms wire=65.7kb raw=65.7kb
  ✓ /api/projects/health                           p50= 116ms p95= 128ms wire=20.3kb raw=20.3kb
  ✓ /api/team                                      p50=  49ms p95=  52ms wire=8.5kb raw=8.5kb
  ✓ /api/meetings                                  p50=  54ms p95=  58ms wire=10.3kb raw=10.3kb
  ✓ /api/publications                              p50=  59ms p95= 116ms wire=42.3kb raw=42.3kb
  ✓ /api/ideas                                     p50=  51ms p95=  54ms wire=14.4kb raw=14.4kb
  ✓ /api/decisions                                 p50=  76ms p95= 102ms wire=12.5kb raw=12.5kb
  ✓ /api/grants                                    p50=  54ms p95=  67ms wire=1.5kb raw=1.5kb
  ✓ /api/activity?limit=50                         p50=  63ms p95=  68ms wire=11.5kb raw=11.5kb
  ✓ /api/notifications?recipient=nick              p50=  51ms p95=  57ms wire=17.6kb raw=17.6kb
  ✓ /api/notifications/count?recipient=nick        p50=  48ms p95= 273ms wire=0kb raw=0kb
  ✓ /api/digest                                    p50=  53ms p95= 110ms wire=47.7kb raw=47.7kb
  ✓ /api/digest/dates                              p50=  40ms p95=  53ms wire=0.4kb raw=0.4kb
  ✓ /api/narratives                                p50=  79ms p95=  96ms wire=44.9kb raw=44.9kb
  ✓ /api/calendar/events                           p50=  63ms p95=  76ms wire=12.1kb raw=12.1kb
  ✓ /api/stats                                     p50=  79ms p95=  85ms wire=0.1kb raw=0.1kb
  ✓ /api/search?q=CLIF                             p50=  86ms p95=  98ms wire=4.4kb raw=4.4kb
  ✓ /api/settings                                  p50=  44ms p95=  52ms wire=0.5kb raw=0.5kb
  ✓ /api/commitments                               p50=  48ms p95=  52ms wire=1.2kb raw=1.2kb

━━━ 14.B  Flag any endpoint with p95 >1500ms ━━━
- [PASS] 14.B All endpoints p95 <1500ms

━━━ 14.C  Flag oversized payloads (wire size preferred, raw fallback) ━━━
- [PASS] 14.C All payloads <1000kb (raw; wire ~5× smaller after CF br)

━━━ 14.D  Measure cold-vs-warm task create (detect connection overhead) ━━━
  14.D task-create cold=240ms warm=244ms
- [PASS] 14.D task create latency acceptable

━━━ 14.E  Large list endpoint (all tasks) with expected size check ━━━
  14.E /api/tasks: 613.1kb, p95=333ms
  14.E 584 tasks, ~1075 bytes/task
- [PASS] 14.E /api/tasks size reasonable for 584 rows

━━━ 14.F  Parallel load test — 10 concurrent /api/version hits ━━━
- [PASS] 14.F 10 concurrent /api/version in 118ms, all 200

──── CLEANUP (2 items) ────