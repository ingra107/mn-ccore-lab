// project-join-columns.ts -- the project_directory view's columns (schema-v139).
//
// No imports, so table-scope.ts can name the list without importing the route
// stack. The view's SELECT list in the migration is the contract; this is its
// TypeScript mirror, and table-scope.test.ts checks the live view against it.
// pi_photo is the PI's team_members.photo_url (a lab-wide field), so the Browse
// row can show the PI's face.

export const DIRECTORY_COLUMNS = ['project_id', 'name', 'blurb', 'pi_slug', 'pi_name', 'pi_photo'] as const
