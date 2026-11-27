"""تجهيز مجلد واحد للعرض: صور مصغّرة في المستودع وصور كاملة للرفع إلى R2.

الاستخدام: python scripts/prepare_volume.py v01
"""
import argparse
import json
from pathlib import Path

import fitz
from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
REPO = SCRIPTS.parent
DATA = REPO / "public" / "data"
PUBLIC = REPO / "public" / "files"
FULL = REPO / "build" / "images"


def render(doc: fitz.Document, index: int, scale: float, output: Path) -> None:
    pix = doc[index].get_pixmap(
        matrix=fitz.Matrix(scale, scale),
        colorspace=fitz.csGRAY,
        alpha=False,
    )
    image = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "WEBP", quality=82, method=5)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("volume", nargs="?", default="v01")
    args = parser.parse_args()
    volume = args.volume

    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    book = next(b for b in manifest["books"] if b["id"] == volume)
    source = REPO.parent / book["file"]

    thumb_dir = PUBLIC / volume / "thumbs"
    full_dir = FULL / volume / "full"
    full_dir.mkdir(parents=True, exist_ok=True)

    with fitz.open(source) as doc:
        for i in range(doc.page_count):
            number = i + 1
            render(doc, i, 1.4, thumb_dir / f"p{number:04d}.webp")
            render(doc, i, 3.4, full_dir / f"p{number:04d}.webp")
            if number % 50 == 0 or number == doc.page_count:
                print(f"{volume}: {number}/{doc.page_count}", flush=True)

    index_start = next(
        (entry["page"] for entry in book["toc"] if "فهرس" in entry["title"]),
        None,
    )
    detail = {
        "id": volume,
        "title": book["title"],
        "file": book["file"],
        "pages": book["pages"],
        "toc": book["toc"],
        "indexStart": index_start,
        "indexEnd": book["pages"] if index_start else None,
        "imagePattern": {
            "thumb": f"/files/{volume}/thumbs/p{{page:04d}}.webp",
            "full": f"{{base}}/{volume}/full/p{{page:04d}}.webp",
        },
    }
    out = DATA / "volumes" / f"{volume}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(detail, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"تم: {out}")


if __name__ == "__main__":
    main()
