// The one place a link to a task is built, for the Worker and the browser.
// My Tasks reads `?open=` through useOpenParam. src/lib/taskLink.ts re-exports
// this, and a test pins TASK_LINK_PATH to PATHS.myTasks.
export const TASK_LINK_PATH = '/portal/my-tasks'

/** Path + query that opens task `id` in the My Tasks drawer. */
export function taskLinkFor(id: string): string {
  return `${TASK_LINK_PATH}?open=${encodeURIComponent(id)}`
}
