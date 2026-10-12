// memberLauncherZip.test.ts -- the member-launcher downloads are built from
// member-launcher/ with the right files, line endings and modes, whatever the
// checkout's line endings are (scripts/member-launcher-zip.ts).
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { buildMemberLauncherZips, crc32 } from '../../../scripts/member-launcher-zip'
import { MEMBER_LAUNCHER_DOWNLOADS } from '../memberLauncherDownloads'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

interface Unzipped { name: string; text: string; mode: number }

/** Read every central-directory entry back, checking each against its local header and CRC. */
function unzip(zip: Uint8Array): Unzipped[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const end = zip.length - 22
  expect(v.getUint32(end, true)).toBe(0x06054b50)
  const count = v.getUint16(end + 10, true)
  let p = v.getUint32(end + 16, true)
  const dec = new TextDecoder()
  const out: Unzipped[] = []
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50)
    const crc = v.getUint32(p + 16, true)
    const size = v.getUint32(p + 24, true)
    const nameLen = v.getUint16(p + 28, true)
    const mode = (v.getUint32(p + 38, true) >>> 16) & 0o777
    const local = v.getUint32(p + 42, true)
    const name = dec.decode(zip.subarray(p + 46, p + 46 + nameLen))
    expect(v.getUint32(local, true)).toBe(0x04034b50)
    const dataAt = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const data = zip.subarray(dataAt, dataAt + size)
    expect(crc32(data), name).toBe(crc)
    out.push({ name, text: dec.decode(data), mode })
    p += 46 + nameLen
  }
  return out
}

describe('member launcher zips', () => {
  const zips = buildMemberLauncherZips(ROOT)

  it('builds one zip per download link', () => {
    expect(Object.keys(zips).sort()).toEqual([MEMBER_LAUNCHER_DOWNLOADS.mac, MEMBER_LAUNCHER_DOWNLOADS.windows].sort())
  })

  it('Windows: the installer, the launcher and the README, all CRLF', () => {
    const files = unzip(zips[MEMBER_LAUNCHER_DOWNLOADS.windows])
    expect(files.map((f) => f.name)).toEqual([
      'MNCCORE Launcher/Install.cmd', 'MNCCORE Launcher/Uninstall.cmd', 'MNCCORE Launcher/install.ps1',
      'MNCCORE Launcher/uninstall.ps1', 'MNCCORE Launcher/mnccore-launcher.ps1', 'MNCCORE Launcher/README.txt',
    ])
    for (const f of files) {
      expect(f.text.replace(/\r\n/g, ''), `${f.name} has a bare LF`).not.toContain('\n')
      expect(f.text.length, f.name).toBeGreaterThan(100)
    }
    expect(files.find((f) => f.name.endsWith('Install.cmd'))!.text).toContain('install.ps1')
  })

  it('Mac: the installers (executable), the AppleScript and the README, all LF', () => {
    const files = unzip(zips[MEMBER_LAUNCHER_DOWNLOADS.mac])
    expect(files.map((f) => [f.name, f.mode.toString(8)])).toEqual([
      ['MNCCORE Launcher/install.sh', '755'], ['MNCCORE Launcher/uninstall.sh', '755'],
      ['MNCCORE Launcher/MNCCORE Launcher.applescript', '644'], ['MNCCORE Launcher/README.txt', '644'],
    ])
    for (const f of files) expect(f.text, `${f.name} has a CR`).not.toContain('\r')
    expect(files[0].text.startsWith('#!/bin/bash\n')).toBe(true)
  })

  it('is deterministic: the same sources make the same bytes', () => {
    const again = buildMemberLauncherZips(ROOT)
    for (const k of Object.keys(zips)) expect(Buffer.from(again[k]).equals(Buffer.from(zips[k]))).toBe(true)
  })
})
