// OCR موجّه لصفحات الفهرس فقط — ليس لكامل المتن.
// Usage: npm run ocr:index -- v01
import { createWorker } from 'tesseract.js'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const volume = process.argv[2] || 'v01'

const detail = JSON.parse(
  await readFile(resolve(root, 'public', 'data', 'volumes', `${volume}.json`), 'utf8'),
)
const { indexStart, indexEnd, pages: total } = detail
if (!indexStart) throw new Error(`لا يوجد فهرس في ${volume}`)

const worker = await createWorker('ara', 1, {
  langPath: resolve(root, 'assets', 'tessdata'),
  gzip: false,
  cacheMethod: 'none',
})

await worker.setParameters({ tessedit_pageseg_mode: '6' })

const results = []
for (let page = indexStart; page <= Math.min(indexEnd ?? total, total); page++) {
  const name = `p${String(page).padStart(4, '0')}.webp`
  let image = resolve(root, 'build', 'images', volume, 'full', name)
  try {
    await readFile(image)
  } catch {
    image = resolve(root, 'public', 'files', volume, 'thumbs', name)
  }
  const { data } = await worker.recognize(image)
  results.push({ page, text: data.text.trim() })
  console.log(`OCR ${volume} page ${page}: ${data.text.trim().length} حرف`)
}

await worker.terminate()

const output = { volume, source: 'الفهرس المطبوع - OCR للإرشاد فقط', pages: results }
const target = resolve(root, 'public', 'data', 'ocr', `${volume}-index.json`)
await mkdir(dirname(target), { recursive: true })
await writeFile(target, JSON.stringify(output, null, 2), 'utf8')
console.log(`تم: ${target}`)
