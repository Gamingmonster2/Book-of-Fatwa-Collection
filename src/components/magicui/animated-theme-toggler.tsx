import { useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Coffee, Moon, Sun } from 'lucide-react'

export type Theme = 'light' | 'sepia' | 'dark'

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => {
    ready: Promise<void>
    finished: Promise<void>
  }
}

interface ThemeOption {
  value: Theme
  label: string
  icon: typeof Moon
}

const THEMES: ThemeOption[] = [
  { value: 'dark', label: 'ليلي', icon: Moon },
  { value: 'sepia', label: 'بيج', icon: Coffee },
  { value: 'light', label: 'نهاري', icon: Sun },
]

function getClipPaths(x: number, y: number, width: number, height: number): [string, string] {
  const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) * 1.05
  return [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
}

/**
 * Magic UI — Animated Theme Toggler, adapted into a three-mode selector.
 * Source: https://github.com/magicuidesign/magicui
 */
export function AnimatedThemeToggler({
  theme,
  onThemeChange,
  duration = 420,
}: {
  theme: Theme
  onThemeChange: (theme: Theme) => void
  duration?: number
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const activeAnimRef = useRef<Animation | null>(null)
  const transitioningRef = useRef(false)

  const cancelAnim = useCallback(() => {
    activeAnimRef.current?.cancel()
    activeAnimRef.current = null
  }, [])

  useEffect(
    () => () => {
      cancelAnim()
      const root = document.documentElement
      delete root.dataset.themeVt
      root.style.removeProperty('--theme-vt-duration')
      root.style.removeProperty('--theme-vt-clip-from')
    },
    [cancelAnim],
  )

  const selectTheme = useCallback(
    (next: Theme, button: HTMLButtonElement) => {
      if (next === theme || transitioningRef.current) return
      const doc = document as ViewTransitionDocument
      const root = document.documentElement

      let applied = false
      const applyTheme = () => {
        if (applied) return
        applied = true
        root.dataset.theme = next
        root.classList.toggle('dark', next === 'dark')
        root.classList.toggle('sepia', next === 'sepia')
        root.style.colorScheme = next === 'dark' ? 'dark' : 'light'
        flushSync(() => onThemeChange(next))
      }

      if (
        typeof doc.startViewTransition !== 'function' ||
        document.visibilityState !== 'visible' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        applyTheme()
        return
      }

      const rect = button.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      const [clipFrom, clipTo] = getClipPaths(x, y, window.innerWidth, window.innerHeight)

      root.dataset.themeVt = 'active'
      root.style.setProperty('--theme-vt-duration', `${duration}ms`)
      root.style.setProperty('--theme-vt-clip-from', clipFrom)

      let fallbackTimer = 0
      const cleanup = () => {
        window.clearTimeout(fallbackTimer)
        transitioningRef.current = false
        delete root.dataset.themeVt
        root.style.removeProperty('--theme-vt-duration')
        root.style.removeProperty('--theme-vt-clip-from')
        cancelAnim()
      }

      transitioningRef.current = true
      const transition = doc.startViewTransition(() => applyTheme())
      // بعض المتصفحات لا تُكمل finished بعد تطبيق الوضع؛ لا نترك القفل مغلقاً أبداً.
      fallbackTimer = window.setTimeout(() => {
        if (!transitioningRef.current) return
        if (!applied) applyTheme()
        cleanup()
      }, Math.max(700, duration + 300))
      transition.finished.finally(cleanup).catch(() => {})
      transition.ready
        .then(() => {
          window.clearTimeout(fallbackTimer)
          activeAnimRef.current = root.animate(
            { clipPath: [clipFrom, clipTo] },
            { duration, easing: 'ease-in-out', fill: 'forwards', pseudoElement: '::view-transition-new(root)' },
          )
        })
        .catch(() => {})
    },
    [cancelAnim, duration, onThemeChange, theme],
  )

  return (
    <div className="theme-selector" ref={rootRef} role="group" aria-label="وضع العرض">
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          className={`theme-selector__button ${theme === value ? 'active' : ''}`}
          onClick={(event) => selectTheme(value, event.currentTarget)}
          aria-pressed={theme === value}
          aria-label={`الوضع ${label}`}
          title={`الوضع ${label}`}
        >
          <Icon size={15} aria-hidden="true" />
          <span className="theme-selector__label">{label}</span>
        </button>
      ))}
    </div>
  )
}
