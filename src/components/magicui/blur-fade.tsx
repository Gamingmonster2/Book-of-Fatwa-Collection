import { useRef, type ReactNode } from 'react'
import { AnimatePresence, motion, useInView, type Variants } from 'motion/react'

interface BlurFadeProps {
  children: ReactNode
  className?: string
  duration?: number
  delay?: number
  offset?: number
  direction?: 'up' | 'down' | 'left' | 'right'
  blur?: string
  inView?: boolean
}

/**
 * Magic UI — Blur Fade, adapted to plain CSS class names.
 * Source: https://github.com/magicuidesign/magicui
 */
export function BlurFade({
  children,
  className = '',
  duration = 0.45,
  delay = 0,
  offset = 8,
  direction = 'down',
  blur = '6px',
  inView = false,
}: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inViewResult = useInView(ref, { once: true, margin: '-30px' })
  const visible = !inView || inViewResult

  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y'
  const sign = direction === 'right' || direction === 'down' ? -1 : 1

  const variants: Variants = {
    hidden: { [axis]: offset * sign, opacity: 0, filter: `blur(${blur})` },
    visible: { [axis]: 0, opacity: 1, filter: 'blur(0px)' },
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={ref}
        className={className}
        initial="hidden"
        animate={visible ? 'visible' : 'hidden'}
        exit="hidden"
        variants={variants}
        transition={{ delay: 0.04 + delay, duration, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
