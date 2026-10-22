import { Link } from 'react-router-dom'
import InlineSelect from '../InlineSelect'
import { PATHS } from '../../constants/paths'
import { useSetProductStage } from '../../hooks/useProjectProducts'
import { ladderFor, listStageView, productKindLabel, sortProducts, withoutDeclined, type ProductKind, type ProductRow } from '../../lib/products'

// The Projects list's Stage cell (Nick, bracket 2026-10-11: "chips if there
// are multiple products but a ladder if there's only one"):
//   one product  -> a small ladder (dots) with the current stage; picking a
//                   stage writes that product through the project's route
//   2+ products  -> chips: the home (or first) product's name and stage, then
//                   "+N"; the tip lists every product; they open the project
//                   page, where each product has its own ladder
//   no product   -> nothing to set (a project from before the backfill)
// It replaces the project-stage select: the stage belongs to a product.

// One readable chip beats two truncated to "M…" (measured in the 168px column).
const CHIPS_SHOWN = 1

export default function ProductStageCell({
  slug, products, kinds,
}: { slug: string; products: ProductRow[] | undefined; kinds: ProductKind[] }) {
  const view = listStageView(products)
  if (view === 'none') return <span className="sr-m">—</span>
  const live = withoutDeclined(products!)
  if (view === 'chips') return <ProductChips slug={slug} products={sortProducts(live)} />
  return <ProductLadder slug={slug} product={live[0]} kinds={kinds} testId={`list-stage-ladder-${slug}`} />
}

/** One product's ladder: dots plus the stage word, a select that writes the
 *  product's stage through its project's route (compare-and-swap). Used by the
 *  Projects list cell and the Manuscripts page's kind tabs. */
export function ProductLadder({ slug, product, kinds, testId }: {
  slug: string; product: ProductRow; kinds: ProductKind[]; testId: string
}) {
  const ladder = ladderFor(kinds, product.kind)
  const setStage = useSetProductStage()
  const idx = ladder.findIndex((s) => s.stage === product.stage)
  const display = (
    <span className="psc-l" aria-label={`Stage: ${product.stage_label}`}>
      {idx >= 0 && (
        <span className="psc-dots" aria-hidden="true">
          {ladder.map((s, i) => (
            <span key={s.stage} className={`psc-d${i < idx ? ' is-past' : ''}${i === idx ? ' is-on' : ''}`} />
          ))}
        </span>
      )}
      <span className="sr-m sr-hi">{product.stage_label}</span>
    </span>
  )
  return (
    <span data-testid={testId}>
      <InlineSelect
        value={product.stage}
        options={ladder.map((s) => ({ value: s.stage, label: s.label }))}
        onChange={(stage) => {
          if (stage === product.stage) return
          const label = ladder.find((s) => s.stage === stage)?.label ?? stage
          setStage.mutate({
            slug, productId: product.id, stage, label, productName: productKindLabel(product),
            seen: { seq: product.seq, stage: product.stage, label: product.stage_label },
          })
        }}
        display={display}
      />
      <style>{CELL_CSS}</style>
    </span>
  )
}

function ProductChips({ slug, products }: { slug: string; products: ProductRow[] }) {
  const shown = products.slice(0, CHIPS_SHOWN)
  const more = products.length - shown.length
  const all = products.map((p) => `${productKindLabel(p)} (${p.stage_label})`).join(' · ')
  return (
    <Link
      to={PATHS.project(slug)}
      className="psc-chips tip"
      data-tip={all}
      aria-label={`${products.length} products. ${all}`}
      data-testid={`list-stage-chips-${slug}`}
    >
      {shown.map((p) => (
        <span key={p.id} className="psc-chip">
          <span className="psc-cn">{productKindLabel(p)}</span>
          <span className="psc-cs">{p.stage_label}</span>
        </span>
      ))}
      {more > 0 && <span className="psc-more">+{more}</span>}
      <style>{CELL_CSS}</style>
    </Link>
  )
}

// Tokens only; the accent marks "current", the rest is the gray ramp.
const CELL_CSS = `
.psc-l { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.psc-dots { display: inline-flex; align-items: center; gap: 2px; flex: 0 0 auto; }
.psc-d { width: 5px; height: 5px; border-radius: var(--radius-circle); background: var(--sk-line2); }
.psc-d.is-past { background: color-mix(in srgb, var(--job-accent) 55%, transparent); }
.psc-d.is-on { width: 7px; height: 7px; background: var(--job-accent); }
.psc-chips { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; text-decoration: none; overflow: hidden; }
.psc-chip {
  display: inline-flex; align-items: baseline; gap: 4px; min-width: 0; flex: 0 1 auto;
  padding: 1px 6px; border: 1px solid var(--sk-line2); border-radius: var(--radius-full);
  font-size: 11px; color: var(--sk-t2); white-space: nowrap;
}
.psc-cn { overflow: hidden; text-overflow: ellipsis; min-width: 0; max-width: 84px; }
.psc-cs { color: var(--sk-t3); }
.psc-more { font-size: 11px; color: var(--sk-t3); flex: 0 0 auto; }
.psc-chips:hover .psc-chip { color: var(--sk-t1); }
`
