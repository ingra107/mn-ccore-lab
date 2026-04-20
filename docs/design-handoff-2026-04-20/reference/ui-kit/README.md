# MN-CCORE Hub UI Kit

Clickable recreation of the Hub's core operations surfaces. Dark-first, columnar, dense.

## Screens (click the sidebar)
- **Dashboard** — hero + 4 metrics + "Due today" + activity feed
- **Tasks** — dense table with inline-edit affordances + detail panel (incl. Hermes comment)
- **Projects** — columnar list with domain chips, progress bars, team stacks, grant links
- **Meetings** — upcoming list + agenda detail panel
- **Hermes** — AI research assistant chat with grounded citations

Other nav items (My items, Grants, Digest, Team) are scaffolded with a "Coming soon" placeholder — documented in the Hub repo but not yet mocked here.

## Files
- `index.html` — app shell (open this)
- `shared.jsx` — icons (inline SVG, Lucide-style), Heartbeat, Wordmark, Avatar, Chip, Button, Kbd
- `Shell.jsx` — SideBar + TopBar
- `Dashboard.jsx`, `Tasks.jsx`, `Projects.jsx`, `Meetings.jsx`, `Hermes.jsx`

## Fidelity notes
- Colors, type, spacing, radii, shadows all pulled from `reference/hub-index.css` (first ~200 lines = token source of truth).
- The wordmark is a re-creation in JSX; for production use `assets/mnccore-logo-dark.svg` directly.
- Icons are simple inline SVG approximations of Lucide (the Hub's icon library). For production, import from `lucide-react`.
- Data is hand-curated to match real project names (CLIF epi of sedation, FLAME-ICU, OHCA-RL, proning incidence) from the repo's README and PROJECT.md.
