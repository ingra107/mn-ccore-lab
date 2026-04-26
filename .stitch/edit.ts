/**
 * Edit an existing Stitch screen. Saves to .stitch/designs/{slug}-r{N}.{html,png,json}
 *
 * Usage: npx tsx edit.ts <slug>
 *   reads .stitch/designs/<slug>.json for the screenId, fires .stitch/edits/<slug>.md as the edit prompt
 */

import { stitch } from "@google/stitch-sdk";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESIGNS_DIR = resolve(__dirname, "designs");
const EDITS_DIR = resolve(__dirname, "edits");

async function loadEnv() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

async function downloadToFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function nextRevision(slug: string): Promise<number> {
  const files = await readdir(DESIGNS_DIR);
  const re = new RegExp(`^${slug}-r(\\d+)\\.html$`);
  let max = 0;
  for (const f of files) {
    const m = f.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

async function main() {
  await loadEnv();
  const slug = process.argv[2];
  if (!slug) {
    console.error("usage: npx tsx edit.ts <slug>");
    process.exit(1);
  }

  const metaPath = resolve(DESIGNS_DIR, `${slug}.json`);
  const editPath = resolve(EDITS_DIR, `${slug}.md`);
  if (!existsSync(metaPath)) throw new Error(`no metadata: ${metaPath}`);
  if (!existsSync(editPath)) throw new Error(`no edit prompt: ${editPath}`);

  const meta = JSON.parse(await readFile(metaPath, "utf8"));
  const editPrompt = await readFile(editPath, "utf8");

  // Read the cached project id
  const projectId = (await readFile(resolve(__dirname, ".project-id"), "utf8")).trim();

  const project = stitch.project(projectId);
  const screen = await project.getScreen(meta.screenId);

  console.log(`→ editing ${slug} (screen ${meta.screenId})`);
  const edited = await screen.edit(editPrompt);

  const rev = await nextRevision(slug);
  const newSlug = `${slug}-r${rev}`;
  const [htmlUrl, imgUrl] = await Promise.all([edited.getHtml(), edited.getImage()]);

  await Promise.all([
    downloadToFile(htmlUrl as unknown as string, resolve(DESIGNS_DIR, `${newSlug}.html`)),
    downloadToFile(imgUrl as unknown as string, resolve(DESIGNS_DIR, `${newSlug}.png`)),
  ]);

  await writeFile(
    resolve(DESIGNS_DIR, `${newSlug}.json`),
    JSON.stringify(
      {
        slug: newSlug,
        parentSlug: slug,
        revision: rev,
        device: meta.device,
        screenId: (edited as any).id ?? null,
        editPrompt,
        editedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`  ✓ ${newSlug}.html + .png`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
