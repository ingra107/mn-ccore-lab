**1. Layout Model**

Use a **normal-flow proportional agenda grid**: one parent CSS grid owns vertical flow, with each agenda unit rendered in document flow and given a **duration frame** whose `min-height = max(readableFloor, minutes * PX_PER_MIN)`. Expanded notes render **inside the same flow item but below the duration frame**, opaque, so later rows are pushed down without any absolute sibling collision. Overlaps are one in-flow `AgendaOverlapRegion` whose base frame height equals the overlap span; inside it, columns are a horizontal CSS grid/flex row, with per-column top spacers preserving start offsets. Service blocks are in the same agenda grid’s right 25% service column as semi-transparent grid items spanning their time rows; meeting/gap content spans over/into that column at a higher z-index. This replaces the current absolute canvas (`position: relative`, fixed `height`) in `Timeline.tsx:631-639`, absolute drop overlays in `Timeline.tsx:683-786`, absolute event blocks in `Timeline.tsx:788-876`, and the boxed service rail in `Timeline.tsx:916-960`.

```text
AgendaGrid rows are normal flow, each row has proportional base height

┌ time ┬ agenda content, z=2 ───────────────┬ service 25%, z=1 ┐
│ 7 AM │ [drop gap: 210 min base frame]     │                  │
│      │                                    │  7-3 service blk  │
│10:30 │ [10:30-11:30 meeting base frame]  │  transparent      │
│      │   [opaque notes expand here]       │                  │
│12:00 │ [12-1 meeting]                     │                  │
│1:30  │ [overlap region, columns side-by-side]                 │
│      │ col A: 1:30-2   spacer 0           │                  │
│      │ col B: spacer 30m; 2-3; 2:30-3:30 │                  │
└──────┴────────────────────────────────────┴──────────────────┘
```

**2. Data Transform**

Keep `LONG_EVENT_MIN = 180` from `constants.ts:62-64`, but stop treating long timed blocks as a detached rail. Current code splits `railEvents`, `longTimedBlocks`, and `flowMeetings` at `Timeline.tsx:395-407`; replace that with `allDayEvents`, `serviceBlocks`, and `agendaEvents`.

```ts
const duration = (e) =>
  typeof e.startMin === 'number' && typeof e.endMin === 'number'
    ? e.endMin - e.startMin
    : 30

const isService = (e) =>
  !e.isAllDay &&
  typeof e.startMin === 'number' &&
  duration(e) >= LONG_EVENT_MIN

allDayEvents = visibleMeetings.filter(e => e.isAllDay)
serviceBlocks = visibleMeetings.filter(isService)
agendaEvents = visibleMeetings.filter(e => !e.isAllDay && !isService)

timed = agendaEvents.filter(has startMin).sort(start, end)
untimed = agendaEvents.filter(no startMin)

clusters = []
for timed event in sorted order:
  if no active cluster or event.start >= currentCluster.maxEnd:
    flush current cluster
    start new cluster
  else:
    add to current cluster
    currentCluster.maxEnd = max(currentCluster.maxEnd, event.end ?? start + 30)

agendaUnits = [
  ...untimed.map(single untimed unit),
  gaps + timed clusters in chronological order
]

prevEnd = dayStart
for each timed cluster:
  if cluster.start > prevEnd:
    push GapUnit({
      start: prevEnd,
      end: cluster.start,
      freeMinutes: cluster.start - prevEnd,
      slot: `between-${nextGlobalIdx}`,
      baseHeight: pxForGap(freeMinutes),
    })

  if cluster.events.length === 1:
    push MeetingUnit({
      event,
      start,
      end,
      minutes: end - start,
      baseHeight: pxForMeeting(minutes),
    })
  else:
    push OverlapUnit({
      events,
      start: min(starts),
      end: max(ends),
      spanMinutes: end - start,
      baseHeight: pxForMeeting(spanMinutes),
      columns: packColumns(events),
    })

  prevEnd = max(prevEnd, cluster.end)

push trailing GapUnit from prevEnd to dayEnd
```

Height rules:

```ts
const PX_PER_MIN = 0.6 // existing Timeline.tsx:128
const MEETING_FLOOR = 40 // replaces MIN_BLOCK_H=24 from Timeline.tsx:130-132
const GAP_FLOOR = 28
const pxForMeeting = (min) => Math.max(MEETING_FLOOR, Math.round(min * PX_PER_MIN))
const pxForGap = (min) => Math.max(GAP_FLOOR, Math.round(min * PX_PER_MIN))
```

Gap free minutes are based only on **agenda meetings**, not service blocks. A 7 AM-3 PM service block does not consume draggable free time.

**3. Component Tree**

`Timeline`
Keeps note autosave from `Timeline.tsx:489-526`, dismissed meeting state, and all-day banner rendering from `Timeline.tsx:549-568`.

`buildAgendaModel(events)`
New pure helper, probably in `src/components/today/agendaModel.ts`, replacing the current `timedClusters`, `timedClusterBounds`, `canvasHeight`, `canvasW`, and `ResizeObserver` logic in `Timeline.tsx:438-514`.

