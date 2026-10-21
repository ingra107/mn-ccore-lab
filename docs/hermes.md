# Hermes — AI Research Assistant

Hermes is the MN-CCORE Lab Hub's built-in AI research assistant. Team members can ask research questions, get project context, and discuss analysis approaches — all within the Hub.

## How to Use Hermes

### Ask the Lab (retired 2026-10-21)
Ask the Lab no longer dispatches Hermes: an `@hermes` in a question or answer creates no AI request (#8238; one question ever used it). Ask Hermes on a task, project or meeting instead.

### Task Comments
1. Open any task's detail view
2. In the comment box, toggle **"@ Hermes"** to include Hermes
3. Write your comment/question
4. Hermes responds in the comment thread with context about the task

### Project Comments
1. Open a project page
2. Write a comment mentioning `@hermes`
3. Hermes responds with context about the project

### Meeting Discussion (2026-09-08)
1. Open a meeting and scroll to **Discussion**
2. Write a comment mentioning `@hermes`
3. Hermes answers with the meeting's agenda, notes, decisions and the tasks it produced — and, when the meeting was debriefed, it can read the **archived Zoom transcript** and answer from what was actually said
4. Ask it for a write-up and the answer becomes an artifact page with a link in the thread, the same as on a task or project

Meeting comments are team-visible by default (a meeting page is a shared surface). Starting your message with `@hermes` makes that thread private to you, the same rule the task and Today composers follow.

## What Hermes Can Help With
- Research methodology questions ("What's the best approach for competing risks analysis?")
- Literature context ("What do we know about SOFA score trajectories in sepsis?")
- Project strategy ("What should our next steps be for the ventilator liberation study?")
- Data analysis approaches ("How should we handle missing data in this CLIF cohort?")
- General lab knowledge ("When is the next R01 deadline?")

## Private asks and Nick's mail (#119)
- A typed `@hermes` at the start of a comment is private: only you see the ask
  and the answer. A mid-text "ask @hermes about X" is a team comment, and the
  answer is visible to everyone who can read the thread.
- For Nick only, a private ask can read and draft his email (UMN and personal)
  and read his Peripheral Brain. The same ask in a team thread gets neither, so
  nothing from his mailbox can land where the team reads. Hermes never sends
  mail; a draft link is posted in the thread.
- Long answers become artifact pages only when asked in a team thread; a
  private answer always stays in its thread.
- An `@hermes` comment on an artifact rewrites that artifact, which the team
  can read. Even a private comment's text is folded into the new version.
- Since 2026-10-21, when Nick asks Hermes privately on a task, Hermes can make
  three changes to that task: link it to a project (only if it has none,
  chosen from the live project list), add a note to its description, and add
  a key link to an email or Google Doc it opened while answering. Every change
  is listed at the end of the answer with how to undo it; anything that did
  not apply says "Not done". Asks from team members, or from Nick in a
  team-visible thread, cannot change anything. The note lands in the task
  description, which the project team can read.

## What Hermes Cannot Do
- Access external databases or PubMed directly
- Send email (it can only draft, for Nick) or create calendar events
- Access files on Nick's computer
- Make changes to the Hub, except the three task changes above on Nick's own
  private asks

## Tips
- Be specific — "What statistical test for comparing two survival curves?" beats "Help with stats"
- Include context — "@hermes Given our CLIF cohort of 50K patients, what sample size do we need for subgroup analysis?"
- Use follow-ups — Hermes remembers the conversation thread, so ask clarifying questions
- Both `@hermes` and `@claude` work as triggers (backward compatibility)

## How It Works (Technical)

```
Team member posts "@hermes [question]" in Hub
    |
Hub API detects @hermes mention (regex: /@(hermes|claude)\b/i)
    |
Creates ai_requests record (status: pending)
Creates placeholder answer: "Thinking about this..."
    |
hub_ai_listener.py (home laptop, polls POST /api/ai-requests/queue every 60s)
    |
Claims the request (POST /api/ai-requests/:id/claim -> a token, 20-minute lease;
  the row stays status 'pending'; only one runner can hold it)
Builds prompt with conversation history
    |
Calls `claude --print --model sonnet` (Max subscription, $0 API cost)
    |
Posts response back to Hub API with the claim token. The Hub accepts it only
  from the current, unexpired token, and writes the answer, the placeholder and
  the notification in one transaction (schema-v140: one answer per ask)
    |
Team member sees Hermes response (gold badge) in 20-40 seconds
```

Terminal `ai_requests` rows (completed or failed) cannot be deleted or rewritten: schema-v140 triggers refuse it. Any retention job or table-rebuild migration must drop and re-create those triggers.

## Rate Limits
- No per-user rate limit currently enforced
- Responses use Nick's Claude Max subscription (no API cost)
- Each response takes 10-30 seconds to generate

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No response after 1 minute | Check if listener is running: `type data\hub_ai_listener.pid` on home machine |
| Listener not running | Health check auto-restarts every 60 min. Manual: `python scripts/scheduled/hub_ai_listener.py` |
| "Thinking about this..." stuck | Check home machine is online and has internet. A request whose run was lost three times, or that was retried ten times after a temporary failure, is marked failed by the next poll and Nick gets a Telegram alert; ask again |
| PB_API_KEY errors | Verify env var is set: `echo %PB_API_KEY%` on home machine |

## Artifacts lane (v1, 2026-06-11)

Responses >1500 chars OR explicit document asks become versioned artifact pages at
`/portal/artifacts/<id>` (POST /api/artifacts) with a short teaser + link posted to the feed;
`@hermes` comments on an artifact create `ai_requests` with `source_type='artifact_comment'`
→ the listener regenerates and POSTs `/:id/revise` (version++, history kept). Short answers
unchanged. ⚠️ Listener fetch contract: Hub list endpoints return `{data, count}` — the
listener read a nonexistent `requests` key until 2026-06-11 (PB `b794fddf`); verify response
keys against route source when adding consumers.
