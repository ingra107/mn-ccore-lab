// Rule 74 icon discipline — ONE shared recipe (was duplicated in Sidebar +
// MobileTabBar; /simplify consolidation 2026-06-11). Lucide's default
// strokeWidth 2 on its 24-grid scales to a fuzzy ~1.5px at sizes ≤20 with no
// pixel alignment; a true 1.5px absolute stroke renders crisp. Spread onto
// any lucide icon rendered at ≤20px:
//   <Icon size={18} {...ICON_PROPS} />
export const ICON_PROPS = { strokeWidth: 1.5, absoluteStrokeWidth: true } as const
