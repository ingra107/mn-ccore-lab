/** After a name the description reads as a verb: "Nick commented on task". A
 *  first word that is all capitals or has a capital inside it stays as written. */
export function verbAfterName(description: string): string {
  return /^[A-Z][a-z]+\b/.test(description) ? description[0].toLowerCase() + description.slice(1) : description
}
