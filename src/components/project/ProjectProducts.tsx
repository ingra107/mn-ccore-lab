import { useMemo, useState } from 'react'
import { Plus, Home as HomeIcon } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { formatShortDate } from '../../lib/dateUtils'
import {
  useAddProduct,
  useProjectProducts,
  useSetProductHome,
  useSetProductStage,
} from '../../hooks/useProjectProducts'
import {
  groupByKind,
  ladderFor,
  productLabel,
  sortProducts,
  type ProductKind,
  type ProductRow,
} from '../../lib/products'

// The project page's products, one row under the header (Nick, 2026-10-12:
// "Why can't it be on the same line as the stats?"). Each product is a chip
// (name + stage); a click opens that product's stage ladder inline below the
// row, a second click closes it. The stats line sits beside the chips and
// wraps under them on a narrow screen. Past MAX_CHIPS the rest fold into "+N
// more", which opens the grouped list. A product's stage is set on its ladder;
// writes go to POST /api/projects/:slug/products, open to the project's
// members (Nick, 2026-10-12: "Yes, members of that project"). The read behind
// this view passes the same membership gate, so anyone who sees the products
// may edit them.

interface Props {
  /** proj_* PK. */
  projectId: string
  slug: string
  /** The stats line, drawn beside the chips. */
  stats?: React.ReactNode
}

/** Chips shown before the rest fold into "+N more". */
const MAX_CHIPS = 4
const PANEL_ID = 'pp-panel'

export default function ProjectProducts({ slug, stats }: Props) {
  const { data, isLoading, isError } = useProjectProducts(slug)
  // The read answered: the caller is a member of this project (or the PI).
  const canEdit = !!data
  const [openId, setOpenId] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [adding, setAdding] = useState(false)

  const products = useMemo(() => sortProducts(data?.products ?? []), [data])
  const kinds = data?.kinds ?? []
  const selected = products.find((p) => p.id === openId) ?? null
  // The open product always has its chip, even when it is past the cap.
  let shown = products.slice(0, MAX_CHIPS)
  if (selected && !shown.some((p) => p.id === selected.id)) shown = [...shown.slice(0, MAX_CHIPS - 1), selected]
  const hidden = products.length - shown.length

  return (
    <div className="pp" data-testid="project-products">
      <div className="pp-bar">
        <div className="pp-chips" role="group" aria-label="Products">
          {isLoading && <span className="pp-dim" role="status">Loading products…</span>}
          {isError && <span className="pp-dim" role="alert">Could not load products.</span>}
          {data && products.length === 0 && (
            <span className="pp-dim" data-testid="product-empty">No products yet</span>
          )}
          {shown.map((p) => {
            const on = p.id === openId
            return (
              <button
                key={p.id}
                type="button"
                className={`pp-chip${on ? ' is-on' : ''}`}
                aria-expanded={on}
                aria-controls={on ? PANEL_ID : undefined}
                onClick={() => { setOpenId(on ? null : p.id); setMore(false) }}
                data-testid={`product-chip-${p.id}`}
              >
                <span className="pp-chip-n">{productLabel(p)}</span>
                <span className="pp-chip-s">{p.stage_label}</span>
              </button>
            )
          })}
          {hidden > 0 && (
            <button
              type="button"
              className={`pp-chip pp-chip-more${more ? ' is-on' : ''}`}
              aria-expanded={more}
              onClick={() => { setMore((v) => !v); setOpenId(null) }}
              data-testid="product-more"
            >
              +{hidden} more
            </button>
          )}
          {canEdit && kinds.length > 0 && (
            <button
              type="button"
              className="pp-add"
              onClick={() => setAdding((v) => !v)}
              aria-expanded={adding}
              aria-label="Add product"
              data-testid="product-add-toggle"
            >
              <Plus {...ICON_PROPS} size={12} /> {products.length === 0 ? 'Add product' : ''}
            </button>
          )}
        </div>
        {stats ? <div className="pp-stats">{stats}</div> : null}
      </div>

      {adding && canEdit && (
        <AddProductForm slug={slug} kinds={kinds} products={products} onDone={() => setAdding(false)} />
      )}

      {more && (
        <GroupedList
          products={products}
          kinds={kinds}
          onPick={(id) => { setOpenId(id); setMore(false) }}
        />
      )}

      {selected && (
        <div className="pp-panel" id={PANEL_ID} role="region" aria-label={`${productLabel(selected)} stage`}>
          <ProductDetail
            key={selected.id}
            product={selected}
            products={products}
            kinds={kinds}
            slug={slug}
            canEdit={canEdit}
            showHomeControl={products.length > 1}
          />
        </div>
      )}

      <style>{PRODUCT_CSS}</style>
    </div>
  )
}

