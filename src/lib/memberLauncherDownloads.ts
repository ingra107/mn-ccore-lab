// Where the member launcher zips are served. The build writes them there
// (scripts/member-launcher-zip.ts via the vite plugin in vite.config.ts) and
// the dev server answers the same paths. Under /portal/ so Cloudflare Access
// gates them like the rest of the portal.
export const MEMBER_LAUNCHER_DOWNLOADS = {
  windows: '/portal/downloads/mnccore-launcher-windows.zip',
  mac: '/portal/downloads/mnccore-launcher-mac.zip',
} as const
