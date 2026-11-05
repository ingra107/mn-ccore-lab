// The one place a link to a task is built (shared/taskLink.ts, also read by the
// Worker). Every surface that hands out a task link (copy link, open in new
// tab, palette, rail cards, Hermes citations) calls this, so the param name
// cannot drift from what My Tasks reads.
export { taskLinkFor, TASK_LINK_PATH } from '../../shared/taskLink'
