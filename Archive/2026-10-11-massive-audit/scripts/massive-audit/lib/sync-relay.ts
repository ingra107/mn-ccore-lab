/**
 * Chat-coordinated sync verification with home laptop.
 *
 * Master plan section M and per-section round-trip verification append a
 * timestamped `## WORK` block to data/shared/home-work-chat.md, git-push,
 * then poll for a matching `## HOME` reply containing the section's run-id
 * marker.
 *
 * Avoids the dispatcher relay's 8-min cap by using the open-session chat
 * pattern (works while home Claude session is alive).
 */
import { execFileSync, execSync } from 'child_process'
import { readFileSync } from 'fs'

const PB_CHAT = 'C:/Users/ingra107/Peripheral-Brain/data/shared/home-work-chat.md'
const PB_REPO = 'C:/Users/ingra107/Peripheral-Brain'

export interface RelayAsk {
  topic: string         // e.g. "C1 task sync", appears in chat header
  runId: string         // matches the audit run id; used to find reply
  body: string          // markdown body of the ask
  expectMarker?: string // home should include this string in their reply for match
}

export interface RelayReply {
  matched: boolean
  excerpt?: string      // first 600 chars of matched reply
  timestamp?: string    // ISO of `## HOME` header
}

export function appendChat(ask: RelayAsk): void {
  const now = new Date()
  const stamp = now.toISOString().slice(0, 16).replace('T', 'T') // YYYY-MM-DDTHH:mm
  const block = `\n## WORK ${stamp} — ${ask.topic} (run ${ask.runId})\n\n${ask.body}\n\n— work\n`

  // Append + commit + push
  const fs = require('fs') as typeof import('fs')
  fs.appendFileSync(PB_CHAT, block)
  try {
    execSync('git add data/shared/home-work-chat.md', { cwd: PB_REPO, stdio: 'pipe' })
    execSync(`git commit -m "chat: massive-audit ${ask.topic}" -q`, { cwd: PB_REPO, stdio: 'pipe' })
    safeGitPush()
  } catch (e) {
    // best-effort; Syncthing covers the gap if git falls over
    console.log(`  sync-relay: git push warning: ${(e as Error).message.slice(0, 200)}`)
  }
}

function safeGitPush(): void {
  try {
    execSync('git push -q', { cwd: PB_REPO, stdio: 'pipe' })
  } catch {
    // Try stash + pull --rebase + push
    try {
      execSync('git stash -u -m "massive-audit pre-push"', { cwd: PB_REPO, stdio: 'pipe' })
      execSync('git pull --rebase --no-edit', { cwd: PB_REPO, stdio: 'pipe' })
      execSync('git push -q', { cwd: PB_REPO, stdio: 'pipe' })
      execSync('git stash pop', { cwd: PB_REPO, stdio: 'pipe' })
    } catch (e) {
      console.log(`  sync-relay: push failed after rebase: ${(e as Error).message.slice(0, 200)}`)
    }
  }
}

/**
 * Wait for a `## HOME` reply that contains either the runId or expectMarker.
 * Polls every 10s for up to maxWaitMs. Pulls remote each poll to catch
 * Syncthing-delivered changes as well as git-pushed ones.
 */
export async function waitForReply(
  ask: RelayAsk,
  maxWaitMs = 5 * 60 * 1000,
): Promise<RelayReply> {
  const start = Date.now()
  const marker = ask.expectMarker || ask.runId
  let lastSize = 0

  while (Date.now() - start < maxWaitMs) {
    try {
      execSync('git pull --rebase --no-edit', { cwd: PB_REPO, stdio: 'pipe' })
    } catch {
      // ignore; Syncthing may still be delivering
    }
    const text = readFileSync(PB_CHAT, 'utf-8')
    if (text.length !== lastSize) {
      lastSize = text.length
      // Find `## HOME ...` blocks AFTER our ask — last one with matching marker
      const blocks = text.split(/\n## /).map((b, i) => (i === 0 ? b : '## ' + b))
      const homeBlocks = blocks.filter((b) => b.startsWith('## HOME'))
      const matched = homeBlocks.reverse().find((b) => b.includes(marker))
      if (matched) {
        const tsMatch = matched.match(/^## HOME (\S+)/)
        return {
          matched: true,
          excerpt: matched.slice(0, 600),
          timestamp: tsMatch?.[1],
        }
      }
    }
    await sleep(10000)
  }
  return { matched: false }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Tail the last N lines of the chat for debug output. */
export function tailChat(n = 30): string {
  const text = readFileSync(PB_CHAT, 'utf-8')
  const lines = text.split('\n')
  return lines.slice(-n).join('\n')
}
