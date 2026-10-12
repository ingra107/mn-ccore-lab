import { Link } from 'react-router-dom'
import { PATHS } from '../../constants/paths'
import { projectFullTitleHint, projectShortLabel } from '../../lib/displayNames'
import { productLabel, type KindRow, type ProductKind } from '../../lib/products'
import { ProductLadder } from './ProductStageCell'

// The Manuscripts page's non-manuscript tabs (Nick 2026-10-12: "to have the
// option to just see abstracts and grants ... would be a simple view thing").
// A row is a PRODUCT, not a project: a project with an A0 and an A1 grant
// application shows both under Grants, each with its own stage. Every row
// names its project (short name), the product, and the product's ladder,
// which writes through the project's member route like every other ladder.

export default function ProductKindList({
  rows, kinds, grouped,
}: { rows: KindRow[]; kinds: ProductKind[]; grouped: boolean }) {
  if (rows.length === 0) {
    return <p className="pkl-empty">No products of this kind on the projects you can see.</p>
  }
  const groups: { kind: string; label: string; rows: KindRow[] }[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.kind === r.product.kind) last.rows.push(r)
    else groups.push({ kind: r.product.kind, label: kinds.find((k) => k.kind === r.product.kind)?.plural_label ?? r.product.kind_label, rows: [r] })
  }
  return (
    <div className="pkl" data-testid="product-kind-list">
      {groups.map((g) => (
        <section key={g.kind} aria-label={g.label}>
          {grouped && (
            <h3 className="pkl-h">{g.label} <span className="pkl-n">{g.rows.length}</span></h3>
          )}
          <div role="table" aria-label={g.label}>
            <div role="row" className="pkl-row pkl-head">
              <span role="columnheader">Project</span>
              <span role="columnheader">Product</span>
              <span role="columnheader">Stage</span>
            </div>
            {g.rows.map(({ product, project }) => (
              <div role="row" key={product.id} className="pkl-row" data-testid={`kind-row-${product.id}`}>
                <span role="cell" className="pkl-proj">
                  <Link to={PATHS.project(project.slug)} title={projectFullTitleHint(project)}>{projectShortLabel(project)}</Link>
                </span>
                <span role="cell" className="pkl-prod">
                  {productLabel(product)}
                  {product.is_home === 1 && <span className="pkl-home" title="Home product">home</span>}
                </span>
                <span role="cell">
                  <ProductLadder slug={project.slug} product={product} kinds={kinds} testId={`kind-stage-${product.id}`} />
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
      <style>{CSS}</style>
    </div>
  )
}

// Tokens only, the gray ramp; the ladder's own accent marks "current".
const CSS = `
.pkl { display: flex; flex-direction: column; gap: var(--sp-lg); }
.pkl-h { font-size: 13px; font-weight: 500; color: var(--sk-t1); margin: 0 0 6px; }
.pkl-n { color: var(--sk-t3); font-weight: 400; margin-left: 4px; }
.pkl-row {
  display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.4fr) 200px; gap: 12px;
  align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--sk-line2); font-size: 13px;
}
.pkl-head { font-size: 11px; color: var(--sk-t3); padding-top: 0; }
.pkl-proj a { color: var(--sk-t1); text-decoration: none; font-weight: 500; }
.pkl-proj a:hover { text-decoration: underline; text-underline-offset: 2px; }
.pkl-prod { color: var(--sk-t2); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pkl-home { margin-left: 6px; font-size: 10px; color: var(--sk-t3); border: 1px solid var(--sk-line2); border-radius: var(--radius-full); padding: 0 5px; }
.pkl-empty { color: var(--sk-t3); font-size: 13px; padding: var(--sp-lg) 0; }
`
