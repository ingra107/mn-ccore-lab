/**
 * photoFrame -- how a member's portrait sits in THE face circle.
 *
 * Most roster photos are 2:3 portraits, and a head sits high and at a different
 * height in each. A plain center crop left some faces riding up the circle and
 * cut the top off others (Nick, 2026-11-04: "some of the faces are not
 * necessarily centered"). The photos are hosted elsewhere, so the crop lives
 * here as data: one optional field on the member, read in one place (FaceDisc),
 * so every face on every surface gets the same framing.
 */
import type { CSSProperties } from 'react'
import { getAllMembers } from '../data/team'
import type { PhotoFrame } from '../data/types'

export type { PhotoFrame }

let byUrl: Map<string, PhotoFrame> | null = null

function frames(): Map<string, PhotoFrame> {
  if (!byUrl) {
    byUrl = new Map(
      getAllMembers().flatMap((m) => (m.photoUrl && m.photoFrame ? [[m.photoUrl, m.photoFrame] as const] : [])),
    )
  }
  return byUrl
}

/** The inline style that frames a photo, or undefined for a plain center crop. */
export function photoFrameStyle(photo: string | undefined): CSSProperties | undefined {
  const frame = photo ? frames().get(photo) : undefined
  if (!frame) return undefined
  const { y, zoom = 1, dy = 0 } = frame
  return {
    objectPosition: `50% ${y}%`,
    ...(zoom !== 1 || dy !== 0 ? { transform: `translateY(${dy}%) scale(${zoom})` } : {}),
  }
}
