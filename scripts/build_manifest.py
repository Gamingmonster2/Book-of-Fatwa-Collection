"""استخراج بيانات كل المجلدات من ملفات PDF الأصلية.

الناتج: data/manifest.json
يستخدم PyMuPDF لقراءة البيانات الوصفية وفهارس الإشارات المرجعية (bookmarks).
"""
import json
from pathlib import Path

import fitz

SCRIPTS = Path(__file__).resolve().parent
REPO = SCRIPTS.parent
SOURCE = REPO.parent
DATA = REPO / "public" / "data"


def volume_id(filename: str) -> str:
    if filename.startswith("00_"):
        return "front"
    if "-1p" in filename:
        return "preview-v01"
    return f"v{int(filename[:2]):02d}"


def clean(value: str) -> str:
    return value.replace("\x00", "").strip()


def main() -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    books = []
    for path in sorted(SOURCE.glob("*.pdf")):
        with fitz.open(path) as doc:
            toc = [
                {"level": level, "title": clean(title), "page": page}
                for level, title, page in doc.get_toc()
            ]
            books.append(
                {
                    "id": volume_id(path.name),
                    "file": path.name,
                    "title": clean(doc.metadata.get("title") or path.stem),
                    "author": clean(doc.metadata.get("author") or ""),
                    "pages": doc.page_count,
                    "toc": toc,
                }
            )
            print(f"{path.name:22} {doc.page_count:4} صفحة  {len(toc):3} إشارة")

    manifest = {
        "title": "مجموعة فتاوى شيخ الإسلام ابن تيمية",
        "source": "Internet Archive - نسخة مفتوحة",
        "total_pages": sum(b["pages"] for b in books),
        "books": books,
    }
    (DATA / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nالمجموع: {len(books)} ملف، {manifest['total_pages']} صفحة")


if __name__ == "__main__":
    main()
