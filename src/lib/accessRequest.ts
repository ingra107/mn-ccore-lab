// accessRequest.ts — the "Request access" mailto a signed-in non-member sends
// from the members-only page (2026-10-08). A plain module so the page
// component file exports only components (react-refresh) and a unit test can
// pin the exact address, subject and body.

export const ACCESS_CONTACT = 'ingra107@umn.edu'
export const ACCESS_SUBJECT = 'MN-CCORE Hub access request'

/** mailto: to Nick, fixed subject, body prefilled with the caller's name and
 *  the email they signed in with (the address a PI adds them under). */
export function accessRequestHref(email: string, name: string): string {
  const who = name.trim() || email
  const body = [
    'Hi Nick,',
    '',
    "I'd like access to the MN-CCORE Hub.",
    '',
    `Name: ${who}`,
    `UMN email: ${email}`,
    '',
    'Thanks,',
    who,
  ].join('\n')
  return `mailto:${ACCESS_CONTACT}?subject=${encodeURIComponent(ACCESS_SUBJECT)}&body=${encodeURIComponent(body)}`
}
