// Vitest globalSetup for the api suite: replay the schema chain once, before any
// worker starts, and hand workers the image through a temp file. See the note in
// prod-schema-db.ts. A chain that fails to apply stops the run here, naming the file.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildImage } from './prod-schema-db'

export default function setup(): () => void {
  const dir = mkdtempSync(join(tmpdir(), 'hub-prod-schema-'))
  const file = join(dir, 'image.sqlite')
  writeFileSync(file, buildImage())
  process.env.PROD_SCHEMA_IMAGE_FILE = file
  return () => {
    delete process.env.PROD_SCHEMA_IMAGE_FILE
    rmSync(dir, { recursive: true, force: true })
  }
}
