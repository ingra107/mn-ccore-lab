# Hermes — AI Research Assistant

Hermes is the MN-CCORE Lab Hub's built-in AI research assistant. Team members can ask research questions, get project context, and discuss analysis approaches — all within the Hub.

## How to Use Hermes

### Ask the Lab (Primary)
1. Go to **Ask the Lab** in the Hub portal
2. Post a question that includes `@hermes` (e.g., "What statistical approach should we use for the vasopressor escalation analysis? @hermes")
3. Hermes responds within 20-40 seconds
4. The response appears with a gold sparkle badge
5. You can reply with another `@hermes` mention for follow-up — Hermes sees the full conversation thread

### Task Comments
1. Open any task's detail view
2. In the comment box, toggle **"@ Hermes"** to include Hermes
3. Write your comment/question
4. Hermes responds in the comment thread with context about the task

### Project Comments
1. Open a project page
2. Write a comment mentioning `@hermes`
3. Hermes responds with context about the project

## What Hermes Can Help With
- Research methodology questions ("What's the best approach for competing risks analysis?")
- Literature context ("What do we know about SOFA score trajectories in sepsis?")
- Project strategy ("What should our next steps be for the ventilator liberation study?")
- Data analysis approaches ("How should we handle missing data in this CLIF cohort?")
- General lab knowledge ("When is the next R01 deadline?")

## What Hermes Cannot Do
- Access external databases or PubMed directly
- Send emails or create calendar events
- Access files on Nick's computer
- Make changes to the Hub (it can only respond to questions)

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
hub_ai_listener.py (home laptop, polls every 10s)
    |
Picks up pending request
Builds prompt with conversation history
    |
Calls `claude --print --model sonnet` (Max subscription, $0 API cost)
    |
Posts response back to Hub API
    |
Team member sees Hermes response (gold badge) in 20-40 seconds
```

## Rate Limits
- No per-user rate limit currently enforced
- Responses use Nick's Claude Max subscription (no API cost)
- Each response takes 10-30 seconds to generate

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No response after 1 minute | Check if listener is running: `type data\hub_ai_listener.pid` on home machine |
| Listener not running | Health check auto-restarts every 60 min. Manual: `python scripts/scheduled/hub_ai_listener.py` |
| "Thinking about this..." stuck | Check home machine is online and has internet |
| PB_API_KEY errors | Verify env var is set: `echo %PB_API_KEY%` on home machine |
