import { useToast } from './useToast'

// Shared chokepoint for firing `mnccore://` protocol URLs from the UI.
//
// The `mnccore://` scheme needs a Windows URL-handler registration on the
// user's machine (scripts/mnccore-handler.bat + setup-mnccore-protocol.bat in
// the Hub repo). If the handler isn't installed the browser silently does
// nothing, so every launch ships a fallback: copy a human-actionable string to
// the clipboard + show a toast. This mirrors KeyLinksEditor's handleNonHttpClick
// — one behavior for all local-protocol affordances across the app.
//
// `launch(uri, opts)`:
//   - opts.copyText: what lands in the clipboard as the fallback (a folder path
//     for open/workon; omitted for verb-only URIs like mnccore://process).
//   - opts.successMessage: toast shown on a successful fire-and-forget launch.
//   - opts.copyMessage: toast shown when we fell back to clipboard-copy.
export interface ProtocolLaunchOptions {
  copyText?: string
  successMessage: string
  copyMessage?: string
}

export function useProtocolLaunch() {
  const { showSuccess } = useToast()

  const launch = async (uri: string, opts: ProtocolLaunchOptions): Promise<void> => {
    // Fire-and-forget: if the handler IS installed this opens it; if not, the
    // navigation is a silent no-op and the clipboard fallback below is the
    // reliable path. We can't observe whether the handler ran, so we always
    // copy (when copyText is provided) and surface the actionable toast.
    if (opts.copyText) {
      try {
        await navigator.clipboard.writeText(opts.copyText)
        showSuccess(opts.copyMessage || opts.successMessage)
      } catch {
        window.prompt('Copy path:', opts.copyText)
      }
    } else {
      showSuccess(opts.successMessage)
    }
    try {
      window.location.href = uri
    } catch {
      // Custom protocol without a handler is a no-op on most systems.
    }
  }

  return { launch }
}
