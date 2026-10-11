// typed-request.ts — Z1.5
//
// Branded Request types.
//
// Codex P3-amended: ban `request?: Request` in handler signatures (Z5.4 lint).
// The typed wrappers go further: handlers can now take an AuthedRequest /
// PIRequest / ProjectVisibleRequest, and the only way to construct one is
// through the toX() factories. Bypassing -> compile error.
//
// Pattern usage in a handler (Z2 wrappers will produce these):
//
//   export async function handleX(req: AuthedRequest, env: Env): Promise<Response> {
//     // req is GUARANTEED non-null and JWT-validated by the time it arrives.
//   }
//
// Routes that legitimately accept anonymous traffic take plain Request.
// Routes that require auth take AuthedRequest. The compiler enforces.

import type { AuthUser } from '../helpers'

// Brand symbols — uninstantiable from outside this module. They live in the
// type system only; nothing is emitted at runtime.
declare const __authedBrand: unique symbol
declare const __piBrand: unique symbol
declare const __projectBrand: unique symbol

export type AuthedRequest = Request & {
  readonly user: AuthUser
  readonly [__authedBrand]: true
}

export type PIRequest = AuthedRequest & {
  readonly [__piBrand]: true
}

export type ProjectVisibleRequest = AuthedRequest & {
  readonly projectId: string
  readonly [__projectBrand]: true
}

/**
 * Promote a raw Request to AuthedRequest. Returns null if the authed user
 * lookup returned null — the caller `return error('Authentication required', 401)`s.
 */
export function toAuthedRequest(
  req: Request,
  user: AuthUser | null,
): AuthedRequest | null {
  if (!user) return null
  // Mutate-tag is acceptable: AuthedRequest is read-only-from-the-outside;
  // the brand is type-system-only and never appears at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(req as any).user = user
  return req as AuthedRequest
}

/**
 * Promote AuthedRequest to PIRequest. Returns null if the user is missing or
 * not a PI. isPi is computed by the caller (typically via `isPiRequest()`
 * from helpers.ts).
 */
export function toPIRequest(
  req: Request,
  user: AuthUser | null,
  isPi: boolean,
): PIRequest | null {
  if (!user || !isPi) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(req as any).user = user
  return req as PIRequest
}

/**
 * Promote a raw Request to ProjectVisibleRequest. Caller must have already
 * confirmed the project is visible (via assertProjectVisible /
 * resolveAndGuardProject) and pass the resolved canonical projectId.
 *
 * Returns null when either user OR projectId is missing — keep the failure
 * mode uniform (Z2 wrappers convert null to error()).
 */
export function toProjectVisibleRequest(
  req: Request,
  user: AuthUser | null,
  projectId: string,
): ProjectVisibleRequest | null {
  if (!user || !projectId) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(req as any).user = user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(req as any).projectId = projectId
  return req as ProjectVisibleRequest
}
