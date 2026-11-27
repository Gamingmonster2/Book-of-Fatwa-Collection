import { memo, type ReactNode } from 'react'

interface AuroraTextProps {
  children: ReactNode
  className?: string
}

/** Magic UI — Aurora Text, adapted to the site palette. */
export const AuroraText = memo(({ children, className = '' }: AuroraTextProps) => (
  <span className={`aurora-text ${className}`}>
    <span className="aurora-text__visible" aria-hidden="true">
      {children}
    </span>
    <span className="sr-only">{children}</span>
  </span>
))

AuroraText.displayName = 'AuroraText'
