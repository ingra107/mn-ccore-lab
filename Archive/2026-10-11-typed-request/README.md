Archived 2026-10-11 (s51 dead-weight lane). Branded AuthedRequest / PIRequest / ProjectVisibleRequest types and their constructors (Z1.5/Z1.6, 2026-05-28).

Proof: no module imports api/lib/typed-request.ts; only its own test did. Z2 shipped api/lib/route-guards.ts without the brands, so the types were bypassed, never adopted. The one pointer to it was the error text of scripts/check-no-optional-request.mjs, reworded in this commit. The unrelated makeAuthedRequest in mutations.dependency-failed-recovery.test.ts is a local helper.

The intent (a handler cannot be handed an unauthenticated request) is not enforced anywhere now beyond the lint on optional `request?: Request` parameters. Re-adopt from here if wanted.