// ── "All": the grouped list ──────────────────────────────────

function GroupedList({
  products, kinds, onPick,
}: { products: ProductRow[]; kinds: ProductKind[]; onPick: (id: string) => void }) {
  const groups = groupByKind(products, kinds)
  const byId = new Map(products.map((p) => [p.id, p]))
  return (
    <div className="pp-groups" data-testid="product-all-list">
      {groups.map((g) => (
        <div key={g.kind_key} className="pp-group">
          <div className="pp-gh">{g.label}</div>
          {g.products.map((p) => {
            const parent = p.grew_from_id ? byId.get(p.grew_from_id) : undefined
            return (
              <button
                key={p.id}
                type="button"
                className="pp-row"
                onClick={() => onPick(p.id)}
                data-testid={`product-row-${p.id}`}
              >
                <span className="pp-row-n">{productLabel(p)}</span>
                {p.is_home === 1 && <span className="pp-home">Home</span>}
                {parent && <span className="pp-dim pp-row-from">from {productLabel(parent)}</span>}
                <span className="pp-stage-chip">{p.stage_label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── one product: ladder + facts + controls ───────────────────

function ProductDetail({
  product, products, kinds, slug, canEdit, showHomeControl,
}: {
  product: ProductRow
  products: ProductRow[]
  kinds: ProductKind[]
  slug: string
  canEdit: boolean
  showHomeControl: boolean
}) {
  const ladder = ladderFor(kinds, product.kind)
  const setStage = useSetProductStage()
  const setHome = useSetProductHome(slug)
  const idx = ladder.findIndex((s) => s.stage === product.stage)
  const parent = product.grew_from_id ? products.find((p) => p.id === product.grew_from_id) : undefined

  function move(stage: string) {
    if (stage === product.stage) return
    const next = ladder.find((s) => s.stage === stage)
    if (!next) return
    // The undo toast is shown by the hook once this write lands; the write is
    // a compare-and-swap on the seq and stage this screen shows.
    setStage.mutate({
      slug, productId: product.id, stage, label: next.label, productName: productLabel(product),
      seen: { seq: product.seq, stage: product.stage, label: product.stage_label },
    })
  }

  const facts: string[] = []
  if (product.waiting_on) facts.push(`Waiting on ${product.waiting_on}`)
  if (product.venue) facts.push(product.venue)
  if (parent) facts.push(`Grew from ${productLabel(parent)}`)
  if (product.due_date) facts.push(`Due ${formatShortDate(product.due_date)}`)
  if (product.deadline) facts.push(`Deadline ${formatShortDate(product.deadline)}`)

  return (
    <div className="pp-detail" data-testid={`product-detail-${product.id}`}>
      <div className="pp-dh">
        <span className="pp-dn">{productLabel(product)}</span>
        {/* The kind shows once: a product named for its kind does not repeat it. */}
        {productLabel(product) !== product.kind_label && <span className="pp-dim">{product.kind_label}</span>}
        {product.is_home === 1 && showHomeControl && <span className="pp-home">Home</span>}
        {canEdit && showHomeControl && product.is_home !== 1 && (
          <button
            type="button"
            className="pp-link"
            onClick={() => setHome.mutate(product.id)}
            disabled={setHome.isPending}
            title="Umbrella tasks and new tasks land on the home product"
            data-testid={`product-make-home-${product.id}`}
          >
            <HomeIcon {...ICON_PROPS} size={11} /> Make home
          </button>
        )}
      </div>

      <div className="pp-ladder" role="group" aria-label={`Stage of ${productLabel(product)}`}>
        <div className="pp-ladder-line" />
        {idx >= 0 && ladder.length > 1 && (
          <div
            className="pp-ladder-fill"
            style={{ width: `calc((100% - 32px) * ${idx / (ladder.length - 1)})` }}
          />
        )}
        {ladder.map((s, i) => {
          const isCurrent = i === idx
          const isPast = i < idx
          const dotStyle = {
            width: isCurrent ? 20 : 14,
            height: isCurrent ? 20 : 14,
            border: isCurrent
              ? '3px solid var(--job-accent)'
              : isPast ? '2px solid var(--job-accent)' : '2px solid var(--sk-t3)',
            background: isCurrent || isPast ? 'var(--job-accent)' : 'var(--sk-card)',
          }
          return (
            <div key={s.stage} className="pp-step">
              <div className="pp-dotwrap">
              {canEdit ? (
                <button
                  type="button"
                  className="stage-dot pp-dot"
                  style={dotStyle}
                  onClick={() => move(s.stage)}
                  aria-label={`Move to ${s.label}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  data-testid={`stage-dot-${s.stage}`}
                />
              ) : (
                <span
                  className="pp-dot"
                  style={dotStyle}
                  role="img"
                  aria-label={isCurrent ? `${s.label} (current)` : s.label}
                />
              )}
              </div>
              <span className={`project-stage-label${isCurrent ? ' is-current' : ''}`}>{s.label}</span>
            </div>
          )
        })}
      </div>

      {idx < 0 && (
        // The stage, or its kind, is no longer on a live ladder: say what it is.
        <div className="pp-dim pp-facts" data-testid="product-stage-offladder">
          Stage: {product.stage_label}
        </div>
      )}
      {facts.length > 0 && <div className="pp-dim pp-facts">{facts.join(' · ')}</div>}
    </div>
  )
}

// ── add a product ────────────────────────────────────────────

function AddProductForm({
  slug, kinds, products, onDone,
}: {
  slug: string
  kinds: ProductKind[]
  products: ProductRow[]
  onDone: () => void
}) {
  const add = useAddProduct(slug)
  const [kind, setKind] = useState(kinds[0]?.kind ?? '')
  const ladder = ladderFor(kinds, kind)
  const [stage, setStage] = useState(ladder[0]?.stage ?? '')
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')

  function pickKind(k: string) {
    setKind(k)
    setStage(ladderFor(kinds, k)[0]?.stage ?? '')
  }

  const ready = name.trim().length > 0 && kind !== '' && stage !== ''

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready) return
    add.mutate({ kind, stage, name, growsFromId: parentId || null }, { onSuccess: onDone })
  }

  return (
    <form className="pp-form" onSubmit={submit} data-testid="product-add-form">
      <label className="pp-f">
        <span>Kind</span>
        <select value={kind} onChange={(e) => pickKind(e.target.value)} data-testid="product-add-kind">
          {kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
      </label>
      <label className="pp-f">
        <span>Stage</span>
        <select value={stage} onChange={(e) => setStage(e.target.value)} data-testid="product-add-stage">
          {ladder.map((s) => <option key={s.stage} value={s.stage}>{s.label}</option>)}
        </select>
      </label>
      <label className="pp-f pp-f-grow">
        <span>Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="A1, Aim 2 paper, ATS poster"
          maxLength={80}
          data-testid="product-add-name"
        />
      </label>
      <label className="pp-f">
        <span>Grew from</span>
        <select value={parentId} onChange={(e) => setParentId(e.target.value)} data-testid="product-add-parent">
          <option value="">Nothing</option>
          {products.map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}
        </select>
      </label>
      <div className="pp-form-actions">
        <button type="submit" className="pp-go" disabled={!ready || add.isPending} data-testid="product-add-submit">
          Add
        </button>
        <button type="button" className="pp-link" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

// Scoped styles. Tokens only: the accent carries "selected / current", every
// other surface is the gray ramp (rules-ui-design 1, 2, 9).
const PRODUCT_CSS = `
.pp { margin-bottom: 14px; scroll-margin-top: 60px; }
.pp-dim { color: var(--sk-t3); font-size: 12px; }
.pp-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px;
  padding: 8px 0 12px; border-bottom: 1px solid var(--sk-line);
}
.pp-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: 1 1 260px; min-width: 0; }
.pp-stats { flex: 0 0 auto; margin-left: auto; }
.pp-add, .pp-link {
  display: inline-flex; align-items: center; gap: 4px; background: none; border: 0;
  padding: 4px 6px; font-size: 12px; color: var(--sk-t2); cursor: pointer; border-radius: var(--radius-md);
}
.pp-add:hover, .pp-link:hover { color: var(--sk-t1); background: var(--hover-subtle); }
.pp-link:disabled { opacity: 0.5; cursor: default; }
.pp-chip {
  flex: 0 1 auto; display: inline-flex; align-items: baseline; gap: 6px; max-width: 100%;
  padding: 5px 11px; border-radius: var(--radius-full); border: 1px solid var(--sk-line2);
  background: transparent; color: var(--sk-t2); font-size: 12px; cursor: pointer;
}
.pp-chip:hover { color: var(--sk-t1); }
.pp-chip.is-on { background: var(--hover-subtle); border-color: var(--job-accent); color: var(--sk-t1); }
.pp-chip-n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pp-chip-s { color: var(--sk-t3); font-size: 11px; white-space: nowrap; }
.pp-chip.is-on .pp-chip-s { color: var(--job-accent); }
.pp-chip-more { color: var(--sk-t3); }
.pp-panel { padding: 14px 0 10px; border-bottom: 1px solid var(--sk-line); }
.pp-groups { margin-top: 10px; }
.pp-groups { display: flex; flex-direction: column; gap: 14px; }
.pp-gh { color: var(--sk-t3); font-size: 11px; padding: 0 2px 4px; }
.pp-row {
  width: 100%; display: flex; align-items: center; gap: 8px; text-align: left;
  padding: 8px 6px; background: none; border: 0; border-top: 1px solid var(--sk-line);
  cursor: pointer; color: var(--sk-t1); font-size: 13px; border-radius: var(--radius-md);
}
.pp-row:hover { background: var(--hover-subtle); }
.pp-row-n { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pp-row-from { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pp-stage-chip { margin-left: auto; flex: 0 0 auto; font-size: 11px; color: var(--sk-t2); }
.pp-home { flex: 0 0 auto; font-size: 10px; color: var(--sk-t3); border: 1px solid var(--sk-line2); border-radius: var(--radius-full); padding: 0 6px; }
.pp-detail { padding-top: 4px; }
.pp-dh { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.pp-dn { color: var(--sk-t1); font-size: 14px; font-weight: 600; }
.pp-ladder { position: relative; display: flex; align-items: flex-start; }
.pp-ladder-line { position: absolute; top: 10px; left: 16px; right: 16px; height: 2px; background: var(--sk-line2); }
.pp-ladder-fill { position: absolute; top: 10px; left: 16px; height: 2px; background: var(--job-accent); transition: width 0.25s ease; }
.pp-step { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; position: relative; z-index: var(--z-sticky); }
.pp-dotwrap { height: 20px; display: flex; align-items: center; justify-content: center; }
.pp-dot { display: block; border-radius: var(--radius-circle); padding: 0; box-sizing: border-box; flex: 0 0 auto; }
span.pp-dot { cursor: default; }
.pp-step .project-stage-label { margin-top: 8px; font-size: 10px; line-height: 1.2; text-align: center; color: var(--sk-t3); }
.pp-step .project-stage-label.is-current { color: var(--job-accent); font-weight: 700; }
.pp-facts { margin-top: 12px; }
.pp-empty { padding: 4px 2px 8px; }
.pp-form {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-bottom: 14px;
  padding: 10px 0 12px; border-bottom: 1px solid var(--sk-line);
}
.pp-f { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--sk-t3); }
.pp-f-grow { flex: 1 1 160px; }
.pp-f select, .pp-f input {
  background: var(--sk-card); color: var(--sk-t1); border: 1px solid var(--sk-line2);
  border-radius: var(--radius-md); padding: 5px 8px; font-size: 13px; min-width: 0;
}
.pp-f input:focus-visible, .pp-f select:focus-visible { outline: 2px solid var(--job-accent); outline-offset: 1px; }
.pp-form-actions { display: flex; align-items: center; gap: 8px; }
.pp-go {
  background: var(--job-accent); color: var(--sk-ac-fg); border: 0; border-radius: var(--radius-md);
  padding: 6px 14px; font-size: 13px; cursor: pointer;
}
.pp-go:disabled { opacity: 0.45; cursor: default; }
/* Phones show only the current stage's full label (N1.16; moved here from
   ProjectDetail with the stage strip it belonged to). */
@media (max-width: 480px) {
  .pp-step .project-stage-label { display: none; }
  .pp-step .project-stage-label.is-current { display: block; max-width: none; }
  .pp-form { flex-direction: column; align-items: stretch; }
  .pp-row-from { display: none; }
  .pp-stats { margin-left: 0; }
}
`
