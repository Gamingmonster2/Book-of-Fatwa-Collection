import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react'

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string
  shimmerDuration?: string
  borderRadius?: string
  background?: string
}

/**
 * Magic UI — Shimmer Button, adapted to plain CSS.
 * Source: https://github.com/magicuidesign/magicui
 */
export const ShimmerButton = forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = 'rgba(255, 224, 160, 0.95)',
      shimmerDuration = '3.2s',
      borderRadius = '14px',
      background = 'linear-gradient(135deg, var(--green), var(--green-2))',
      className = '',
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const variables = {
      '--shimmer-color': shimmerColor,
      '--shimmer-speed': shimmerDuration,
      '--shimmer-radius': borderRadius,
      '--shimmer-bg': background,
      ...style,
    } as CSSProperties

    return (
      <button
        ref={ref}
        type="button"
        className={`shimmer-button ${className}`}
        style={variables}
        {...props}
      >
        <span className="shimmer-button__content">{children}</span>
      </button>
    )
  },
)

ShimmerButton.displayName = 'ShimmerButton'
