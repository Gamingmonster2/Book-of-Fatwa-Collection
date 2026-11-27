"""Pack the full page images (and optionally the built site) for Internet Archive.

Internet Archive is free, needs no payment card, and is a good long-term home
for the source pages. Upload the produced zip to a new item and set
VITE_FILES_BASE to https://archive.org/download/<item-id> when building.

Usage:
  .venv/Scripts/python.exe scripts/make_archive_bundle.py
  .venv/Scripts/python.exe scripts/make_archive_bundle.py --no-site --force
"""
import argparse
import json
import zipfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
REPO = SCRIPTS.parent
DATA = REPO / "public" / "data"
IMAGES = REPO / "build" / "images"
SITE = REPO / "dist"
OUT = REPO / "build" / "archive" / "fatwa-full-images.zip"

NOTICE = """موسوعة الفتاوى — صور الصفحات كاملة الحجم

البنية داخل هذا الأرشيف:
  vNN/full/pNNNN.webp   صور الصفحات المستخدمة عند التكبير في القارئ
  site/                 نسخة من الواجهة المبنية (اختياري)

لربط الموقع الحي بهذه الصور:
  VITE_FILES_BASE=https://archive.org/download/<ITEM-ID>
  npm run build && npx wrangler deploy

الصور مصدرها الملفات الأصلية المتاحة على Internet Archive (mft37).
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=OUT)
    parser.add_argument("--no-site", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if args.output.exists() and not args.force:
        raise SystemExit(f"الملف موجود بالفعل: {args.output} (استخدم --force للاستبدال)")

    prepared = json.loads((DATA / "prepared.json").read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)

    count = 0
    with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_STORED) as bundle:
        bundle.writestr("README.txt", NOTICE)
        for volume in prepared:
            source_dir = IMAGES / volume / "full"
            files = sorted(source_dir.glob("p*.webp"))
            if not files:
                raise SystemExit(f"لا توجد صور كاملة للمجلد {volume}")
            for image in files:
                bundle.write(image, f"{volume}/full/{image.name}")
                count += 1
            print(f"{volume}: {len(files)} صورة")

        if not args.no_site and SITE.is_dir():
            for path in sorted(SITE.rglob("*")):
                if path.is_file():
                    bundle.write(path, f"site/{path.relative_to(SITE).as_posix()}")

    size = args.output.stat().st_size / 1e9
    print(f"\nTOTAL: {count} images -> {args.output} ({size:.2f} GB)")


if __name__ == "__main__":
    main()
