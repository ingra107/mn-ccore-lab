Archived 2026-10-11 (s51 dead-weight lane). Handlers cut from api/routes/pb-sector.ts, plus their defineRoute blocks in api/index.ts: POST /api/pb/defer, POST /api/pb/dispatch/send, POST /api/pb/dispatch/complete.

Proof: git grep over the Hub finds the names only in api/index.ts and pb-sector.ts. In Peripheral-Brain the URLs appear only in .claude/skills/_archived/orphans/dispatch/SKILL.md.archived. src/, functions/, workers/, tests/ and scripts/ never call them. All three sat behind the PI-only /api/pb/* gate.

Still live: /api/pb/capture, /api/pb/dispatch/add (TaskDetailPanel, TaskIntelligence), /api/pb/dispatch/pending (PB startup hook). Nothing can now move a dispatch_queue row out of 'pending'; that was already true once the completer skill was archived.
