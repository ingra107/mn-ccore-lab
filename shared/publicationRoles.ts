// shared/publicationRoles.ts — the ONE vocabulary for project_publications.role
// (schema-v110, #129). Imported by the API guard and the UI picker, the way
// shared/taskKinds.ts is, so the two cannot drift.
export const PUBLICATION_ROLES = ['primary', 'secondary', 'preprint'] as const;
export type PublicationRole = (typeof PUBLICATION_ROLES)[number];

export function isPublicationRole(v: unknown): v is PublicationRole {
  return typeof v === 'string' && (PUBLICATION_ROLES as readonly string[]).includes(v);
}
