// member-launcher-zip.ts -- build the two member-launcher downloads from
// member-launcher/ (the sources), at build time and in the dev server.
//
// Why zips built here and not files committed under public/: the zips are
// generated from the sources every build, so the download cannot drift from
// the reviewed scripts, and no binary is committed. Line endings are set HERE,
// per target, whatever the checkout did (core.autocrlf=true on Nick's Windows
// machines would otherwise ship CRLF shell scripts to a Mac, which bash
// refuses): Windows files CRLF, Mac files LF. The .sh files carry mode 0755 so
// Archive Utility unpacks them executable.
//
// The zip writer is the minimal stored (uncompressed) format: the payload is
// ~25 KB of text, and stdlib-only beats a dependency. Timestamps are fixed, so
// the same sources make the same bytes.
//
// Served at MEMBER_LAUNCHER_DOWNLOADS (src/lib/memberLauncherDownloads.ts) by
// the vite plugin in vite.config.ts.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MEMBER_LAUNCHER_DOWNLOADS } from '../src/lib/memberLauncherDownloads.ts'

const FOLDER = 'MNCCORE Launcher/'

interface Entry { name: string; text: string; eol: 'crlf' | 'lf'; mode: number }

function normalize(text: string, eol: 'crlf' | 'lf'): string {
  const lf = text.replace(/\r\n?/g, '\n')
  return eol === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// 2026-01-01 00:00:00 in MS-DOS date/time form.
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

/** A stored (method 0) zip of the given files, UTF-8 names, Unix modes. */
export function storedZip(files: { name: string; data: Uint8Array; mode: number }[]): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const crc = crc32(f.data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // names are UTF-8
    local.setUint16(8, 0, true) // stored
    local.setUint16(10, DOS_TIME, true)
    local.setUint16(12, DOS_DATE, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, f.data.length, true)
    local.setUint32(22, f.data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    const localBytes = concat([new Uint8Array(local.buffer), name, f.data])
    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, (3 << 8) | 20, true) // made by Unix, so the mode below is read
    central.setUint16(6, 20, true)
    central.setUint16(8, 0x0800, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, DOS_TIME, true)
    central.setUint16(14, DOS_DATE, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, f.data.length, true)
    central.setUint32(24, f.data.length, true)
    central.setUint16(28, name.length, true)
    central.setUint16(30, 0, true)
    central.setUint16(32, 0, true)
    central.setUint16(34, 0, true)
    central.setUint16(36, 0, true)
    central.setUint32(38, ((0o100000 | f.mode) << 16) >>> 0, true)
    central.setUint32(42, offset, true)
    centrals.push(concat([new Uint8Array(central.buffer), name]))
    locals.push(localBytes)
    offset += localBytes.length
  }
  const cd = concat(centrals)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, cd.length, true)
  end.setUint32(16, offset, true)
  return concat([...locals, cd, new Uint8Array(end.buffer)])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let i = 0
  for (const p of parts) { out.set(p, i); i += p.length }
  return out
}

function entries(root: string): Record<'windows' | 'mac', Entry[]> {
  const read = (...p: string[]) => readFileSync(join(root, 'member-launcher', ...p), 'utf8')
  const readme = read('README.md')
  return {
    windows: [
      { name: 'Install.cmd', text: read('windows', 'Install.cmd'), eol: 'crlf', mode: 0o644 },
      { name: 'Uninstall.cmd', text: read('windows', 'Uninstall.cmd'), eol: 'crlf', mode: 0o644 },
      { name: 'install.ps1', text: read('windows', 'install.ps1'), eol: 'crlf', mode: 0o644 },
      { name: 'uninstall.ps1', text: read('windows', 'uninstall.ps1'), eol: 'crlf', mode: 0o644 },
      { name: 'mnccore-launcher.ps1', text: read('windows', 'mnccore-launcher.ps1'), eol: 'crlf', mode: 0o644 },
      { name: 'README.txt', text: readme, eol: 'crlf', mode: 0o644 },
    ],
    mac: [
      { name: 'install.sh', text: read('macos', 'install.sh'), eol: 'lf', mode: 0o755 },
      { name: 'uninstall.sh', text: read('macos', 'uninstall.sh'), eol: 'lf', mode: 0o755 },
      { name: 'MNCCORE Launcher.applescript', text: read('macos', 'MNCCORE Launcher.applescript'), eol: 'lf', mode: 0o644 },
      { name: 'README.txt', text: readme, eol: 'lf', mode: 0o644 },
    ],
  }
}

/** URL path -> zip bytes, built from the sources under `root`/member-launcher. */
export function buildMemberLauncherZips(root: string): Record<string, Uint8Array> {
  const enc = new TextEncoder()
  const all = entries(root)
  const zip = (list: Entry[]) =>
    storedZip(list.map((e) => ({ name: FOLDER + e.name, data: enc.encode(normalize(e.text, e.eol)), mode: e.mode })))
  return {
    [MEMBER_LAUNCHER_DOWNLOADS.windows]: zip(all.windows),
    [MEMBER_LAUNCHER_DOWNLOADS.mac]: zip(all.mac),
  }
}
