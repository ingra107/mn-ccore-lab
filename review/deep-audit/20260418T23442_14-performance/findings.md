# Deep Audit — 20260418T23442_14-performance

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 5
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 14-performance (run 20260418T23442_14-performance) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 14.A  Measuring 22 GET endpoints × 5 runs ━━━
  ✓ /api/version                                   p50=  37ms p95=  87ms wire=0kb raw=0kb
  ✓ /api/tasks                                     p50= 101ms p95= 164ms wire=614.4kb raw=614.4kb
  ✓ /api/tasks/overdue-count                       p50=  41ms p95=  42ms wire=0kb raw=0kb
  ✓ /api/projects                                  p50=  50ms p95=  59ms wire=67.1kb raw=67.1kb
  ✓ /api/projects/health                           p50= 115ms p95= 133ms wire=21kb raw=21kb
  ✓ /api/team                                      p50=  48ms p95= 258ms wire=8.5kb raw=8.5kb
  ✓ /api/meetings                                  p50=  45ms p95= 331ms wire=10.9kb raw=10.9kb
  ✓ /api/publications                              p50=  53ms p95=  61ms wire=42.3kb raw=42.3kb
  ✓ /api/ideas                                     p50=  39ms p95=  45ms wire=16.1kb raw=16.1kb
  ✓ /api/decisions                                 p50=  48ms p95=  58ms wire=13.5kb raw=13.5kb
  ✓ /api/grants                                    p50=  43ms p95=  46ms wire=1.5kb raw=1.5kb
  ✓ /api/activity?limit=50                         p50=  64ms p95=  73ms wire=11.6kb raw=11.6kb
  ✓ /api/notifications?recipient=nick              p50=  44ms p95=  47ms wire=17.6kb raw=17.6kb
  ✓ /api/notifications/count?recipient=nick        p50=  43ms p95=  46ms wire=0kb raw=0kb
  ✓ /api/digest                                    p50=  53ms p95= 125ms wire=47.7kb raw=47.7kb
  ✓ /api/digest/dates                              p50=  41ms p95=  44ms wire=0.4kb raw=0.4kb
  ✓ /api/narratives                                p50=  60ms p95=  70ms wire=45.6kb raw=45.6kb
  ✓ /api/calendar/events                           p50=  54ms p95=  64ms wire=14.6kb raw=14.6kb
  ✓ /api/stats                                     p50=  75ms p95=  85ms wire=0.1kb raw=0.1kb
  ✓ /api/search?q=CLIF                             p50=  85ms p95= 103ms wire=4.4kb raw=4.4kb
  ✓ /api/settings                                  p50=  43ms p95=  53ms wire=0.5kb raw=0.5kb
  ✓ /api/commitments                               p50=  48ms p95=  50ms wire=1.2kb raw=1.2kb

━━━ 14.B  Flag any endpoint with p95 >1500ms ━━━
- [PASS] 14.B All endpoints p95 <1500ms

━━━ 14.C  Flag oversized payloads (wire size preferred, raw fallback) ━━━
- [PASS] 14.C All payloads <1000kb (raw; wire ~5× smaller after CF br)

━━━ 14.D  Measure cold-vs-warm task create (detect connection overhead) ━━━
  14.D task-create cold=238ms warm=242ms
- [PASS] 14.D task create latency acceptable

━━━ 14.E  Large list endpoint (all tasks) with expected size check ━━━
  14.E /api/tasks: 614.4kb, p95=164ms
  14.E 586 tasks, ~1074 bytes/task
- [PASS] 14.E /api/tasks size reasonable for 586 rows

━━━ 14.F  Parallel load test — 10 concurrent /api/version hits ━━━
- [PASS] 14.F 10 concurrent /api/version in 149ms, all 200

──── CLEANUP (2 items) ────