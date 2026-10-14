// The co-authorship graph draws on a dark canvas in BOTH themes (public.css
// .pub-net), so every panel laid over it uses this fixed dark surface and
// light ink. PANEL_BG (var(--task-panel-bg)) flips to #ffffff in light mode,
// which put white text on a near-white panel (G12-2, 2026-10-14). This is the
// dark --task-panel-bg value, pinned.
export const GRAPH_PANEL_BG = '#0f1923'
