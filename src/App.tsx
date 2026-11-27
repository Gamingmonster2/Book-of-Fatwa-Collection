import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

const FILES_BASE = (import.meta.env.VITE_FILES_BASE as string | undefined)?.replace(/\/$/, '')
const ORIGINAL_BASE = (import.meta.env.VITE_ORIGINAL_BASE as string | undefined)?.replace(/\/$/, '')
// النسخة المفتوحة على Internet Archive (ملفات mftNN.pdf مطابقة للملفات الأصلية)
const ARCHIVE_DOWNLOAD_BASE = 'https://archive.org/download/mft37'

function assetUrl(path: string): string {
  return new URL(path.replace(/^\/+/, ''), document.baseURI).href
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

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [volumeId, setVolumeId] = useState(() => initialParam('v', 'v01'))
  const [detail, setDetail] = useState<VolumeDetail | null>(null)
  const [prepared, setPrepared] = useState<string[]>([])
  const [allOcr, setAllOcr] = useState<OcrIndex[]>([])
  const [page, setPage] = useState(() => Number(initialParam('p', '1')) || 1)
  const [query, setQuery] = useState(() => initialParam('q', ''))
  const [zoom, setZoom] = useState(1)
  const [showToc, setShowToc] = useState(true)
  const [error, setError] = useState('')
  const readerRef = useRef<HTMLDivElement>(null)

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

  const goTo = useCallback(
    (target: number) => {
      if (!detail) return
      setPage(Math.min(detail.pages, Math.max(1, target)))
      readerRef.current?.scrollTo({ top: 0 })
    },
    [detail],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'ArrowLeft') goTo(page - 1)
      if (event.key === 'ArrowRight') goTo(page + 1)
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

  const padded = String(page).padStart(4, '0')
  const thumbUrl = detail ? assetUrl(detail.imagePattern.thumb.replace('{page:04d}', padded)) : ''
  const fullUrl =
    detail && FILES_BASE
      ? detail.imagePattern.full
          .replace('{base}', FILES_BASE)
          .replace('{page:04d}', padded)
      : thumbUrl
  const volumeNumber = /^v(\d+)$/.exec(detail?.id ?? '')?.[1]
  const downloadUrl = detail
    ? ORIGINAL_BASE
      ? `${ORIGINAL_BASE}/${detail.id}/${detail.file}`
      : volumeNumber
        ? `${ARCHIVE_DOWNLOAD_BASE}/mft${volumeNumber}.pdf`
        : 'https://archive.org/details/mft37'
    : '#'

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void readerRef.current?.requestFullscreen()
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">ف</span>
          <div>
            <h1>موسوعة الفتاوى</h1>
            <p>مجموعة فتاوى شيخ الإسلام ابن تيمية</p>
          </div>
        </div>

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

          <button className="ghost" onClick={() => setShowToc((value) => !value)}>
            {showToc ? 'إخفاء الفهرس' : 'إظهار الفهرس'}
          </button>
          <a className="ghost" href={downloadUrl} download>
            تحميل الأصل
          </a>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className={`layout ${showToc ? '' : 'no-toc'}`}>
        {showToc && (
          <aside className="sidebar">
            <h2>فهرس المجلد</h2>
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
            <button onClick={() => goTo(page - 1)} disabled={page <= 1}>
              السابق ‹
            </button>
            <div className="page-input">
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
            <button onClick={() => goTo(page + 1)} disabled={!!detail && page >= detail.pages}>
              › التالي
            </button>
            <span className="spacer" />
            <button onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>−</button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>＋</button>
            <button onClick={toggleFullscreen}>ملء الشاشة</button>
          </div>

          <div className="page-scroll" ref={readerRef}>
            {detail ? (
              <div className="page-frame" style={{ width: `${zoom * 100}%` }}>
                <img src={zoom > 1 ? fullUrl : thumbUrl} alt={`صفحة ${page} من ${detail.title}`} />
                {zoom > 1 && !FILES_BASE && (
                  <div className="zoom-hint">الصورة المصغّرة معروضة؛ اضبط VITE_FILES_BASE للصور الكاملة.</div>
                )}
              </div>
            ) : (
              <div className="loading">جارٍ تحميل المجلد…</div>
            )}
          </div>
        </main>
      </div>

      <footer>
        <span>{manifest?.source ?? ''}</span>
        <span>{manifest?.total_pages?.toLocaleString('ar') ?? ''} صفحة في الموسوعة</span>
      </footer>
    </div>
  )
}
