/**
 * Fire all "throw it all" prompts at Stitch via the official @google/stitch-sdk.
 *
 * Setup:
 *   STITCH_API_KEY in .stitch/.env (gitignored)
 *   Run:  npx tsx .stitch/run-batch.ts [prompt-slug-or-all]
 *
 * Output: .stitch/designs/{slug}.html  +  .stitch/designs/{slug}.png  +  .stitch/designs/{slug}.json (metadata)
 */

import { stitch } from "@google/stitch-sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESIGNS_DIR = resolve(__dirname, "designs");

// Load .env (light parser — no extra deps)
async function loadEnv() {
  const envPath = resolve(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

const DESIGN_SYSTEM = `**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, Desktop-first (1280-1920), responsive to 768/414/375.
- Atmosphere: Operational research-ops center. Linear / Notion / Airtable adjacent. Dense data tables, quiet UI, one-accent-per-view, instant inline editing, undo-everywhere optimistic UI. Dark-first.
- Palette: Page bg #0b1017 (deep neutral, NOT blue-tinted) / Text #e2e8f0 / Primary action TEAL #5cbcb4 / Warning GOLD #dcb355 / Error MAROON #f0737e / Success GREEN #6ee89a. ONE accent per view. Max 2 non-neutral colors per screen.
- Typography: DM Sans everywhere (body 400, interactive 500, headings 600). NO Inter, NO Roboto, NO serifs. JetBrains Mono only for keyboard-shortcut keys.
- Spacing: 8px grid (4/8/12/16/24/32). Border radius 4/6/8/12/16.
- Sidebar darker than content (3-plane depth). Active nav item = teal-subtle filled bg, no left border.
- Banned: glassmorphism, neon, gradients, purple, pure black, centered editorial hero, generic Sparkles for AI, raw select element, opacity below 0.30 on readable text.
- Brand primitives to call out by name: HeartbeatLine (ECG motif), HermesMark (AI assistant avatar), CategoryIcon (lungs/flask/heartbeat/cap for project category), Avatar (slug-based circle).`;

type Device = "DESKTOP" | "MOBILE" | "TABLET";

interface PromptDef {
  slug: string;
  device: Device;
  body: string;
}

const PROMPTS: PromptDef[] = [
  {
    slug: "01-today-page",
    device: "DESKTOP",
    body: `Design /portal/today — the user's first landing surface when they arrive at the Hub each morning. Goal: utility-first, show what matters today fast.

Page structure:
1. Sticky top bar: greeting "Good morning, Nick" + today's date + ECG heartbeat divider (HeartbeatLine) underneath.
2. Hero band ("Right Now"): single card showing the ONE most important thing right now — current/imminent meeting OR top overdue task. Big, scannable, with primary CTA (teal solid button).
3. Two-column main grid: LEFT = vertical timeline of today's meetings + tasks (chronological, with overlap bands when meetings collide). RIGHT = rail with 4 cards stacked: Pulse stats, Needs Attention summary, Top 3 Projects, Hermes Suggests.
4. Footer: empty if all done, otherwise quiet count of remaining items.

Inline edits: clicking a task title opens a side drawer for full detail. Status circle clicks → status pill (todo / in_progress / done) with undo toast at bottom-center.`,
  },
  {
    slug: "02-mytasks-three-views",
    device: "DESKTOP",
    body: `Design /portal/my-tasks with a top bar that toggles between THREE views: List (single column, infinite scroll), Columns (kanban — status as column), Lanes (horizontal swimlanes by project).

Common chrome: top bar with title "My Tasks" + count, view picker (List/Columns/Lanes), filter chips (Today / This Week / Overdue / No Date), search, density toggle. Bulk action bar appears when >0 tasks selected. Each task row: checkbox-style status circle, title (clickable), assignee avatar, due chip, priority pill, project tag.

List view: dense table, fixed row height 44px, virtualized.
Columns view: 4 columns (Todo, In Progress, Blocked, Done) horizontal scroll on mobile.
Lanes view: horizontal scroll, each lane = a project, vertical stack of that project's tasks.`,
  },
  {
    slug: "03-project-detail-overview",
    device: "DESKTOP",
    body: `Design the Overview tab of a project detail page (e.g. /portal/projects/clif-pf-sf).

Header: Project title in DM Sans 600. Inline-editable category dot (CategoryIcon — lungs/flask/heartbeat/cap). Inline-editable PI avatar. Stage strip showing 7 stages (Idea → Data Collection → Analysis → Writing → Review → Submitted → Published) with current stage highlighted using a stage-fill color. Live presence avatar stack on right.

Body: 3-col grid:
- LEFT col-span-2: "Open Tasks" card always visible with + Add task CTA inline.
- RIGHT col-span-1: stacked Key Links card + Recent Activity card.
- BOTTOM full-width: Quick compose box with paperclip + paste-image + @mention support.

Tabs above body: Overview | Tasks | Notes | Comments | Files | Activity | Revisions | Literature.`,
  },
  {
    slug: "04-settings-rethink",
    device: "DESKTOP",
    body: `Design /portal/settings. Currently sparse. Full rethink with sections:
- Profile: photo upload, display name, slug (read-only), email (read-only), expertise tags, role.
- Workspace: density toggle, theme, sidebar collapsed default.
- Notifications: per-channel toggles, digest frequency, digest time of day.
- Lab (PI-only): Manuscript needs-attention thresholds.
- Integrations: Gmail, Google Calendar, Cloudflare Access connection status.
- Danger zone: sign out, request data export.

Use a left-rail section navigator on desktop, accordion on mobile.`,
  },
  {
    slug: "05-insights-page",
    device: "DESKTOP",
    body: `Design a brand-new /portal/insights page. Goal: surface non-obvious patterns from the lab's data — what's accelerating, what's stalled, who's overloaded, where attention should go this week.

Sections:
- Hero: "This Week's Insights" — 3-4 narrative cards (e.g. "Mary's revision response time dropped 40% this week"). Each card has a small chart and a one-line takeaway.
- Workload heatmap: 19 team members × 5 weekdays, color = task density.
- Project velocity: scatter plot, x = days since last update, y = open task count. Outliers in maroon.
- Pipeline: 7-stage funnel (Idea → Published) with project counts at each stage.
- Stalled list: projects with 0 activity in 14+ days, expandable rows.`,
  },
  {
    slug: "06-mobile-mytasks",
    device: "MOBILE",
    body: `Design the mobile variant (375px width) of /portal/my-tasks.
- Floating bottom tab bar visible (5 main routes + More).
- Top: greeting + filter pills (horizontal scroll).
- Task rows: stacked card layout (NOT columnar table). Title + meta row (assignee avatar, due chip, priority dot).
- Swipe right on row → mark done with undo toast. Swipe left → snooze submenu.
- FAB bottom-right: + new task. Above the bottom tab bar.
- Sticky bottom compose drawer when "Add task" tapped — slides up with focus + keyboard, respects safe-area-inset-bottom.`,
  },
  {
    slug: "07-mobile-project-detail",
    device: "MOBILE",
    body: `Design the mobile variant (375px) of a project detail page.
- Sticky top: back button + project title (truncate) + overflow menu.
- Stage strip: horizontally scrolling, current stage highlighted.
- Tabs: horizontal scroll. Active tab indicator below.
- Body: full-width single column. Open Tasks card prominent. Compose box at bottom.
- Floating bottom tab bar visible. NO desktop sidebar.`,
  },
  {
    slug: "08-admin-team",
    device: "DESKTOP",
    body: `Design /portal/admin/team — PI-only page for managing team membership.
- Top bar: title "Team" + count + filter chips (Active / Archived / All).
- Main: columnar table — Avatar | Name | Email | Role | Slug | Joined | Last active | Actions.
- Each row: inline-editable Role (PI / Fellow / Postdoc / Coordinator / Mentee). Hover-only Archive + Reset password actions.
- Right rail: "Invite member" form — email input, role dropdown, invite button. Below: pending invites list.`,
  },
  {
    slug: "09-calendar-week-view",
    device: "DESKTOP",
    body: `Design /portal/calendar week view. 7-day horizontal grid, each day a column.
- Top: month name + week range + prev/next/today buttons (44px hit targets).
- Body: 7 columns, each with header (Mon 22 / Tue 23 / ...). Today's column highlighted with teal-subtle bg.
- Events: stacked colored blocks within each column. Color-coded: meeting=teal, deadline=maroon, focus block=gold.
- Time gutter on left: 6am to 10pm in 1-hour rows.
- Floating button: + Add event.`,
  },
  {
    slug: "10-manuscripts-needs-attention",
    device: "DESKTOP",
    body: `Design /portal/manuscripts with a "Needs your attention" dashboard at top showing 3 collapsible subgroups:
1. Pending review response — manuscripts with reviewer comments awaiting reply >7 days. Maroon accent.
2. Stale active revisions — revisions with no activity >30 days. Gold accent.
3. Awaiting submission — revisions complete but not submitted. Teal accent.

Each subgroup shows count pill (amber when >5), expandable list of manuscript rows.

Below: full Manuscripts table (columnar, inline-editable PI + Category).`,
  },
  {
    slug: "11-public-landing",
    device: "DESKTOP",
    body: `Design the PUBLIC marketing landing page for "MN-CCORE Lab" — critical care medicine research lab at University of Minnesota. Visitors: prospective trainees, collaborators, journalists, NIH program officers.

Sections:
- Hero: lab name in Fraunces (PUBLIC site allows editorial display font), one-sentence mission, primary CTA "Meet the team", secondary "Read our publications". Optional ECG heartbeat line motif (HeartbeatLine).
- About: 2-3 sentences on what the lab does (sepsis, mechanical ventilation, ICU clinical informatics).
- Team grid: 19 member cards (photo, name, role, expertise tags). Click → public team profile page.
- Recent work: 3-4 featured publications + 1 recent manuscript.
- Get involved: contact form OR explicit recruiting message if applicable.
- Footer: UMN logo, address, social, GitHub link.

THIS IS THE ONE PLACE Fraunces is allowed for headlines. Portal stays DM Sans only.`,
  },
  {
    slug: "12-hermes-ask-the-lab",
    device: "DESKTOP",
    body: `Design /portal/ask — the team's AI research assistant interface. Hermes is the lab's AI consultant.
- Top bar: page title "Ask the Lab" + Hermes avatar (HermesMark) with online indicator.
- Body: chat-style thread. User messages right-aligned with team member avatar. Hermes messages left-aligned with HermesMark + gold sparkle accent + "Hermes" label.
- Input box at bottom: full-width, sticky. Placeholder "Ask Hermes anything about the lab's research...". Paperclip + @mention support. Submit button = teal solid w/ white text.
- Right rail (collapsible): Recent threads list, click to switch.

Mood: thoughtful research consultant, not chat bot. Quiet, considered. Hermes responses can include citations to lab publications + project links.`,
  },
];

async function downloadToFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function ensureProject(): Promise<string> {
  const cached = resolve(__dirname, ".project-id");
  if (existsSync(cached)) {
    const id = (await readFile(cached, "utf8")).trim();
    if (id) {
      console.log(`  using cached project ${id}`);
      return id;
    }
  }
  const result = await stitch.callTool("create_project", {
    title: "MN-CCORE Lab Hub — design consultant batch",
  });
  // SDK returns { name: "projects/<id>", ... } per the schema
  const fullName = (result as any).name as string | undefined;
  const id = fullName?.split("/").pop();
  if (!id) throw new Error(`unexpected create_project response: ${JSON.stringify(result)}`);
  await writeFile(cached, id);
  console.log(`  created project ${id} (cached for re-runs)`);
  return id;
}

async function fire(projectId: string, def: PromptDef) {
  const fullPrompt = `${DESIGN_SYSTEM}\n\n${def.body}`;
  console.log(`→ ${def.slug} (${def.device})`);
  const project = stitch.project(projectId);
  // Positional args: (prompt, deviceType, modelId). Flash to preserve Pro quota for follow-up edits.
  const screen = await project.generate(fullPrompt, def.device, "GEMINI_3_FLASH");

  const [htmlUrl, imgUrl] = await Promise.all([screen.getHtml(), screen.getImage()]);

  const htmlPath = resolve(DESIGNS_DIR, `${def.slug}.html`);
  const pngPath = resolve(DESIGNS_DIR, `${def.slug}.png`);
  const metaPath = resolve(DESIGNS_DIR, `${def.slug}.json`);

  await Promise.all([
    downloadToFile(htmlUrl as unknown as string, htmlPath),
    downloadToFile(imgUrl as unknown as string, pngPath),
  ]);

  await writeFile(
    metaPath,
    JSON.stringify(
      {
        slug: def.slug,
        device: def.device,
        screenId: (screen as any).id ?? null,
        prompt: def.body,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log(`  ✓ html=${htmlPath}`);
  console.log(`  ✓ png=${pngPath}`);
}

async function main() {
  await loadEnv();
  if (!process.env.STITCH_API_KEY) {
    console.error("✗ STITCH_API_KEY missing — write it to .stitch/.env");
    process.exit(1);
  }

  await mkdir(DESIGNS_DIR, { recursive: true });

  const arg = process.argv[2];
  const target = !arg || arg === "all" ? PROMPTS : PROMPTS.filter((p) => p.slug === arg);
  if (target.length === 0) {
    console.error(`✗ unknown slug: ${arg}`);
    console.error(`  available: ${PROMPTS.map((p) => p.slug).join(", ")}`);
    process.exit(1);
  }

  const projectId = await ensureProject();

  let ok = 0;
  let fail = 0;
  for (const def of target) {
    try {
      await fire(projectId, def);
      ok++;
    } catch (e) {
      fail++;
      console.error(`  ✗ ${def.slug}: ${(e as Error).message}`);
    }
  }
  console.log(`\nbatch complete — ok=${ok} fail=${fail} of ${target.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
