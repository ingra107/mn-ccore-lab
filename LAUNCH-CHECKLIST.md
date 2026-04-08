# MN-CCORE Lab Hub — Launch Checklist (April 21, 2026)

## Prerequisites (Nick must do)

### 1. Refresh Wrangler Auth
```bash
cd /c/Users/ingra107/mn-ccore-lab
npx wrangler login
```

### 2. Apply D1 Schema (subtasks table)
```bash
npx wrangler d1 execute mnccore-lab --remote --file=api/schema-v10.sql
```

### 3. Set SendGrid API Key
```bash
npx wrangler secret put SENDGRID_API_KEY
# Paste the key when prompted
```

### 4. Re-enable Cloudflare Access
Configure in Cloudflare dashboard → Access → Applications:
- Create application for `mn-ccore-lab.pages.dev`
- Restrict paths: `/dashboard*`, `/personal*`, `/my-items*`, `/tasks*`, `/calendar*`, `/deadlines*`, `/projects*`, `/manuscripts*`, `/ideas*`, `/search*`, `/meetings*`, `/activity*`, `/analytics*`, `/settings*`, `/meeting-notes*`
- Allow: `@umn.edu` email domain
- Public paths (no auth): `/`, `/team*`, `/publications*`, `/network*`, `/contact*`, `/pulse*`, `/digest*`

### 5. Team Headshots (7 missing)
- Collect from team members or LinkedIn
- Upload to appropriate hosting (Cloudflare Images or static)
- Update `src/data/team.ts` photoUrl fields

### 6. Nate Mesfin Google Scholar ID
- Find on Google Scholar
- Update in `src/data/team.ts` scholarId field

## Verification (after prerequisites)

### 7. Install Playwright & Run Smoke Tests
```bash
npm install -D @playwright/test
npx playwright install chromium
npm run test:smoke
```

### 8. Final Deploy
```bash
npm run build && npx wrangler pages deploy dist --project-name mn-ccore-lab
```

### 9. Verify Live Site
- [ ] Home page loads
- [ ] Dashboard loads with cards
- [ ] Tasks page: create, edit, subtasks, peek overlay, bulk select
- [ ] Meetings page: agenda drag-drop reorder
- [ ] Search returns ranked results
- [ ] Dark mode toggle works on all pages
- [ ] Mobile layout works (test on phone)

## Status

| Item | Status |
|------|--------|
| Code complete | Done (496+ commits, Phases 1-26aq) |
| D1 schema | v27 applied (43 tables) |
| Dark mode + mobile | Done |
| Wrangler auth | Needs refresh |
| SendGrid | Needs key |
| Cloudflare Access | Needs config |
| Headshots | Needs team |
| Scholar ID | Needs lookup |
| Playwright tests | Ready to install |