`AgendaGrid`
New component. CSS grid with columns:

```css
grid-template-columns:
  44px
  minmax(0, 1fr)
  minmax(96px, 25%);
```

Rows are rendered by normal-flow children, not absolute `top`.

`AgendaGapRow`
In-flow drop target. Replaces `DropZone` / `AbsoluteDropZone` split. Delete `AbsoluteDropZone` entirely from `Timeline.tsx:221-284`.

`AgendaMeetingRow`
Wraps/reuses `EventRow`, but `EventRow` should stop using one outer `minHeight` for the whole expanded surface. Current `EventRow` puts `minHeight` on the full wrapper at `MeetingRow.tsx:25`; change to a duration shell plus notes below.

`AgendaOverlapRegion`
Replaces `OverlapBand` for timed overlaps. Delete the conflict badge/text behavior in `OverlapBand.tsx:55-82` and `OverlapBand.tsx:111-112`, or delete `OverlapBand.tsx` if no untimed path needs it. No “Overlap”, no “Conflict”, no warning copy.

`AgendaServiceLayer` / `ServiceBlock`
New transparent right-quarter layer. Replaces the compact service strip at `Timeline.tsx:916-960`.

Delete:
`AbsoluteDropZone`, absolute canvas wrapper, `TimeRuler` as absolute full-canvas ruler (`Timeline.tsx:286-340`), absolute now-line placement, absolute event wrappers, `canvasWrapRef`, `canvasW`, `ResizeObserver`, old boxed long-block rail, and phone stacking from `OverlapBand.tsx:35-42`.

**4. Refinements -> Concrete Mechanism**

1. Proportional duration stays visible: every meeting, gap, and overlap group has a duration frame with `min-height = minutes * PX_PER_MIN` plus a readable floor. A 60-minute event is visibly taller than 30 minutes; a 90-minute event is taller again. The left time spine also shows exact start/end labels so expanded notes do not destroy the duration signal.

2. Overlaps side-by-side, no label: `AgendaOverlapRegion` uses `packColumns()` from `Timeline.tsx:151-196`, but renders columns in normal flow. No coral badge, no explanatory conflict copy, no mobile stacking. If the screen is too narrow, the overlap region scrolls horizontally with `minmax(160px, 1fr)` columns.

3. Service blocks >=3h transparent right quarter: `serviceBlocks` render in the right grid column, `opacity`/alpha background, `z-index: 1`, and span their own start/end rows. Agenda content uses `grid-column: agenda / service-end` and `z-index: 2`, so meetings can visually overlap into the service area.

4. Solid drag-and-drop: gaps are actual flow rows, not transparent absolute overlays. Each `AgendaGapRow` has a visible hover/dragover state, a proportional height for real free time, a target floor for tiny gaps, and renders planned tasks inside the same row before the next meeting.

**5. Non-Negotiables**

Opaque expand surface: guaranteed by `EventRow` notes being normal child content with solid/opaque background, not an overflow-visible floating panel. Current transparency bleed comes from the absolute workaround described around `Timeline.tsx:788-791`.

No absolute-sibling overlap/bleed: guaranteed by removing absolute event/drop positioning from `Timeline.tsx:683-876`. Agenda rows and note panels are in grid/flex normal flow.

Readable side-by-side overlap: guaranteed by column packing plus minimum column width. When width is insufficient, horizontal scroll preserves columns instead of collapsing to stacked conflict cards.

Visible proportional duration: guaranteed by duration frames and left time spine. Expanded notes add non-time height below the frame; they do not become the duration signal.

Unmistakable drop targets: guaranteed by real `AgendaGapRow` components with floor height, visible dragover styling, labels, and planned tasks rendered inside the target.

**6. Phased Build Order**

1. Build `buildAgendaModel()` and snapshot/log the real-day model:
7:00-10:30 gap, 10:30-11:30 meeting, 11:30-12:00 gap, 12:00-1:00 meeting, 1:00-1:30 gap, 1:30-3:30 overlap group, trailing gap. Verify the 7 AM-3 PM service block is separate and does not consume gaps.

2. Replace the absolute timed canvas with `AgendaGrid` using proportional flow rows. Screenshot dark and light themes. Verify the 10:30, 12:00, and afternoon blocks are vertically proportional and no absolute overlays remain.

3. Implement `AgendaOverlapRegion`. Screenshot the afternoon case: 1:30-2:00, 2:00-3:00, and 2:30-3:30 must be side-by-side where they collide, readable, and have no conflict label.

4. Move service blocks into the transparent right-quarter lane. Screenshot the 7 AM-3 PM service block: it spans through the morning and early afternoon, stays translucent, and meetings render over/into it instead of being pushed into a boxed rail.

5. Rework note expansion inside `EventRow`. Screenshot expanded notes on the 10:30 meeting and one afternoon overlap card. Later rows must move down; no notes panel may visually cover a sibling.

6. Rebuild drop rows. Drag a planned task into the 11:30-12:00 gap, 1:00-1:30 gap, and trailing gap. Verify the row accepts the drop, shows the task in the correct `between-N` slot, and does not require invisible absolute hit areas.