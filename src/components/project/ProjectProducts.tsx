import { useMemo, useState, useSyncExternalStore } from 'react'
import { Plus, Home as HomeIcon } from 'lucide-react'
import { ICON_PROPS } from '../../lib/iconProps'
import { formatPublicationDate, formatShortDate } from '../../lib/dateUtils'
import {
  useAddProduct,
  useProjectProducts,
  useSetProductEvent,
  useSetProductHome,
  useSetProductStage,
} from '../../hooks/useProjectProducts'
import {
  eventDateInputError,
  groupByKind,
  ladderFor,
  NO_ROLES,
  nickRoleLabel,
  productDateFacts,
  productLabel,
  sortProducts,
  type EventFields,
  type ProductKind,
  type ProductRoles,
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
  /** The product chip that filters the page (?product=), or null for All. Only
   *  a project with 2+ products filters. */
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}

/** Chips shown before the rest fold into "+N more". */
const MAX_CHIPS = 4
const PANEL_ID = 'pp-panel'
const MORE_ID = 'pp-more-list'

export default function ProjectProducts({ slug, stats, selectedId = null, onSelect }: Props) {
  const { data, isLoading, isError } = useProjectProducts(slug)
  // The read answered: the caller is a member of this project (or the PI).
  const canEdit = !!data
  // With 2+ products a chip is a FILTER (Nick, 2026-10-12): the selected chip
  // narrows the page's tasks and stats, and its ladder opens below. All (the
  // default) clears it. A lone product keeps the inline ladder and filters nothing.
  const [localOpen, setLocalOpen] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const [adding, setAdding] = useState(false)

  const products = useMemo(() => sortProducts(data?.products ?? []), [data])
  const filters = products.length > 1
  const openId = filters ? selectedId : localOpen
  const setOpenId = (id: string | null) => { if (filters) onSelect?.(id); else setLocalOpen(id) }
  const kinds = data?.kinds ?? []
  const roles = data?.roles ?? NO_ROLES
  const selected = products.find((p) => p.id === openId) ?? null
  // The open product always has its chip, even when it is past the cap.
  let shown = products.slice(0, MAX_CHIPS)
  if (selected && !shown.some((p) => p.id === selected.id)) shown = [...shown.slice(0, MAX_CHIPS - 1), selected]
  const hidden = products.length - shown.length
  const wide = useWide()

  return (
    <div className="pp" data-testid="project-products">
      <div className="pp-bar">
        <div className="pp-chips" role="group" aria-label="Products">
          {isLoading && <span className="pp-dim" role="status">Loading products…</span>}
          {isError && <span className="pp-dim" role="alert">Could not load products.</span>}
          {data && products.length === 0 && (
            <span className="pp-dim" data-testid="product-empty">No products yet</span>
          )}
          {filters && (
            <button
              type="button"
              className={`pp-chip pp-chip-all${openId === null ? ' is-on' : ''}`}
              aria-pressed={openId === null}
              onClick={() => { setOpenId(null); setMore(false) }}
              data-testid="product-chip-all"
            >
              <span className="pp-chip-n">All</span>
            </button>
          )}
          {shown.map((p) => {
            const on = p.id === openId
            if (products.length === 1 && wide && ladderFor(kinds, p.kind).some((st) => st.stage === p.stage)) {
              return (
                <InlineLadder
                  key={p.id}
                  product={p}
                  kinds={kinds}
                  slug={slug}
                  canEdit={canEdit}
                  open={on}
                  onToggle={() => { setOpenId(on ? null : p.id); setMore(false) }}
                />
              )
            }
            return (
              <button
                key={p.id}
                type="button"
                className={`pp-chip${on ? ' is-on' : ''}`}
                aria-expanded={on}
                aria-pressed={on}
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
              aria-controls={more ? MORE_ID : undefined}
              onClick={() => { setMore((v) => !v); if (!filters) setLocalOpen(null) }}
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
            roles={roles}
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
    <div className="pp-groups" id={MORE_ID} data-testid="product-all-list">
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

/** The write behind every stage dot: a compare-and-swap on the seq and stage the
 *  screen shows. The undo toast is shown by the hook once the write lands. */
function useStageMover(product: ProductRow, ladder: { stage: string; label: string }[], slug: string) {
  const setStage = useSetProductStage()
  return (stage: string) => {
    if (stage === product.stage) return
    const next = ladder.find((s) => s.stage === stage)
    if (!next) return
    setStage.mutate({
      slug, productId: product.id, stage, label: next.label, productName: productLabel(product),
      seen: { seq: product.seq, stage: product.stage, label: product.stage_label },
    })
  }
}

// The inline dot ladder wants a pointer and room; a phone or a touch screen gets
// the chip alone (its ladder opens below, and the chip is a 44px target).
const WIDE_QUERY = '(min-width: 641px) and (pointer: fine)'
function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE_QUERY)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  )
}

/** One product on the stats row: its name (opens the detail), a dot per stage
 *  (click to set the stage), and the current stage's label. */
function InlineLadder({
  product, kinds, slug, canEdit, open, onToggle,
}: {
  product: ProductRow
  kinds: ProductKind[]
  slug: string
  canEdit: boolean
  open: boolean
  onToggle: () => void
}) {
  const ladder = ladderFor(kinds, product.kind)
  const move = useStageMover(product, ladder, slug)
  const idx = ladder.findIndex((s) => s.stage === product.stage)
  return (
    <span className="pp-one">
      <button
        type="button"
        className={`pp-chip pp-chip-name${open ? ' is-on' : ''}`}
        aria-expanded={open}
        aria-controls={open ? PANEL_ID : undefined}
        onClick={onToggle}
        data-testid={`product-chip-${product.id}`}
      >
        <span className="pp-chip-n">{productLabel(product)}</span>
      </button>
      <span className="pp-dots" role="group" aria-label={`Stage of ${productLabel(product)}`}>
        {ladder.map((st, i) => {
          const cur = i === idx
          const past = i < idx
          const cls = `pp-idot${cur ? ' is-cur' : past ? ' is-past' : ''}`
          return canEdit ? (
            <button
              key={st.stage}
              type="button"
              className={cls}
              aria-label={`Move to ${st.label}`}
              aria-current={cur ? 'step' : undefined}
              onClick={() => move(st.stage)}
              data-testid={`inline-dot-${st.stage}`}
            />
          ) : (
            <span key={st.stage} className={cls} role="img" aria-label={cur ? `${st.label} (current)` : st.label} />
          )
        })}
      </span>
      <span className="pp-chip-s pp-one-stage" data-testid="inline-stage">{product.stage_label}</span>
    </span>
  )
}

function ProductDetail({
  product, products, kinds, roles, slug, canEdit, showHomeControl,
}: {
  product: ProductRow
  products: ProductRow[]
  kinds: ProductKind[]
  roles: ProductRoles
  slug: string
  canEdit: boolean
  showHomeControl: boolean
}) {
  const ladder = ladderFor(kinds, product.kind)
  const setHome = useSetProductHome(slug)
  const idx = ladder.findIndex((s) => s.stage === product.stage)
  const parent = product.grew_from_id ? products.find((p) => p.id === product.grew_from_id) : undefined

  const move = useStageMover(product, ladder, slug)
  const [editingEvent, setEditingEvent] = useState(false)

  const facts: string[] = []
  if (product.waiting_on) facts.push(`Waiting on ${product.waiting_on}`)
  if (product.venue) facts.push(product.venue)
  if (parent) facts.push(`Grew from ${productLabel(parent)}`)
  // A talk or an abstract shows when it happened, never "Due" once given
  // (schema-v135); every other kind keeps its due date and deadline.
  facts.push(...productDateFacts(product, formatPublicationDate, formatShortDate))
  const role = nickRoleLabel(product, roles)
  if (role) facts.push(`Nick: ${role}`)

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
      {facts.length > 0 && (
        <div className="pp-dim pp-facts" data-testid={`product-facts-${product.id}`}>{facts.join(' · ')}</div>
      )}
      {canEdit && !editingEvent && (
        <button
          type="button"
          className="pp-link pp-event-edit"
          onClick={() => setEditingEvent(true)}
          data-testid={`product-event-edit-${product.id}`}
        >
          {product.event_date || product.nick_author_position || product.nick_event_role ? 'Edit date and role' : 'Add date and role'}
        </button>
      )}
      {canEdit && editingEvent && (
        <EventForm product={product} roles={roles} slug={slug} onDone={() => setEditingEvent(false)} />
      )}
    </div>
  )
}

// ── the event date and Nick's role (schema-v135) ─────────────

function EventForm({
  product, roles, slug, onDone,
}: { product: ProductRow; roles: ProductRoles; slug: string; onDone: () => void }) {
  const save = useSetProductEvent(slug)
  const seenValues: EventFields = {
    event_date: product.event_date ?? null,
    nick_author_position: product.nick_author_position ?? null,
    nick_event_role: product.nick_event_role ?? null,
  }
  const [date, setDate] = useState(seenValues.event_date ?? '')
  const [position, setPosition] = useState(seenValues.nick_author_position ?? '')
  const [role, setRole] = useState(seenValues.nick_event_role ?? '')
  const dateError = eventDateInputError(date.trim())

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (dateError) return
    const next: EventFields = {
      event_date: date.trim() || null,
      nick_author_position: position || null,
      nick_event_role: role || null,
    }
    // Send only what changed; the compare-and-swap names exactly those fields.
    const keys = (Object.keys(next) as (keyof EventFields)[]).filter((k) => next[k] !== seenValues[k])
    if (keys.length === 0) { onDone(); return }
    save.mutate({
      productId: product.id,
      fields: Object.fromEntries(keys.map((k) => [k, next[k]])),
      seen: { seq: product.seq, values: Object.fromEntries(keys.map((k) => [k, seenValues[k]])) },
    }, { onSuccess: onDone })
  }

  return (
    <form className="pp-form pp-event-form" onSubmit={submit} data-testid={`product-event-form-${product.id}`}>
      <label className="pp-f">
        <span>Date</span>
        <input
          type="text"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          placeholder="2019-05 or 2019-05-21"
          maxLength={10}
          aria-invalid={!!dateError}
          data-testid="product-event-date"
        />
      </label>
      <label className="pp-f">
        <span>Nick on the byline</span>
        <select value={position} onChange={(e) => setPosition(e.target.value)} data-testid="product-event-position">
          <option value="">Not an author</option>
          {roles.author_positions.map((r) => <option key={r.position} value={r.position}>{r.label}</option>)}
        </select>
      </label>
      <label className="pp-f">
        <span>Nick at the event</span>
        <select value={role} onChange={(e) => setRole(e.target.value)} data-testid="product-event-role">
          <option value="">No role</option>
          {roles.event_roles.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
        </select>
      </label>
      <div className="pp-form-actions">
        <button type="submit" className="pp-go" disabled={!!dateError || save.isPending} data-testid="product-event-save">
          Save
        </button>
        <button type="button" className="pp-link" onClick={onDone}>Cancel</button>
      </div>
      {dateError && <div className="pp-dim pp-event-err" role="alert">{dateError}</div>}
    </form>
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
.pp-one { display: inline-flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.pp-chip-name { padding-right: 11px; }
.pp-dots { display: inline-flex; align-items: center; }
.pp-idot {
  position: relative; display: inline-block; width: 18px; height: 22px; padding: 0; border: 0; background: none; cursor: pointer;
}
.pp-idot::before {
  content: ""; position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; transform: translate(-50%, -50%);
  border-radius: var(--radius-circle); box-sizing: border-box; border: 2px solid var(--sk-t3); background: var(--sk-card);
}
.pp-idot.is-past::before { border-color: var(--job-accent); background: var(--job-accent); }
.pp-idot.is-cur::before { width: 14px; height: 14px; border: 3px solid var(--job-accent); background: var(--job-accent); }
span.pp-idot { cursor: default; }
button.pp-idot:hover::before { border-color: var(--job-accent); }
.pp-one-stage { color: var(--job-accent); font-weight: 600; font-size: 12px; }
/* 44px touch targets on a touch screen or a phone */
@media (pointer: coarse), (max-width: 640px) {
  .pp-chip { min-height: 44px; align-items: center; padding: 0 14px; }
  .pp-add { min-width: 44px; min-height: 44px; justify-content: center; }
  .pp-link { min-height: 44px; }
}
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
.pp-event-edit { margin-top: 6px; margin-left: -6px; }
.pp-event-form { margin: 10px 0 0; border-bottom: 0; padding-bottom: 0; }
.pp-event-err { flex-basis: 100%; }
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
