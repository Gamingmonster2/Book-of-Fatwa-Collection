// اختبار سريع لمحرك OCR على صورة واحدة.
// Usage: node scripts/ocr-file.mjs build/test-index.png
import { createWorker } from 'tesseract.js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const image = resolve(root, process.argv[2])
const worker = await createWorker('ara', 1, {
  langPath: resolve(root, 'assets', 'tessdata'),
  gzip: false,
  cacheMethod: 'none',
})
await worker.setParameters({ tessedit_pageseg_mode: '6' })
const { data } = await worker.recognize(image)
console.log(data.text)
await worker.terminate()
