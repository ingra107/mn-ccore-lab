// current-draft.ts -- the generic doors may not move a product's current draft
// (schema-v150, PB mig 154, 2026-10-26).
//
// A product's current draft is a project-owned `links` row with product_id set
// and role 'current_draft'. Only POST /api/products/:id/current-draft (and its
// /undo) changes which row that is: it archives the old draft and promotes the
// new one in ONE D1 batch with a receipt (api/routes/current-draft.ts). A
// generic writer that deleted the row, re-roled it, or re-scoped it would
// leave the product with no draft or half a replace, and that state the
// singleton index cannot see (it bounds "at most one", not "exactly one").
//
// So every generic door refuses those writes: /api/mutations (processOne also
// refuses product_id as unknown_field: it is not in TABLE_FIELDS) and every
// direct applyInsert / applyUpdate / applyDelete caller (the link routes, the
// artifact mirror). One function, called from those three apply functions in
// mutations.ts. Level 2: a raw SQL statement bypasses it, the index does not.
//
// PB twin: BrainDB._refuse_invalid_link_write (scripts/db/query.py).

export const CURRENT_DRAFT_ROLE = 'current_draft' as const

/** The roles a stored links row can hold. LINK_ROLES (key, archive) are the
 *  generic writers' domain; current_draft is the route's alone. */
export const STORED_LINK_ROLES = ['key', 'archive', CURRENT_DRAFT_ROLE] as const

const ROUTE = 'POST /api/products/:id/current-draft'

/**
 * Why a generic links write may not land, or null. `current` is the stored
 * row (null on insert); `fields` is the insert payload or the update patch;
 * a delete passes fields = null.
 */
export function currentDraftGuard(
  op: 'insert' | 'update' | 'delete',
  current: Record<string, unknown> | null,
  fields: Record<string, unknown> | null,
): string | null {
  const f = fields ?? {}
  if (op !== 'delete' && 'product_id' in f) {
    return `links.product_id is written only by ${ROUTE}`
  }
  if (op !== 'delete' && f.role === CURRENT_DRAFT_ROLE) {
    return `role 'current_draft' is set only by ${ROUTE}`
  }
  if (current && current.role === CURRENT_DRAFT_ROLE && !current.deleted_at) {
    if (op === 'delete') return `link ${String(current.id)} is a product's current draft; replace or undo it with ${ROUTE}`
    if ('role' in f || 'owner_id' in f || 'owner_table' in f || 'deleted_at' in f) {
      return `link ${String(current.id)} is a product's current draft; replace or undo it with ${ROUTE}`
    }
  }
  // A product's draft rows (current and archived) are its history: the route
  // re-promotes an archived one (and undo restores it), and receipts name them
  // by id. So a generic edit may not re-role, re-own or re-point one: a new
  // canonical_url would silently change WHICH draft a receipt and the current
  // pointer name (cold review 2026-10-26, finding 2). Title and kind edits stay
  // ordinary; deleting an archived one stays a person's explicit choice.
  if (current && current.product_id && op === 'update'
      && ('role' in f || 'owner_id' in f || 'owner_table' in f || 'canonical_url' in f)) {
    return `link ${String(current.id)} is in a product's draft history; re-promote it with ${ROUTE}`
  }
  return null
}
