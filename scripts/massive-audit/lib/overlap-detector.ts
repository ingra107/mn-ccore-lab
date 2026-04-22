/**
 * Z-index + bounding-box overlap detector.
 *
 * Finds elements that visually overlap another with LOWER z-index, and the
 * lower element is occluded (its content not reachable via mouse). Catches
 * accidental sticky-header obscuring data, modal-behind-dropdown, etc.
 *
 * Runs entirely in-page via page.evaluate so DOM walking is fast.
 */
import type { Page } from '@playwright/test'

export interface OverlapHit {
  upper: { tag: string; id?: string; classes: string; z: string; box: BBox }
  lower: { tag: string; id?: string; classes: string; z: string; box: BBox }
  occlusionPct: number
}

interface BBox {
  x: number
  y: number
  width: number
  height: number
}

// NOTE: pass overlap-detection script as a plain string, NOT a tsx-compiled
// arrow. tsx wraps named function declarations in `__name(fn,"name")` calls
// for class-name preservation; those references break in the browser context
// where __name is undefined. String-evaluation skips that pipeline.
const OVERLAP_DETECTOR_SCRIPT = `(() => {
  const positioned = [];
  document.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute' && cs.position !== 'sticky') return;
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    if (r.right < 0 || r.left > window.innerWidth) return;
    positioned.push(el);
  });
  const zNum = (el) => {
    const n = parseInt(getComputedStyle(el).zIndex, 10);
    return Number.isNaN(n) ? 0 : n;
  };
  const bbox = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const intersect = (a, b) => {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    const w = x2 - x1, h = y2 - y1;
    return w > 0 && h > 0 ? w * h : 0;
  };
  const describe = (el) => {
    const cs = getComputedStyle(el);
    const cls = (el.className && typeof el.className === 'string') ? el.className : (el.getAttribute('class') || '');
    return { tag: el.tagName.toLowerCase(), id: el.id || undefined, classes: cls.slice(0, 80), z: cs.zIndex, box: bbox(el) };
  };
  const hits = [];
  for (let i = 0; i < positioned.length; i++) {
    for (let j = 0; j < positioned.length; j++) {
      if (i === j) continue;
      const upper = positioned[i], lower = positioned[j];
      if (upper.contains(lower) || lower.contains(upper)) continue;
      if (zNum(upper) <= zNum(lower)) continue;
      const bU = bbox(upper), bL = bbox(lower);
      const overlap = intersect(bU, bL);
      if (overlap === 0) continue;
      const lowerArea = bL.width * bL.height;
      const occlusion = overlap / lowerArea;
      if (occlusion < 0.05) continue;
      const upperCls = ((upper.className && typeof upper.className === 'string') ? upper.className : '').toLowerCase();
      const lowerCls = ((lower.className && typeof lower.className === 'string') ? lower.className : '').toLowerCase();
      const upperTag = upper.tagName.toLowerCase();
      // Semantic landmarks (nav/header/aside) + ARIA roles are chrome — by
      // definition they overlay content. Skip any overlap where the upper is
      // one of these, regardless of what's beneath. Prevents MobileTabBar from
      // spamming every page with nav-over-content "hits".
      const upperRole = upper.getAttribute && upper.getAttribute('role');
      if (upperTag === 'nav' || upperTag === 'header' || upperTag === 'aside' || upperTag === 'footer') continue;
      if (upperRole === 'navigation' || upperRole === 'banner' || upperRole === 'complementary' || upperRole === 'contentinfo') continue;
      if ((upperCls.includes('header') || upperCls.includes('nav') || upperCls.includes('sidebar')) &&
          (lowerCls.includes('main') || lowerCls.includes('content'))) continue;
      if (lowerCls.includes('backdrop') || lowerCls.includes('overlay')) continue;
      hits.push({ upper: describe(upper), lower: describe(lower), occlusionPct: Math.round(occlusion * 100) });
    }
  }
  const seen = new Set();
  return hits.filter((h) => {
    const k = h.upper.tag + '.' + h.upper.classes + '|' + h.lower.tag + '.' + h.lower.classes + '|' + h.occlusionPct;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
})()`

export async function detectOverlaps(page: Page): Promise<OverlapHit[]> {
  return page.evaluate(OVERLAP_DETECTOR_SCRIPT) as Promise<OverlapHit[]>
}

export interface OverflowResult {
  bodyScrollWidth: number
  clientWidth: number
  hasOverflow: boolean
}

export async function detectHorizontalOverflow(page: Page): Promise<OverflowResult> {
  return page.evaluate(() => ({
    bodyScrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }))
}
