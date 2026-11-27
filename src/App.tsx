import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { MotionConfig } from 'motion/react'
import {
  BookOpen,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Highlighter,
  List,
  Mail,
  Maximize2,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Send,
  Share2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { AnimatedThemeToggler, type Theme } from './components/magicui/animated-theme-toggler'
import { AuroraText } from './components/magicui/aurora-text'
import { BlurFade } from './components/magicui/blur-fade'
import { ShimmerButton } from './components/magicui/shimmer-button'

type TocItem = { level: number; title: string; page: number }
type Book = {
  id: string
  file: string
  title: string
  author: string
  pages: number
  toc: TocItem[]
}
type Manifest = {
  title: string
  source: string
  total_pages: number
  books: Book[]
}
type VolumeDetail = {
  id: string
  title: string
  file: string
  pages: number
  toc: TocItem[]
  indexStart: number | null
  indexEnd: number | null
  imagePattern: { thumb: string; full: string }
}
type OcrIndex = { volume: string; source: string; pages: { page: number; text: string }[] }
type SearchHit = {
  key: string
  title: string
  page: number
  volume: string
  kind: 'toc' | 'index'
}
type SavedBookmark = { id: string; volume: string; page: number; label: string; created: number }
type SavedHighlight = {
  id: string
  volume: string
  page: number
  x: number
  y: number
  width: number
  height: number
  created: number
}
type HighlightBox = { x: number; y: number; width: number; height: number }

const FILES_BASE = (import.meta.env.VITE_FILES_BASE as string | undefined)?.replace(/\/$/, '')
const ORIGINAL_BASE = (import.meta.env.VITE_ORIGINAL_BASE as string | undefined)?.replace(/\/$/, '')
// النسخة المفتوحة على Internet Archive (ملفات mftNN.pdf مطابقة للملفات الأصلية)
const ARCHIVE_DOWNLOAD_BASE = 'https://archive.org/download/mft37'

function assetUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), document.baseURI).href
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function normalize(value: string): string {
  return value
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/ـ/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function initialParam(name: string, fallback: string): string {
  return new URLSearchParams(window.location.search).get(name) || fallback
}

function initialTheme(): Theme {
  const value = document.documentElement.dataset.theme
  return value === 'dark' || value === 'sepia' ? value : 'light'
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [volumeId, setVolumeId] = useState(() => initialParam('v', 'v01'))
  const [detail, setDetail] = useState<VolumeDetail | null>(null)
  const [prepared, setPrepared] = useState<string[]>([])
  const [allOcr, setAllOcr] = useState<OcrIndex[]>([])
  const [page, setPage] = useState(() => Number(initialParam('p', '1')) || 1)
  const [query, setQuery] = useState(() => initialParam('q', ''))
  // في الهاتف نبدأ بحجم قراءة أكبر، ونُبقي الفهرس مغلقاً حتى لا يحجب الصفحة.
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 860px)').matches)
  const [zoom, setZoom] = useState(() => (window.matchMedia('(max-width: 860px)').matches ? 2 : 1))
  const [showToc, setShowToc] = useState(() => !window.matchMedia('(max-width: 860px)').matches)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [brightness, setBrightness] = useState(() => {
    const value = Number(readStorage('fatwa-brightness', 100))
    return Number.isFinite(value) ? Math.min(140, Math.max(60, value)) : 100
  })
  const [bookmarks, setBookmarks] = useState<SavedBookmark[]>(() => readStorage('fatwa-bookmarks', []))
  const [highlights, setHighlights] = useState<SavedHighlight[]>(() => readStorage('fatwa-highlights', []))
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [highlightMode, setHighlightMode] = useState(false)
  const [draftHighlight, setDraftHighlight] = useState<HighlightBox | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const readerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const highlightStartRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    fetch(assetUrl('data/manifest.json'))
      .then((response) => response.json())
      .then(setManifest)
      .catch(() => setError('تعذّر تحميل بيانات المجلدات'))
  }, [])

  // البحث في فهارس كل المجلدات المجهّزة، لا المجلد الحالي فقط.
  useEffect(() => {
    fetch(assetUrl('data/prepared.json'))
      .then((response) => (response.ok ? response.json() : []))
      .then((ids: string[]) => {
        setPrepared(ids)
        return Promise.all(
          ids.map((id) =>
            fetch(assetUrl(`data/ocr/${id}-index.json`))
              .then((response) => (response.ok ? response.json() : null))
              .catch(() => null),
          ),
        )
      })
      .then((items) => setAllOcr(items.filter((item): item is OcrIndex => !!item)))
      .catch(() => setAllOcr([]))
  }, [])

  useEffect(() => {
    setDetail(null)
    setError('')
    fetch(assetUrl(`data/volumes/${volumeId}.json`))
      .then((response) => {
        if (!response.ok) throw new Error('not found')
        return response.json()
      })
      .then(setDetail)
      .catch(() => setError(`المجلد ${volumeId} لم يُجهَّز بعد`))
  }, [volumeId])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('v', volumeId)
    params.set('p', String(page))
    if (query) params.set('q', query)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }, [volumeId, page, query])

  // عند تصغير النافذة إلى عرض الهاتف: أغلق الفهرس واضبط حجم القراءة تلقائياً.
  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)')
    const onChange = (event: MediaQueryListEvent) => {
      setIsNarrow(event.matches)
      setShowToc(!event.matches)
      setZoom(event.matches ? 2 : 1)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.classList.toggle('sepia', theme === 'sepia')
    root.dataset.theme = theme
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#071713' : theme === 'sepia' ? '#4c4a30' : '#f4f6f5',
    )
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // التخزين قد يكون معطلاً؛ الوضع يعمل داخل الجلسة.
    }
  }, [theme])

  useEffect(() => {
    document.documentElement.style.setProperty('--page-brightness', (brightness / 100).toFixed(2))
    try {
      localStorage.setItem('fatwa-brightness', String(brightness))
    } catch {
      // تجاهل تعطيل التخزين.
    }
  }, [brightness])

  useEffect(() => {
    try {
      localStorage.setItem('fatwa-bookmarks', JSON.stringify(bookmarks))
    } catch {
      // تجاهل تعطيل التخزين.
    }
  }, [bookmarks])

  useEffect(() => {
    try {
      localStorage.setItem('fatwa-highlights', JSON.stringify(highlights))
    } catch {
      // تجاهل تعطيل التخزين.
    }
  }, [highlights])

  const goTo = useCallback(
    (target: number) => {
      if (!detail) return
      setPage(Math.min(detail.pages, Math.max(1, target)))
      setHighlightMode(false)
      setDraftHighlight(null)
      readerRef.current?.scrollTo({ top: 0 })
    },
    [detail],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'ArrowLeft') goTo(page + 1)
      if (event.key === 'ArrowRight') goTo(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, goTo])

  const hits = useMemo<SearchHit[]>(() => {
    if (!query.trim()) return []
    const needle = normalize(query)
    const result: SearchHit[] = []
    manifest?.books
      .filter((book) => /^v\d+$/.test(book.id))
      .forEach((book) => {
        book.toc.forEach((item, index) => {
          if (item.page < 1) return
          if (normalize(item.title).includes(needle)) {
            result.push({
              key: `toc-${book.id}-${index}`,
              title: item.title,
              page: item.page,
              volume: book.id,
              kind: 'toc',
            })
          }
        })
      })
    allOcr.forEach((ocr) => {
      ocr.pages.forEach((item) => {
        item.text
          .split(/\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 2)
          .forEach((line, index) => {
            if (normalize(line).includes(needle)) {
              result.push({
                key: `ocr-${ocr.volume}-${item.page}-${index}`,
                title: line.slice(0, 140),
                page: item.page,
                volume: ocr.volume,
                kind: 'index',
              })
            }
          })
      })
    })
    return result.slice(0, 40)
  }, [manifest, allOcr, query])

  const handleThemeChange = useCallback((next: Theme) => setTheme(next), [])

  const padded = String(page).padStart(4, '0')
  const thumbUrl = detail ? assetUrl(detail.imagePattern.thumb.replace('{page:04d}', padded)) : ''
  const fullUrl =
    detail && FILES_BASE
      ? detail.imagePattern.full
          .replace('{base}', FILES_BASE)
          .replace('{page:04d}', padded)
      : thumbUrl
  // عند توفّر مخزن الصور الكاملة (Archive أو R2) نستخدم الصورة الأصلية حتى عند 100%
  // حتى يظهر المتن واضحاً بدل الصورة المصغّرة؛ المصغّرة تبقى للوضع الافتراضي بدون مخزن.
  const pageImageUrl = FILES_BASE ? fullUrl : thumbUrl
  const volumeNumber = /^v(\d+)$/.exec(detail?.id ?? '')?.[1]
  const downloadUrl = detail
    ? ORIGINAL_BASE
      ? `${ORIGINAL_BASE}/${detail.id}/${detail.file}`
      : volumeNumber
        ? `${ARCHIVE_DOWNLOAD_BASE}/mft${volumeNumber}.pdf`
        : 'https://archive.org/details/mft37'
    : '#'

  const canPrev = page > 1
  const canNext = !!detail && page < detail.pages
  const shareUrl = `${window.location.origin}${window.location.pathname}?v=${volumeId}&p=${page}`
  const shareText = `صفحة ${page} من ${detail?.title ?? 'موسوعة الفتاوى'}`
  const shareLinks = [
    { label: 'الإيميل', icon: Mail, href: `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n${shareUrl}`)}` },
    { label: 'واتساب', icon: MessageCircle, href: `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}` },
    { label: 'إكس', icon: Send, href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}` },
    { label: 'فيسبوك', icon: Share2, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}` },
  ]

  const saveBookmark = () => {
    if (!detail) return
    setBookmarks((items) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          volume: volumeId,
          page,
          label: `المجلد ${volumeNumber ?? volumeId.replace('v', '')} · صفحة ${page}`,
          created: Date.now(),
        },
        ...items,
      ].slice(0, 60),
    )
    setShowBookmarks(true)
    setShowShare(false)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const input = document.createElement('textarea')
      input.value = shareUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stageRef.current?.requestFullscreen()
  }

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const onHighlightDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!highlightMode || !detail) return
    const point = pointFromEvent(event)
    highlightStartRef.current = point
    setDraftHighlight({ ...point, width: 0, height: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onHighlightMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = highlightStartRef.current
    if (!start) return
    const point = pointFromEvent(event)
    setDraftHighlight({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    })
  }

  const onHighlightUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = highlightStartRef.current
    if (!start) return
    const point = pointFromEvent(event)
    const box: HighlightBox = {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    }
    if (box.width > 0.015 && box.height > 0.015) {
      setHighlights((items) => [
        ...items,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          volume: volumeId,
          page,
          ...box,
          created: Date.now(),
        },
      ])
    }
    highlightStartRef.current = null
    setDraftHighlight(null)
    setHighlightMode(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const currentHighlights = highlights.filter((item) => item.volume === volumeId && item.page === page)

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <header className="topbar">
          <BlurFade className="brand-wrap">
            <div className="brand">
              <span className="brand-mark" aria-hidden="true">ف</span>
              <div>
                <AuroraText className="brand-title">موسوعة الفتاوى</AuroraText>
                <p>مجموعة فتاوى شيخ الإسلام ابن تيمية</p>
              </div>
            </div>
          </BlurFade>

          <div className="controls">
            <select
              aria-label="اختر المجلد"
              value={volumeId}
              onChange={(event) => {
                setVolumeId(event.target.value)
                setPage(1)
                setQuery('')
              }}
            >
              {(manifest?.books ?? [])
                .filter((book) => book.id.startsWith('v'))
                .map((book) => {
                  const available = prepared.length === 0 || prepared.includes(book.id)
                  return (
                    <option key={book.id} value={book.id} disabled={!available}>
                      {book.id.replace('v', 'المجلد ')} — {book.title.split(':')[0]}
                      {available ? '' : ' (قريباً)'}
                    </option>
                  )
                })}
            </select>

            <div className="search-wrap">
              <Search className="search-icon" size={16} aria-hidden="true" />
              <input
                type="search"
                value={query}
                placeholder="ابحث في الفهرس والأبواب…"
                onChange={(event) => setQuery(event.target.value)}
                aria-label="البحث"
              />
              {query && (
                <div className="search-results">
                  <div className="results-head">
                    {hits.length ? `${hits.length} نتيجة` : 'لا نتائج — جرّب كلمة من الفهرس'}
                  </div>
                  {hits.map((hit) => (
                    <button
                      key={hit.key}
                      onClick={() => {
                        if (hit.volume !== volumeId) {
                          setVolumeId(hit.volume)
                          setPage(hit.page)
                        } else {
                          goTo(hit.page)
                        }
                        setQuery('')
                      }}
                    >
                      <span className={`badge ${hit.kind}`}>
                        {hit.kind === 'toc' ? `ج${hit.volume.replace('v', '')}` : 'فهرس'}
                      </span>
                      <span className="hit-title">{hit.title}</span>
                      <span className="hit-page">ص {hit.page}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <AnimatedThemeToggler theme={theme} onThemeChange={handleThemeChange} />

            <button
              className="ghost"
              onClick={() => setShowToc((value) => !value)}
              aria-expanded={showToc}
              aria-label={showToc ? 'إخفاء الفهرس' : 'إظهار الفهرس'}
            >
              <List size={16} aria-hidden="true" />
              <span className="ghost-label">{showToc ? 'إخفاء الفهرس' : 'إظهار الفهرس'}</span>
            </button>
            <a className="ghost ghost-download" href={downloadUrl} download aria-label="تحميل الملف الأصلي">
              <Download size={16} aria-hidden="true" />
              <span className="ghost-label">تحميل الأصل</span>
            </a>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <div className={`layout ${showToc ? '' : 'no-toc'}`}>
          {showToc && (
            <button className="toc-scrim" onClick={() => setShowToc(false)} aria-label="إغلاق الفهرس" />
          )}
          {showToc && (
            <aside className="sidebar">
              <div className="sidebar-head">
                <h2>فهرس المجلد</h2>
                <button className="sidebar-close" onClick={() => setShowToc(false)} aria-label="إغلاق الفهرس">×</button>
              </div>
              {detail?.toc.filter((item) => item.page > 0).map((item, index) => (
                <button
                  key={`${item.title}-${index}`}
                  className={`toc-item depth-${Math.min(item.level, 3)} ${item.page === page ? 'active' : ''}`}
                  onClick={() => goTo(item.page)}
                >
                  <span>{item.title}</span>
                  <small>{item.page}</small>
                </button>
              ))}
              <div className="sidebar-note">
                البحث يعمل في أسماء الأبواب وصفحات الفهرس المطبوع في كل المجلدات المجهّزة. نتائج الفهرس تقريبية، والصورة الأصلية هي المرجع المعتمد.
              </div>
            </aside>
          )}

          <main className="reader-area">
            <div className="reader-toolbar">
              <div className="reader-nav">
                <ShimmerButton
                  className="nav-button"
                  onClick={() => goTo(page - 1)}
                  disabled={!canPrev}
                  aria-label="الصفحة السابقة"
                >
                  <ChevronRight size={22} strokeWidth={2.4} aria-hidden="true" />
                  <span className="nav-button__text">
                    <strong>السابق</strong>
                    <small>{canPrev ? `صفحة ${page - 1}` : 'أول صفحة'}</small>
                  </span>
                  <kbd>→</kbd>
                </ShimmerButton>

                <div className="page-input">
                  <span>صفحة</span>
                  <input
                    type="number"
                    min={1}
                    max={detail?.pages ?? 1}
                    value={page}
                    onChange={(event) => goTo(Number(event.target.value) || 1)}
                    aria-label="رقم الصفحة"
                  />
                  <span>/ {detail?.pages ?? '—'}</span>
                </div>

                <ShimmerButton
                  className="nav-button"
                  onClick={() => goTo(page + 1)}
                  disabled={!canNext}
                  aria-label="الصفحة التالية"
                >
                  <ChevronLeft size={22} strokeWidth={2.4} aria-hidden="true" />
                  <span className="nav-button__text">
                    <strong>التالي</strong>
                    <small>{canNext ? `صفحة ${page + 1}` : 'آخر صفحة'}</small>
                  </span>
                  <kbd>←</kbd>
                </ShimmerButton>
              </div>

              <span className="spacer" />

              <div className="toolbar-tools">
                <span className="keyboard-hint">تنقّل أيضاً بـ ← و→</span>

                <button
                  className={`tool-button toc-tool-button ${showToc ? 'active' : ''}`}
                  onClick={() => setShowToc((value) => !value)}
                  aria-expanded={showToc}
                  title="فتح أو إغلاق فهرس المجلد"
                >
                  <List size={16} aria-hidden="true" />
                  <span>الفهرس</span>
                </button>

                <div className="brightness-control" title="شدة إضاءة الصفحة">
                  <SlidersHorizontal size={15} aria-hidden="true" />
                  <input
                    type="range"
                    min={60}
                    max={140}
                    value={brightness}
                    onChange={(event) => setBrightness(Number(event.target.value))}
                    aria-label="شدة إضاءة الصفحة"
                  />
                  <span>{brightness}%</span>
                </div>

                <button
                  className={`tool-button ${highlightMode ? 'active' : ''}`}
                  onClick={() => setHighlightMode((value) => !value)}
                  title="اسحب على الصورة لتظليل جزء منها"
                >
                  <Highlighter size={16} aria-hidden="true" />
                  <span>تظليل</span>
                </button>

                <div className="popover-wrap">
                  <button
                    className={`tool-button ${showBookmarks ? 'active' : ''}`}
                    onClick={() => {
                      setShowBookmarks((value) => !value)
                      setShowShare(false)
                    }}
                    title="المراجع المحفوظة"
                  >
                    <Bookmark size={16} aria-hidden="true" />
                    <span>مراجعي</span>
                    {bookmarks.length > 0 && <b>{bookmarks.length}</b>}
                  </button>
                  {showBookmarks && (
                    <div className="popover bookmarks-popover">
                      <div className="popover-head">
                        <strong>المراجع المحفوظة</strong>
                        <button className="popover-close" onClick={() => setShowBookmarks(false)} aria-label="إغلاق">×</button>
                      </div>
                      <button className="popover-action" onClick={saveBookmark} disabled={!detail}>
                        <Bookmark size={15} aria-hidden="true" />
                        حفظ هذه الصفحة
                      </button>
                      <div className="bookmark-list">
                        {bookmarks.length === 0 && <p className="popover-empty">لم تحفظ أي مرجع بعد.</p>}
                        {bookmarks.map((item) => (
                          <div className="bookmark-row" key={item.id}>
                            <button
                              onClick={() => {
                                setVolumeId(item.volume)
                                setPage(item.page)
                                setShowBookmarks(false)
                              }}
                            >
                              <span>{item.label}</span>
                              <small>ج{item.volume.replace('v', '')}</small>
                            </button>
                            <button
                              className="row-delete"
                              onClick={() => setBookmarks((items) => items.filter((entry) => entry.id !== item.id))}
                              aria-label="حذف المرجع"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="popover-wrap">
                  <button
                    className={`tool-button ${showShare ? 'active' : ''}`}
                    onClick={() => {
                      setShowShare((value) => !value)
                      setShowBookmarks(false)
                    }}
                    title="مشاركة الصفحة"
                  >
                    <Share2 size={16} aria-hidden="true" />
                    <span>مشاركة</span>
                  </button>
                  {showShare && (
                    <div className="popover share-popover">
                      <div className="popover-head">
                        <strong>مشاركة هذه الصفحة</strong>
                        <button className="popover-close" onClick={() => setShowShare(false)} aria-label="إغلاق">×</button>
                      </div>
                      <button className="popover-action" onClick={() => void copyLink()}>
                        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                        {copied ? 'تم نسخ الرابط' : 'نسخ الرابط'}
                      </button>
                      {'share' in navigator && (
                        <button
                          className="popover-action"
                          onClick={() => {
                            void navigator.share({ title: shareText, url: shareUrl }).catch(() => {})
                          }}
                        >
                          <Share2 size={15} aria-hidden="true" />
                          مشاركة الجهاز
                        </button>
                      )}
                      <div className="share-links">
                        {shareLinks.map(({ label, icon: Icon, href }) => (
                          <a key={label} href={href} target="_blank" rel="noreferrer">
                            <Icon size={15} aria-hidden="true" />
                            {label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  className="tool-button zoom-preset"
                  onClick={() => setZoom((value) => (value > 1 ? 1 : isNarrow ? 2 : 1.5))}
                  title="حجم مناسب للقراءة"
                >
                  <BookOpen size={16} aria-hidden="true" />
                  <span>قراءة</span>
                </button>

                <div className="zoom-control">
                  <button onClick={() => setZoom((value) => Math.max(1, value - 0.25))} aria-label="تصغير" disabled={zoom <= 1}>
                    <Minus size={16} aria-hidden="true" />
                  </button>
                  <span className="zoom-label">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom((value) => Math.min(3, value + 0.25))} aria-label="تكبير" disabled={zoom >= 3}>
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </div>
                <button className="tool-button" onClick={toggleFullscreen} title="ملء الشاشة">
                  <Maximize2 size={16} aria-hidden="true" />
                  <span>ملء الشاشة</span>
                </button>
              </div>
            </div>

            <div className="stage" ref={stageRef}>
              {highlightMode && <div className="highlight-hint">اسحب على الصورة لتظليل الموضع الذي تريد العودة إليه</div>}
              <div className="page-scroll" ref={readerRef}>
                {detail ? (
                  <div
                    className={`page-frame ${highlightMode ? 'highlighting' : ''}`}
                    style={{ width: `${zoom * 100}%`, maxWidth: zoom > 1 ? 'none' : undefined }}
                    onPointerDown={onHighlightDown}
                    onPointerMove={onHighlightMove}
                    onPointerUp={onHighlightUp}
                    onPointerCancel={() => {
                      highlightStartRef.current = null
                      setDraftHighlight(null)
                    }}
                  >
                    <img src={pageImageUrl} alt={`صفحة ${page} من ${detail.title}`} draggable={false} />
                    <div className="highlight-overlay">
                      {currentHighlights.map((item) => (
                        <button
                          key={item.id}
                          className="highlight-box"
                          style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%` }}
                          onClick={() => setHighlights((items) => items.filter((entry) => entry.id !== item.id))}
                          onPointerDown={(event) => event.stopPropagation()}
                          title="اضغط لإزالة التظليل"
                          aria-label="إزالة التظليل"
                        />
                      ))}
                      {draftHighlight && (
                        <div
                          className="highlight-box draft"
                          style={{ left: `${draftHighlight.x * 100}%`, top: `${draftHighlight.y * 100}%`, width: `${draftHighlight.width * 100}%`, height: `${draftHighlight.height * 100}%` }}
                        />
                      )}
                    </div>
                    {zoom > 1 && !FILES_BASE && (
                      <div className="zoom-hint">الصورة المصغّرة معروضة؛ اضبط VITE_FILES_BASE لعرض الصور الكاملة.</div>
                    )}
                  </div>
                ) : (
                  <div className="loading">جارٍ تحميل المجلد…</div>
                )}
              </div>

              <div className="floating-nav" role="group" aria-label="التنقل السريع بين الصفحات">
                <button
                  className="floating-nav__button"
                  onClick={() => goTo(page - 1)}
                  disabled={!canPrev}
                  aria-label="الصفحة السابقة"
                >
                  <ChevronRight size={26} strokeWidth={2.5} aria-hidden="true" />
                  <span>السابق</span>
                  <small>{canPrev ? `ص ${page - 1}` : 'الأولى'}</small>
                </button>
                <div className="floating-nav__center" aria-live="polite">
                  <span>صفحة</span>
                  <strong>{page}</strong>
                  <span>من {detail?.pages ?? '—'}</span>
                </div>
                <button
                  className="floating-nav__button"
                  onClick={() => goTo(page + 1)}
                  disabled={!canNext}
                  aria-label="الصفحة التالية"
                >
                  <ChevronLeft size={26} strokeWidth={2.5} aria-hidden="true" />
                  <span>التالي</span>
                  <small>{canNext ? `ص ${page + 1}` : 'الأخيرة'}</small>
                </button>
              </div>
            </div>
          </main>
        </div>

        <footer>
          <span>{manifest?.source ?? ''}</span>
          <span>{manifest?.total_pages?.toLocaleString('ar') ?? ''} صفحة في الموسوعة</span>
        </footer>
      </div>
    </MotionConfig>
  )
}
