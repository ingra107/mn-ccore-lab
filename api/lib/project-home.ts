// project-home.ts -- a project's stage, read from its products (contract
// phase step 1, PB Scratch/plans/2026-10-12-contract-phase-retire-project-stage.md).
//
// projects.stage is being retired. A project's stage is its products' stages:
//   - a compact display (search, palette, hover card, sidebar, member lists)
//     shows the HOME product's kind and stage, plus "+N" for the rest;
//   - a full view shows chips, or one ladder for one product;
//   - a rollup counts PRODUCTS by kind and stage, never projects;
//   - "done" is project status done, or every live product on a terminal rung.
// These fragments are the one place a Hub read joins the home product, so
// every read that names a project's stage reads the same thing.
//
// The home is the live is_home = 1 product (schema-v124 allows one; v125's
// triggers give every live project one at insert). A project with no live
// home (a legacy row, PB invariant I68's case) reads NULL kind and stage.

/** Columns a projects SELECT adds for its row's home product. `pr` is the
 *  projects alias the query uses. Needs HOME_PRODUCT_JOIN(pr) in FROM. */
export function homeProductCols(pr: string): string {
  return [
    'h.kind AS home_kind',
    'hk.label AS home_kind_label',
    'h.stage AS home_stage',
    'hs.label AS home_stage_label',
    `(SELECT COUNT(*) FROM products c WHERE c.project_id = ${pr}.id AND c.deleted_at IS NULL) AS product_count`,
    `(SELECT COUNT(*) FROM products c JOIN product_stages cs ON cs.kind = c.kind AND cs.stage = c.stage
       WHERE c.project_id = ${pr}.id AND c.deleted_at IS NULL AND cs.is_terminal = 0) AS product_open_count`,
  ].join(', ');
}

/** The LEFT JOINs homeProductCols reads (aliases h, hk, hs). */
export function homeProductJoin(pr: string): string {
  return `LEFT JOIN products h ON h.project_id = ${pr}.id AND h.is_home = 1 AND h.deleted_at IS NULL
     LEFT JOIN product_kinds hk ON hk.kind = h.kind
     LEFT JOIN product_stages hs ON hs.kind = h.kind AND hs.stage = h.stage`;
}

/** SQL truth of "this project is finished": status done, or it has live
 *  products and none of them is on a non-terminal rung. `pr` = projects alias. */
export function projectDoneSql(pr: string): string {
  return `(${pr}.status = 'done' OR (
    EXISTS (SELECT 1 FROM products d WHERE d.project_id = ${pr}.id AND d.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM products d JOIN product_stages ds ON ds.kind = d.kind AND ds.stage = d.stage
                     WHERE d.project_id = ${pr}.id AND d.deleted_at IS NULL AND ds.is_terminal = 0)))`;
}

type HomeRow = {
  home_kind?: string | null; home_kind_label?: string | null; home_stage?: string | null
  home_stage_label?: string | null; product_count?: number | null
}

/** The home's stage in words: "Writing" for a manuscript (the common case
 *  reads as it always has), "Grant application · Submitted" for any other
 *  kind. "" when the project has no home product. */
export function homeStageWords(row: HomeRow): string {
  if (!row.home_kind || !row.home_stage) return '';
  const stage = row.home_stage_label ?? row.home_stage;
  return row.home_kind === 'manuscript' ? stage : `${row.home_kind_label ?? row.home_kind} · ${stage}`;
}

/** The compact stage label: the home's words plus "+N" for the other
 *  products. "" when the project has no home product. */
export function compactStageLabel(row: HomeRow): string {
  const base = homeStageWords(row);
  if (!base) return '';
  const more = Math.max(0, Number(row.product_count ?? 1) - 1);
  return more > 0 ? `${base} +${more}` : base;
}

/** Rollup: live products of live projects, counted by kind and stage, in
 *  kind-table then ladder order. `projectWhere` narrows the projects
 *  (alias pr), e.g. "pr.status = 'active'". `by`, when given, is one more
 *  projects column to split the counts on (returned as `grp`). */
export const PRODUCT_STAGE_COUNTS_SQL = (projectWhere = '1=1', by?: string): string =>
  `SELECT ${by ? `${by} AS grp, ` : ''}p.kind, k.label AS kind_label, p.stage, s.label AS stage_label, s.ordinal, s.is_terminal,
          COUNT(*) AS count
     FROM products p
     JOIN product_kinds k ON k.kind = p.kind
     JOIN product_stages s ON s.kind = p.kind AND s.stage = p.stage
     JOIN projects pr ON pr.id = p.project_id AND pr.deleted_at IS NULL
    WHERE p.deleted_at IS NULL AND (${projectWhere})
    GROUP BY ${by ? `${by}, ` : ''}p.kind, p.stage
    ORDER BY k.sort_order, k.kind, s.ordinal`;

export interface ProductStageCount {
  kind: string
  kind_label: string
  stage: string
  stage_label: string
  ordinal: number
  is_terminal: number
  count: number
}
