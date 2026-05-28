// hidden-resource.ts — Z4.1
//
// Codex's Other-Primitive #5: existence oracles from inconsistent 403/404/body
// shape. The PB-visibility audit found that "row exists but you can't see it"
// (403) and "row doesn't exist" (404) had different status codes — an attacker
// can probe IDs by status code alone.
//
// hiddenResource() returns ONE fixed envelope for both cases. Every wrapper
// that gates on visibility should return hiddenResource() for both "row
// missing" and "row hidden from caller". The PB-visibility-contract test
// already requires both cases to return 404 (T1.2 revisions guard).

import { error } from '../helpers';

/**
 * Uniform "this resource is hidden or doesn't exist" response.
 *
 * Status: 404. Body: { error: 'Not found' }. CORS headers via the error()
 * helper. Do NOT include the resource ID or any oracle data in the body.
 *
 * Use this instead of a bare `error('Not found', 404)` anywhere that the
 * caller must NOT be able to distinguish "unknown row" from "row exists but
 * you can't see it."
 */
export function hiddenResource(): Response {
  return error('Not found', 404);
}
