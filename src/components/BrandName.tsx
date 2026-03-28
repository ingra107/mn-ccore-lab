/**
 * Inline MN-CCORE brand mark with EKG pulse hyphen.
 * Use this wherever the lab name appears in headings or prominent text.
 * For plain text contexts (task cards, meta labels), use formatBrandName() instead.
 */

interface BrandNameProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeConfig = {
  sm: { fontSize: '14px', pulseHeight: 10, pulseWidth: 24 },
  md: { fontSize: '18px', pulseHeight: 14, pulseWidth: 32 },
  lg: { fontSize: '28px', pulseHeight: 20, pulseWidth: 44 },
}

export default function BrandName({ size = 'md', className }: BrandNameProps) {
  const config = sizeConfig[size]

  return (
    <span className={`inline-flex items-center gap-0.5 ${className || ''}`} style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: config.fontSize, color: 'var(--ink)' }}>
      MN
      <svg viewBox="0 0 40 20" width={config.pulseWidth} height={config.pulseHeight} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <path
          d="M 2 10 L 8 10 L 12 3 L 16 17 L 20 6 L 24 12 L 28 8 L 38 8"
          stroke="var(--gold)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      CCORE
    </span>
  )
}

/**
 * Normalize any variant of the lab name to "MN-CCORE" in plain text.
 * Use in task cards, calendar events, meta labels — anywhere JSX isn't practical.
 */
export function formatBrandName(text: string): string {
  return text
    .replace(/\bMNCCORE\b/g, 'MN-CCORE')
    .replace(/\bmnccore\b/gi, 'MN-CCORE')
}
