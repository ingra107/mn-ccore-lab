#!/usr/bin/env node
// Parent-death watchdog for run-journey-spec.mjs.
//
// Usage: node scripts/journey-watchdog.mjs <ownerPid> <targetPid>
//
// Windows has no parent-death signal: when the runner is terminated from
// outside (a Bash-tool timeout, TaskStop, a closed session), TerminateProcess
// never reaches its children, `concurrently -k` never runs its cleanup, and
// wrangler + workerd + vite keep their ports and lock the checkout's folder
// for days (seen 2026-10-11/12: :5173 and :8787 held ~21h by a dead lane).
//
// The runner starts this detached. Every second it checks both pids: the
// target (the concurrently shell) exiting first means a normal finish, so it
// exits; the owner (the runner) dying first means the stack is orphaned, so it
// kills the target's whole tree and exits. PB's dev_server_reaper is the
// machine-wide backstop for stacks started any other way.
import { spawnSync } from 'node:child_process'

const owner = Number(process.argv[2])
const target = Number(process.argv[3])
if (!owner || !target) {
  console.error('Usage: node scripts/journey-watchdog.mjs <ownerPid> <targetPid>')
  process.exit(2)
}

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

function killTree(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  } else {
    try { process.kill(pid, 'SIGTERM') } catch { /* already gone */ }
  }
}

const timer = setInterval(() => {
  if (!alive(target)) {
    clearInterval(timer)
    return
  }
  if (!alive(owner)) {
    clearInterval(timer)
    killTree(target)
  }
}, 1000)
