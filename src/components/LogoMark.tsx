import type { CSSProperties } from 'react'

// The compact MN-CCORE mark. On a dark surface it swaps to the -dark asset,
// never a CSS filter: invert() turns the gold pulse blue (principle 16, keep
// the brand). Every compact mark renders through here so no surface can
// recolor it.
export default function LogoMark({
  dark,
  alt = 'MN-CCORE',
  className,
  style,
  width,
  height,
}: {
  dark: boolean
  alt?: string
  className?: string
  style?: CSSProperties
  width?: number
  height?: number
}) {
  return (
    <img
      src={dark ? '/logos/mnccore-logo-mark-dark.svg' : '/logos/mnccore-logo-mark.svg'}
      alt={alt}
      className={className}
      style={style}
      width={width}
      height={height}
    />
  )
}
