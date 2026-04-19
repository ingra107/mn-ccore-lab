# Deep Audit — 20260419T19401_14-performance

Base: https://mn-ccore-lab.pages.dev
Screenshots: 0
PASS: 5
Bugs: 0 (P0 0, P1 0, P2 0)

## Bugs


## Full trace


══════ SUITE: 14-performance (run 20260419T19401_14-performance) ══════
Base: https://mn-ccore-lab.pages.dev

━━━ 14.A  Measuring 22 GET endpoints × 5 runs ━━━
  ✓ /api/version                                   p50=  51ms p95= 106ms wire=0kb raw=0kb
  ✓ /api/tasks                                     p50= 105ms p95= 122ms wire=626.8kb raw=626.8kb
  ✓ /api/tasks/overdue-count                       p50=  43ms p95= 272ms wire=0kb raw=0kb
  ✓ /api/projects                                  p50=  60ms p95= 339ms wire=60.3kb raw=60.3kb
  ✓ /api/projects/health                           p50= 119ms p95= 128ms wire=17.9kb raw=17.9kb
  ✓ /api/team                                      p50=  43ms p95=  46ms wire=8.9kb raw=8.9kb
  ✓ /api/meetings                                  p50=  46ms p95=  58ms wire=11.7kb raw=11.7kb
  ✓ /api/publications                              p50=  54ms p95=  99ms wire=43.2kb raw=43.2kb
  ✓ /api/ideas                                     p50=  49ms p95= 316ms wire=18.5kb raw=18.5kb
  ✓ /api/decisions                                 p50=  50ms p95=  54ms wire=15.8kb raw=15.8kb
  ✓ /api/grants                                    p50=  43ms p95=  48ms wire=1.5kb raw=1.5kb
  ✓ /api/activity?limit=50                         p50=  70ms p95=  83ms wire=11.5kb raw=11.5kb
  ✓ /api/notifications?recipient=nick              p50=  49ms p95=  64ms wire=17.5kb raw=17.5kb
  ✓ /api/notifications/count?recipient=nick        p50=  41ms p95=  49ms wire=0kb raw=0kb
  ✓ /api/digest                                    p50=  51ms p95=  52ms wire=47.7kb raw=47.7kb
  ✓ /api/digest/dates                              p50=  45ms p95=  49ms wire=0.4kb raw=0.4kb
  ✓ /api/narratives                                p50=  60ms p95=  77ms wire=42.3kb raw=42.3kb
  ✓ /api/calendar/events                           p50=  53ms p95=  58ms wire=18.4kb raw=18.4kb
  ✓ /api/stats                                     p50=  77ms p95= 302ms wire=0.1kb raw=0.1kb
  ✓ /api/search?q=CLIF                             p50=  72ms p95=  88ms wire=4.4kb raw=4.4kb
  ✓ /api/settings                                  p50=  38ms p95=  45ms wire=0.6kb raw=0.6kb
  ✓ /api/commitments                               p50=  41ms p95=  55ms wire=1.2kb raw=1.2kb

━━━ 14.B  Flag any endpoint with p95 >1500ms ━━━
- [PASS] 14.B All endpoints p95 <1500ms

━━━ 14.C  Flag oversized payloads (wire size preferred, raw fallback) ━━━
- [PASS] 14.C All payloads <1000kb (raw; wire ~5× smaller after CF br)

━━━ 14.D  Measure cold-vs-warm task create (detect connection overhead) ━━━
  14.D task-create cold=243ms warm=251ms
- [PASS] 14.D task create latency acceptable

━━━ 14.E  Large list endpoint (all tasks) with expected size check ━━━
  14.E /api/tasks: 626.8kb, p95=122ms
  14.E 602 tasks, ~1066 bytes/task
- [PASS] 14.E /api/tasks size reasonable for 602 rows

━━━ 14.F  Parallel load test — 10 concurrent /api/version hits ━━━
- [PASS] 14.F 10 concurrent /api/version in 102ms, all 200

──── CLEANUP (2 items) ────