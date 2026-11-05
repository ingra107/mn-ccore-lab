// PhotoOrInitials -- a person's photo inside a frame the caller draws, with the
// caller's initials in its place when there is no photo or it fails to load. A
// bare <img> showed the browser's broken-image icon and clipped alt text
// (sweep audit H3). FaceDisc (today/skin.tsx) does this for the standard disc;
// this is for the older frames that are not that disc.

import { useState, type ImgHTMLAttributes, type ReactNode } from 'react'

export function PhotoOrInitials({ src, fallback, ...img }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & { src: string | null | undefined; fallback: ReactNode }) {
  // Remembers WHICH url failed, so a new photo for the same slot gets its try.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)
  if (!src || src === brokenSrc) return <>{fallback}</>
  return <img {...img} src={src} onError={() => setBrokenSrc(src)} />
}
