/**
 * TanStack Query v5 mutation hooks with optimistic updates.
 *
 * Each mutation:
 * 1. Optimistically updates the cache immediately (instant UI feedback)
 * 2. Sends the request to D1
 * 3. Rolls back on error, invalidates on success
 *
 * Split into domain files under ./mutations/
 * This file re-exports everything for backwards compatibility.
 */

export * from './mutations'
