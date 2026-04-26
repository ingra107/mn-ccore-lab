# Stitch MCP — One-time Setup

Stitch's `init` is fully interactive (no env-var bypass). Run this once to store credentials. After that, Stitch is callable from any session.

## Easiest path — API Key (recommended)

1. Open https://stitch.withgoogle.com — sign in with your Google account.
2. Click **Settings** (top-right) → **API Keys** → **Generate**. Copy the key.
3. In a terminal:
   ```bash
   npx -y @_davideast/stitch-mcp init -c claude-code -t stdio
   ```
   When prompted:
   - Auth mode: **API Key**
   - Paste the key
   - Accept default project / config paths
4. Verify:
   ```bash
   npx -y @_davideast/stitch-mcp doctor
   ```

The MCP config now lives at `~/.claude.json` (or wherever the `-c claude-code` flag wrote it). Restart Claude Code so the new MCP server is detected.

## Alternative — OAuth (more setup, no key to manage)

Same `init` command, pick **OAuth**. Requires gcloud CLI + a GCP project with billing enabled. Slower setup; only worth it if you don't want to manage an API key.

## Free tier (April 2026)

- 350 Gemini-2.5-Flash generations / month
- 200 Gemini-2.5-Pro generations / month
- No credit card required
- Paid tiers projected Q4 2026

12 prompts in our `prompts.md` batch = ~12 generations. Well under cap.

## After auth works — fire the batch

```bash
bash .stitch/run-batch.sh
```

(Script auto-generated below — see `run-batch.sh`.)
