# ProfilePage Audit — `/portal/profile` (Phase 39, shipped 2026-04-28)

**Date**: 2026-04-28
**Agent ID**: `a9c1b17464cd16eec`
**Files reviewed**: `src/pages/portal/ProfilePage.tsx`, `src/components/CalendarFeedsPanel.tsx`, `src/components/InlineSelect.tsx`, `src/data/team.ts`, `src/lib/emailSlug.ts`, `api/helpers.ts`, `api/lib/ics-parser.ts`

## 1. Executive read

- **The page is wired up but undercooked.** All eight self-edit fields render, save, and invalidate two cache keys correctly. The architecture is honest. But the save UX is a 3-second green hint with no undo, no optimistic state, no per-field feedback, and the fields themselves are bare `<input type="text">` boxes with no validation, no affordance, no help text, and no parity with the `▾` inline-edit pattern that defines the rest of the Hub. This page does NOT yet feel like the same product as `/portal/tasks`.
- **Two latent correctness bugs** that will bite within a week of real use: (a) `rawRow` is read from the `['team-raw']` cache, which is *seeded* by the same component via `fetch('/api/team').then(setQueryData)` — it's not a real `useQuery`, so it never refetches, never invalidates against `staleTime`, and after `save.mutate()` the `invalidateQueries({ queryKey: ['team-raw'] })` call **does nothing** because there's no `queryFn` registered for that key. The next blur-save will diff against stale `rawRow`, may re-send a no-op, and the form's source of truth slowly desyncs from the server. (b) The `onBlur` handler sends a PUT *every blur even if the value didn't change*… wait, no — it does check `original`, but the `original` is read from the desync'd `rawRow`. So after one save, every other blur on a touched field re-sends the same value. Not catastrophic, but wrong.
- **Discoverability and the Settings/Profile boundary are unresolved.** Sidebar has "My Profile" (`Sidebar.tsx:102`), but the avatar-click in the sidebar footer goes to `/portal/my-items` (rule 24's footnote, comment at `Sidebar.tsx:343`). CommandPalette has no entry. Settings → Integrations renders the same `<CalendarFeedsPanel />`. There's no story for "what lives on Profile vs Settings" — right now Profile = identity + calendar, Settings = theme + lab thresholds + calendar. Calendar appears on both with zero differentiation. Pick one home and link from the other.

## 2. Surface-by-surface walkthrough

### Header (`PageHeader`)
Generic. Title "My Profile", subtitle "Update your profile and connect your calendar." Fine, but unmemorable. No save status indicator at the page level — the only feedback is the inline `<Save /> Saved` chip way down inside the "About you" section, which scrolls out of view before the user is done editing the bio. A header-level "Saved 3s ago • All changes synced" line, anchored sticky on scroll, would respect the inline-on-blur model AND give the user permission to leave the page.

### Identity card (`ProfilePage.tsx:140-175`)
Two-column flex: avatar left (size=lg, variant=ice), identity stack right. Renders `m.name`, `user?.email`, role pill (gold), member_type pill (slate), and a "View public profile" link. Reads honest. Three problems:

1. **Photo is read-only and silent.** The `photo_url` field is editable below in the grid as a plain text URL input, but the avatar at the top doesn't update until the cache invalidates *and* the fetch completes. There's no preview, no "click to change", no drag-drop, no "use Gravatar" / "use UMN directory photo" suggestion. Users will not know that pasting a URL in the bottom field changes the picture at the top.
2. **No `auto_created` PENDING REVIEW badge for self.** Rule 66 says the badge surfaces on Team page for admins. But the *user* whose row is auto_created should ALSO see it on their own profile, with a link/CTA: "Your role hasn't been assigned yet. Ping your PI or wait for the next sync." Otherwise a new mentee logs in, sees a blank role field, doesn't know if it's broken or pending. `rawRow.auto_created` is on the row but never read.
3. **Slug is hidden.** A user has no way to discover that they are `nate-mesfin` not `mesfin`. This matters for `@mention` autocomplete and for understanding why their tasks bucket the way they do. Surface it as a faint code-style label under the email: `@nate-mesfin`. Not editable, just visible.

### Editable fields section (`ProfilePage.tsx:177-205`)
8 fields in a `grid grid-cols-1 md:grid-cols-2 gap-4` with bio spanning both columns. Each renders via `ProfileField` — a labeled `<input>` or `<textarea>`. The fields:

| Field | Type | Issues |
|---|---|---|
| preferred_name | text | No hint that this is the display name everywhere |
| full_name | text | Same input as preferred_name visually — no hierarchy |
| credentials | text | "(e.g. MD, PhD)" hint is in the *label*, not placeholder. Should be normalized — comma-separated list with chip preview |
| title | text | Free text — UMN structure (Assistant Professor / etc.) suggests typeahead |
| department | text | Same — UMN has 12 departments, this is begging for InlineSelect with custom-write fallback |
| bio | textarea, 3 rows, vertical resize | No char counter, no markdown preview, no length limit. Public Team page renders this as plain text — if user pastes 5 paragraphs, layout breaks |
| photo_url | text | NO URL validation, NO preview, NO upload |
| scholar_id | text | NO format hint (`ZKMVVHkAAAAJ`-shaped, 12 chars), NO link to "find your Google Scholar ID" |

The `<input>` has `outline-none` and inherits `var(--surface-0)` background. There is **no focus ring** beyond the browser default that was just stripped. Tab-navigation works but the focused field is invisible. This breaks WCAG 2.4.7. Add a `focus-visible:ring-2 ring-[var(--teal)]` or matching CSS rule.

There is **no `▾` affordance** anywhere. The design ethos (rule 3) explicitly calls for this — every editable field should signal editability. Plain text inputs with default browser caret-on-click is the opposite of the design ethos. The user can't tell, on first glance, that bio is editable vs read-only.

### Save behavior (`ProfilePage.tsx:91-109`, `187-190`)
- onBlur → if value differs from `original` (read from possibly-stale rawRow) → `save.mutate({ [field]: form[field] })`.
- `mutationFn` does a PUT, throws on non-OK.
- onSuccess → `setSavedAt(Date.now())` + invalidate `['team']` + `['team-raw']` (but `['team-raw']` has no `queryFn`, so the invalidate is a no-op).
- No optimistic update — the form keeps its in-progress value (good), but the underlying `rawRow` doesn't refresh until the user does something else that triggers a `useTeam` refetch. So the next blur-diff on a different field uses pre-save `rawRow`, which is fine for that field but means rapid edits race.
- No `onError` rollback. If the PUT fails, the form value stays — the error message renders below in maroon, but the field still *looks* saved. User has to read maroon text to know.
- No undo. Rule 8 of design ethos: 5-second undo for state changes. Editing your title is a state change. Where's the undo toast?
- No dirty-state tracking. If user types in the bio and refreshes before blur fires, content is lost. Should `beforeunload` warn.

### Calendar feeds (`ProfilePage.tsx:207-218` + `CalendarFeedsPanel.tsx`)
Section header (CalendarIcon teal + "Calendar feeds" + a 2-line muted-paragraph explainer "Read-only — Hub never writes back"). Embeds `<CalendarFeedsPanel />`.

The panel itself (`CalendarFeedsPanel.tsx`) is well-designed for what it is:
- Existing feeds rendered as cards with status pill (connected/error/pending), urlPreview (host-only — good privacy choice per rule 64), last poll timestamp, and a Remove button.
- Add-feed form below with URL input, optional Label, "Add feed" teal button. Provider hints inline ("Google: Settings → Integrate calendar → Secret address in iCal format. iCloud: share calendar → Public Calendar. Outlook: publish calendar → ICS link. Read-only. Polled every ~15 min.")
- Bottom info line: "The URL is the secret — anyone with it can read the calendar. Hub stores it in D1 and never re-displays it after save (you'll see a host preview instead)."

What's missing or weak:
- **No Re-poll Now button.** Rule 64 says polled lazily on Today load when stale > 15 min. If user just added an event in Google Calendar, they cannot force a refresh from the Hub side. Slow feedback loop on first add.
- **No event count.** "Connected" pill is binary — would be far more informative as "Connected • 47 events in next 14d". Validates the parse worked.
- **Delete is a single click with no confirm.** Rule from audit framework #11 — re-confirmation on delete (lose calendar history). At minimum, an inline "Are you sure?" two-step or a toast with undo.
- **No URL validation feedback before submit.** Bad URL → POST 400 → red inline message. Validate client-side that it's `https://` and matches one of the 3 known patterns (`calendar.google.com/calendar/ical/`, `outlook.office365.com/owa/calendar/`, `p\d+-caldav.icloud.com`) — even just a warning chip would help.
- **No preview events.** After paste, before commit, parse client-side or via a `POST /api/integrations/calendar/preview` endpoint that returns "next 5 events" so the user can see "yes that's my calendar, not my coworker's." High trust-building moment.
- **Only one feed per type assumed.** Some users have Work + Personal + Lab On-Call as separate calendars. The UI supports multiple — good — but doesn't enforce ordering, color-coding, or per-feed visibility toggles. Those will be requested.
- **No empty state.** When `feeds.length === 0`, the existing-feeds section just doesn't render. The Add form sits there. A quick visual hook ("No calendars connected yet. Pick a provider →") with provider logos would convert better than a wall of text.

### Locked / read-only fields
Role pill + member_type pill render but there's no inline indicator that they're admin-only. A user mousing over them gets no tooltip explaining "Set by your PI." Not even a `title` attribute. New user clicks role pill expecting it to be editable, nothing happens, confusion. Trivial fix: `title="Set by your PI"` and a tiny lock icon.

For non-PI users editing someone else's profile (which the auth gate blocks) there's no UI path that lets them even *try* — but there's also no UI path that distinguishes "this is YOUR profile" from "this is an admin view of someone else's profile." The page only renders for the user's own row (`slug = emailToSlug(user.email)`); a PI cannot use this page to edit a mentee's profile. Rule 66 says PI can hit `PUT /api/team/:slug` for any row — but the UI doesn't expose that. Either build it, or document why we're shipping a separate "Edit member" admin surface.

### Settings link footer (`ProfilePage.tsx:221-229`)
Single teal text link: "Open full Settings (theme, lab thresholds, etc.)". Functional but lonely. This is the page-end weakness — the user finishes editing, the next-step is unclear. Consider a "Last updated 12 minutes ago • View public profile • Open Settings" footer cluster.

## 3. Findings

| ID | Sev | Surface | Issue | Proposed fix | Effort |
|---|---|---|---|---|---|
| P-01 | **High** | Save flow | `['team-raw']` has no `queryFn`; `invalidateQueries` is a no-op; rawRow desyncs after first save | Replace ad-hoc fetch+setQueryData with a real `useQuery({queryKey:['team-raw'], queryFn})`. Then invalidations work. | S |
| P-02 | High | Editable fields | Plain `<input>` boxes — no `▾` affordance, no focus ring (`outline-none`), no validation | Wrap in shared `EditableField` primitive that renders the chevron, focus ring, and per-type validation | M |
| P-03 | High | Photo | `photo_url` is a text input. Avatar at top doesn't preview. Most users won't realize it's the same field | New `PhotoUrlField` component: paste URL → 64px square preview underneath → "Use UMN directory" / "Use Gravatar" suggestion buttons | M |
| P-04 | High | Auto-created | User with `auto_created=1` doesn't see the PENDING REVIEW state on their own profile | Render the same gold pill from `Team.tsx:343` next to the role pill on the identity card when `rawRow.auto_created` is truthy. Add CTA: "Ping your PI or wait for next sync" | S |
| P-05 | High | Save UX | No optimistic update, no undo, no rollback on error, ephemeral 3s "Saved" hint that scrolls offscreen | Sticky save-status indicator in PageHeader. UndoToast on every save. Optimistic update via `onMutate` + rollback in `onError` | M |
| P-06 | High | Discoverability | Sidebar avatar (footer) routes to `/portal/my-items`, not `/portal/profile`. CommandPalette has no entry. | Add `Cmd+K → "Edit my profile"`. Add a small ⚙ icon next to the sidebar avatar that goes to /portal/profile (avatar click stays at my-items per rule). | S |
| P-07 | Med | Calendar feeds | No "Re-poll now" button per feed; no preview events; no event count on connected pill | Add per-feed `Refresh` action (POST `/api/integrations/calendar/feeds/:id/refresh`); show event-count in pill; client-side parse-and-preview before commit | M |
| P-08 | Med | Calendar feeds | Single-click delete; loss of poll history is silent | Two-step confirm or 5s undo toast (matches rule 8). | S |
| P-09 | Med | Bio | No char counter, no markdown preview, no length cap. Public Team page bio rendering will break with a 5-paragraph paste | 500-char soft limit with counter + 1000 hard cap server-side; render markdown→HTML via existing `formatBrandName` chain | M |
| P-10 | Med | Title / Department | Free text where UMN has known structure | InlineSelect with seeded options + "Other (type custom)" fallback. Department list ≈ 12 entries. | M |
| P-11 | Med | scholar_id | No format hint, no link to "find my ID", no validation | Placeholder `e.g. ZKMVVHkAAAAJ` + helper link "Where do I find this? →" linking to `https://scholar.google.com/citations` | S |
| P-12 | Med | Slug visible | User has no surface to discover their canonical slug | Render `@nick-ingraham` as muted code text under email | XS |
| P-13 | Med | Locked fields | Role + member_type pills look identical to editable values; no tooltip | Add lock icon + `title="Set by your PI"` | XS |
| P-14 | Med | Mobile | InlineSelect / textarea touch targets fine but the URL/Label/Add row stacks on `sm:` — won't fit cleanly on 360px viewport | Force vertical stack <640w; Add button full width | S |
| P-15 | Low | Save behavior | onBlur fires save even on whitespace-only changes; no debounce | Trim before diff; debounce 300ms on textarea | XS |
| P-16 | Low | Public-profile link | Visible in identity card, but useful as a *preview* — not a navigation | Render a "Preview public profile" pop-over of how the public Team card will look, before sending the user away | M |
| P-17 | Low | Empty state | No feeds → just empty space + Add form. Loses an onboarding moment | First-time empty state with provider logos + 1-line "Why connect?" + "Skip for now" | M |
| P-18 | Low | A11y | All `<input>` have `outline-none` with no focus-visible ring; `<textarea>` same | Add `:focus-visible { box-shadow: 0 0 0 2px var(--teal) }` rule | XS |
| P-19 | Low | Brand | Gold role pill uses inline `rgba(201,168,76,0.14)` + `var(--gold)` text — should use `--gold-emphasis` + `--gold-on-emphasis` tokens (rule 42) | Swap to tokens; passes AA without one-off hex math | XS |
| P-20 | Low | Cache races | Two consecutive blur events on different fields race — both diff against same `rawRow`; second save sends only the second field correctly, but `rawRow` only updates after first invalidate completes | Use `onMutate` to write through to the `['team-raw']` cache so subsequent diffs read the fresh value | M |

## 4. Top 5 high-leverage enhancements (this is a fresh page)

1. **Photo upload via R2 (rule references `FileUpload` + `api/routes/uploads.ts`).** Phase 28 shipped R2 file uploads with drag-drop. The infra is already there. Building a proper `<PhotoUploader>` that takes a file, uploads to R2, and saves the resulting URL into `photo_url` is a one-day ship that turns this from a "paste-a-URL" page into a real profile editor. Bonus: square crop preview and "remove photo" affordance. This is the single biggest quality leap available.

2. **Notification preferences live on Profile, not Settings.** Right now there's no UI for "email me digest at 7am vs 9am", "mute @hermes responses", "DM-only mentions". These are *personal* — they belong on Profile, not Settings (which is for theme/lab thresholds — note "lab thresholds" implies cross-team, "theme" is only-personal but historically settings-y). Add a `NotificationsPanel` under the calendar section: digest_time, mentions_email, weekly_digest_email, today_summary_email. All four are 1-day endpoints + cache-invalidation that will save Nick from manually editing rows for new joiners.

3. **"What people see" preview.** Static side-by-side: left = the form, right = a live `<TeamMemberCard>` renderable preview (the same one that renders on `/team` and `/portal/team/:slug`). User edits bio → preview updates. Solves three problems at once: (a) makes save status obvious, (b) shows the visible-to-team consequence of every field, (c) doubles as the "View public profile" CTA without leaving the page. This is THE upgrade that takes the page from "form" to "operating surface."

4. **Calendar timeline preview.** Below the feeds list, render a tiny 7-day strip showing the next 14 days of events from each feed, color-coded per feed. Validates that parse worked, shows overlapping meetings (per rule 59 coral = overlap), and gives the user a confidence signal before they trust the feed on Today. ~150 lines including a thin DAY → events join from `user_calendar_events`.

5. **PI admin overlay (multi-row edit).** Rule 66 says PI can `PUT /api/team/:slug` for any row, including `role` + `member_type`. Right now there is no UI path — Nick edits team_members rows in D1 manually or via this page only for himself. Add a "Manage team" mode visible only to PI emails: a dropdown at the top of ProfilePage that switches the editing context to any other team member. Same form, same component, different `slug`. Closes a real workflow gap (assigning role to an auto_created member) without a separate admin page.

## 5. Profile vs Settings boundary observations

Currently:
- **Profile** = identity (name, bio, photo, scholar) + calendar feeds + footer link to Settings.
- **Settings → Integrations tab** = wraps the SAME `<CalendarFeedsPanel />`.
- **Settings → other tabs** = theme, lab thresholds, dashboard customize, etc.

Two surfaces showing the identical CalendarFeedsPanel is a tell that the boundary isn't decided. My recommendation:

- **Profile = personal + visible to others.** Identity, photo, bio, scholar, public-profile preview, **calendar feeds (this is personal)**, **notification preferences (personal)**.
- **Settings = workspace + invisible to others.** Theme, density, dashboard layout, lab thresholds (`labprefs.v1` per rule 54), keyboard shortcuts cheat sheet, sign-out, account-delete-request, debug toggles.
- **Calendar feeds belong on Profile**, not Settings. Settings → Integrations should redirect or remove the panel and link to /portal/profile#calendar instead. Otherwise users encounter the same panel twice and wonder if changes propagate (they do, per `calendar-feeds` cache key — but that's an implementation detail, not a UX answer).

A second cut: **Profile is where I tell the team about me; Settings is where I tell the Hub how I work.**

## 6. Brand & design-system observations

- **Inline color literals everywhere** instead of tokens (`'rgba(201,168,76,0.14)'`, `'rgba(255,255,255,0.06)'`, `'rgba(110,232,154,0.12)'`, `'rgba(240,115,126,0.12)'`). The `--gold-emphasis`, `--teal-emphasis`, `--maroon-emphasis`, `--green-emphasis` semantic tokens already exist (Phase 31). This page bypasses them. Each inline rgba is a future axe-failure waiting for a theme change.
- **`font-semibold` on h2/h3** — page uses Tailwind `font-semibold` (=600). Per rule 4, `--weight-heading: 600` is the right *value* but the project convention is `style={{ fontWeight: 'var(--weight-heading)' }}`, not the class. Audit B-visual r7 fixed this in 57+ files, this new page reintroduces it.
- **Hardcoded `text-[10px]` and `text-[11px]`** instead of `--text-caption` / `--text-label` tokens. Rule says all type uses tokens. Three sites in CalendarFeedsPanel, two in ProfilePage. Trivial fix.
- **No `HeartbeatDivider`** — the lab's signature ECG motif (rule 29). A profile page is exactly the right place to slip the brand in. Between identity card and "About you," replace the implicit gap with a `<HeartbeatDivider />`. Two-character branding moment.
- **Avatar at `size="lg" variant="ice"`** — fine, but the ice variant (cream-bg) on `--surface-1` (very dark) reduces the avatar's contrast. Switch to `variant="dark"` or default to match the page. This is the user's *photo*, it should pop.
- **No ScrollToTop interaction.** Page is short now but bio + feed list will grow. Already provided by PortalLayout.
- **Mobile**: tested in head, the URL/Label/Add row goes vertical at `<640w` (good) but the URL field + label-input + button button stack means the button ends up below the fold on a 360w viewport when the keyboard is up. Add a fixed-position save indicator or a sticky bottom-bar.
- **`<input type="url">`** is correctly used in CalendarFeedsPanel for the iCal URL input but `photo_url` in ProfilePage is `type="text"` — should be `type="url"` so mobile keyboards bring up the URL keyboard.

## 7. Edge cases / failure modes

- **First-login race.** A user logs in, `ensureTeamMember` provisions the row asynchronously, the user navigates straight to `/portal/profile` before the provision finishes. `useTeam` returns 19 rows, none match `slug = nick-ingraham` for the new user. Page renders `"No profile yet… visit any portal page to trigger auto-create"` (line 124-128). That's correct fallback but annoying — the auth flow already triggered ensureTeamMember on the JWT verify, so by the time React hydrates, the row should exist. Worth a 500ms retry-with-backoff on this branch.
- **Two browser tabs editing the same field.** Tab A types "Senior Resident", tab B types "PGY-3". Both blur. Last write wins. There is no realtime sync of the form state. Rule 49 (presence) doesn't extend to ProfilePage. Add `usePresence('team_member', slug)` so the user at least sees "Editing on another device" warning when their own slug shows multiple peers.
- **Calendar feed URL reused across tenants.** A user pastes the same URL twice (different label). Server probably accepts both; results in 2x events on Today timeline. Add a unique constraint on `(team_member_id, url_hash)` server-side and show a friendly error.
- **Calendar feed token revoked at Google side.** Google's "Secret address" can be reset by user → next poll fails. `lastError` populates. UI shows red "error" pill but no actionable next-step. Add a "Re-paste URL" button on error rows.
- **Photo URL points at a 404.** Avatar component should fall back to initials but most fallback chains break on 403/CORS. Add `onError` handler in Avatar to clear the src and show initials.
- **Bio with `<script>` or HTML.** Currently rendered as plain text in Team page (presumed safe). If we add markdown rendering per P-09, we need DOMPurify in the chain.
- **scholar_id invalid format.** API doesn't validate. User pastes a Scholar profile URL by accident (`https://scholar.google.com/citations?user=ZKMVVHkAAAAJ`). The whole URL is saved as the scholar_id, breaks downstream `/scholar/${id}` links. Validate with regex `/^[A-Za-z0-9_-]{12}$/` and offer to extract from URL.
- **Slug rename.** If admin renames a slug (rare but possible — Phase 36b did 19), all the user's calendar feeds, file attachments, notifications, etc. need to follow. Currently `team_members.slug` is the FK target everywhere. ProfilePage doesn't expose a slug-rename button (good), but the system has no migration path either.
- **PI loses PI status.** `lab_settings.pi_emails` is editable. If Nick's email is removed mid-session, the next PUT lands on `!isPi` and 403s on role/member_type fields. That's correct behavior, but the UI doesn't reload the auth context, so the page still shows the role/member_type pills as editable-looking. Listen for 403 and downgrade UI.
- **Auto-created flag never clears.** `team.ts:101-102` clears `auto_created` only when `body.role` is present and non-empty. If the PI saves the row via this page WITHOUT setting role (just edits the bio for the new user), the badge stays. That's defensible. But a user editing their OWN auto_created row will never clear it themselves. Probably correct — only PI assigning role should clear.

## 8. Open questions for PI

1. **Should photo upload land here, or stay in admin?** R2 infra exists. Cost of self-serve photo upload is real (storage, moderation). Worth it?
2. **Is there a "preferred pronouns" field needed?** Not in current schema. UMN trend says yes. Cheap to add.
3. **Should the calendar feed UI distinguish "personal" vs "lab on-call" feeds?** I see the schema supports `label` only — no type. If the lab has a shared on-call calendar, multiple users may add the same URL. Worth a `feed_type` column?
4. **PI multi-row edit on Profile page (top-5 #5) — or separate `/portal/admin/team` surface?** The single-form approach is the smaller ship. The admin surface is the cleaner mental model. Pick one.
5. **What's the canonical home for notification preferences?** Currently nowhere. Settings is the obvious answer but Profile makes more sense by my read.
6. **Should the PENDING REVIEW badge render to the user themselves (P-04)?** Some teams hide it from the user (avoid embarrassment). Some surface it (drives the user to nudge their PI). Your call on social dynamics.
7. **Is there a use case for editing someone else's profile from this page (rule 66 says yes)?** If yes, the URL should be `/portal/profile/:slug` with self-default. If no, leave as-is.
8. **Bio length cap?** I'm proposing 500 soft / 1000 hard. The Team page card layout breaks at ~280 chars in current width. Are you OK enforcing a UI limit even if some users want long bios?
9. **`/portal/settings#integrations` calendar feed panel — kill or keep?** Showing the same UI in two places is the kind of negative-space drift that bit on the Airtable funeral (CLAUDE.md "Before Disabling / Retiring" section). Worth a one-line decision.
10. **Should the avatar in Sidebar footer go to `/portal/profile` instead of `/portal/my-items`?** The 2026-04-22 r7 comment in `Sidebar.tsx:343` reads "Nick expected his own working page" — but for the rest of the team, who never asked for a "personal workspace," the Profile link is more discoverable. Worth re-deciding for non-PI users specifically.
