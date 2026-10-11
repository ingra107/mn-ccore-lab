Archived 2026-10-11 (s51 dead-weight lane). Handlers cut from api/routes/pb-sector.ts, plus their defineRoute blocks in api/index.ts: POST /api/pb/defer, POST /api/pb/dispatch/send, POST /api/pb/dispatch/complete.

Proof: git grep over the Hub finds the names only in api/index.ts and pb-sector.ts. In Peripheral-Brain the URLs appear only in .claude/skills/_archived/orphans/dispatch/SKILL.md.archived. src/, functions/, workers/, tests/ and scripts/ never call them. All three sat behind the PI-only /api/pb/* gate.

Later the same day (Nick: "cut it all"): the Queue for Claude lane went too. POST /api/pb/dispatch/add and GET /api/pb/dispatch/pending are appended at the end of api/routes/pb-sector.ts here, with the two buttons in TaskDetailPanel (comment composer) and TaskIntelligence (Hermes draft card) that were their only callers. The dispatch_queue table is kept (no DDL), now with no writer.

Still live: /api/pb/capture. SmartCompose's "Queue for Claude" toggle is not this lane: it prefixes the note with @hermes (a real Hermes ask).

PB-FOLLOWUP: the PB startup hook that GETs /api/pb/dispatch/pending now gets a 404.

removed-callers-and-routes.patch (this folder) holds the rest: the import lines and defineRoute blocks removed from api/index.ts, and the Queue for Claude toggle (TaskDetailPanel) and Review draft card (TaskIntelligence), as `git diff 9a0de385 HEAD` over those three files. It also carries the unrelated edits those files took in the same range; reverse-apply only the hunks you want.
