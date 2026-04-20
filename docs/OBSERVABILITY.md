# Observability

## Health endpoint

`GET /api/health` — public, no auth, safe to hit frequently.

**Healthy** (sample taken 2026-04-20 post Phase 36c):
```json
HTTP/1.1 200 OK
{
  "ok": true,
  "checks": {
    "tasks": 601,
    "projects": 64,
    "team": 19,
    "last_activity": "2026-04-20 01:23:35",
    "realtime": "not_bound",
    "duration_ms": 64
  },
  "failures": [],
  "timestamp": "2026-04-20T01:24:00.000Z"
}
```

`duration_ms` p50 dropped from ~100ms to ~64ms after schema-v46 added 7
missing indexes (Phase 36c). Watch for regression — sustained >150ms
typically means an index was dropped or a new SCAN crept in.

**Unhealthy** — any check fails:
```json
HTTP/1.1 503 Service Unavailable
{
  "ok": false,
  "failures": ["tasks table empty"],
  "checks": { "tasks": 0, ... }
}
```

### What it verifies

| Check | What it means if it fails |
|---|---|
| `tasks` count | D1 table empty or query errored |
| `projects` count | Project data lost or D1 down |
| `team` count (≥5) | team_members seed drifted or table missing |
| `last_activity` (≤14 days) | Activity pipeline stalled; users may have stopped using it OR a write path is broken |
| `realtime` | Optional. `not_bound` is fine (CF Pages binding absent). `5xx` means hub-realtime Worker down. |
| `duration_ms` | All DB probes combined; >500ms is slowish but not broken |

## Wiring external monitoring

### Option 1: UptimeRobot / StatusCake / Pingdom (free tier)

Add a new HTTP monitor:
- URL: `https://mn-ccore-lab.pages.dev/api/health`
- Method: `GET`
- Interval: 5 min (free tier); 1 min (paid)
- Expected status: 200
- Alert after: 2 consecutive failures

### Option 2: Cloudflare Worker Analytics + alert rule

The Pages Functions runtime surfaces request counts + error rates in the
Cloudflare dashboard. To set an alert:

1. Cloudflare dashboard → Analytics & Logs → Notifications
2. Create rule: "Workers & Pages → Error rate > 5% over 5m"
3. Notification channel: Nick's email or Slack webhook

Error rate alone isn't enough — a single malformed request can spike 400s.
Combine with the external monitor above for real coverage.

### Option 3: Cloudflare cron trigger

The existing `wrangler.toml` already declares:
```toml
crons = ["0 13 * * 1-5", "0 11 * * *"]
```

The weekday 13:00 UTC cron runs the morning-pulse email. You could add a
lightweight health-check cron that hits `/api/health` and emails on
failure — but the external monitor is simpler and doesn't eat Worker CPU.

## Preflight integration

`scripts/pre-flight/persona-health.ts` hits `/api/health` during every
preflight run. If it returns non-200 or reports `ok:false`, the orchestrator
gates RED. This catches production regressions before merge/deploy.

## Runbook — what to do when /api/health goes red

1. **`failures` includes "database X empty / errored"** → D1 is unreachable
   or table dropped. Check `wrangler d1 execute mnccore-lab --remote
   --command "SELECT 1"` first — if that works, check the schema. A recent
   migration may have renamed a table.
2. **`"no activity in last 14 days"`** → write paths probably broken. Look
   at `/api/activity` directly. If it's empty but tasks are being created,
   `logActivity()` is silently failing — check the helper for a thrown
   exception getting swallowed.
3. **`realtime 5xx`** → hub-realtime Worker is down. Users still work (WS
   falls back to 15s version poll) but presence + live updates are broken.
   `wrangler tail hub-realtime` to see what's crashing.
4. **`duration_ms > 2000`** → D1 is throttled or a table needs an index.
   Recent N+1 regression likely; check recent commits.
