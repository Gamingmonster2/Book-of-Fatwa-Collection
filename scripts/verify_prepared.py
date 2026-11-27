"""Verify prepared volumes: image counts, JSON validity, and prepared.json coverage.

Usage: python scripts/verify_prepared.py
"""
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
REPO = SCRIPTS.parent
DATA = REPO / "public" / "data"
PUBLIC = REPO / "public" / "files"
FULL = REPO / "build" / "images"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    manifest = load_json(DATA / "manifest.json")
    by_id = {b["id"]: b for b in manifest["books"]}
    prepared = load_json(DATA / "prepared.json")
    problems = []

    if prepared != sorted(prepared, key=lambda v: int(v[1:])):
        problems.append("prepared.json is not sorted by volume number")

    total_pages = 0
    total_ocr_pages = 0
    for volume in prepared:
        if volume not in by_id:
            problems.append(f"{volume}: missing from manifest")
            continue

        detail_path = DATA / "volumes" / f"{volume}.json"
        try:
            detail = load_json(detail_path)
        except Exception as exc:
            problems.append(f"{volume}: invalid volume JSON ({exc})")
            continue

        expected_pages = by_id[volume]["pages"]
        if detail.get("pages") != expected_pages:
            problems.append(
                f"{volume}: volume JSON pages={detail.get('pages')} expected={expected_pages}"
            )

        thumb_dir = PUBLIC / volume / "thumbs"
        full_dir = FULL / volume / "full"
        thumbs = list(thumb_dir.glob("p*.webp")) if thumb_dir.exists() else []
        fulls = list(full_dir.glob("p*.webp")) if full_dir.exists() else []
        if len(thumbs) != expected_pages:
            problems.append(f"{volume}: thumbs={len(thumbs)} expected={expected_pages}")
        if len(fulls) != expected_pages:
            problems.append(f"{volume}: fulls={len(fulls)} expected={expected_pages}")
        expected_names = {f"p{i:04d}.webp" for i in range(1, expected_pages + 1)}
        if thumbs and {p.name for p in thumbs} != expected_names:
            problems.append(f"{volume}: thumb filenames incomplete or unexpected")
        if fulls and {p.name for p in fulls} != expected_names:
            problems.append(f"{volume}: full filenames incomplete or unexpected")

        ocr_path = DATA / "ocr" / f"{volume}-index.json"
        try:
            ocr = load_json(ocr_path)
        except Exception as exc:
            problems.append(f"{volume}: invalid/missing OCR JSON ({exc})")
            continue
        if ocr.get("volume") != volume:
            problems.append(f"{volume}: OCR volume field mismatch")
        if ocr.get("source") != "الفهرس المطبوع - OCR للإرشاد فقط":
            problems.append(f"{volume}: OCR source field mismatch")
        start = detail.get("indexStart")
        end = detail.get("indexEnd") or expected_pages
        expected_ocr_pages = end - start + 1 if start else 0
        rows = ocr.get("pages") or []
        if len(rows) != expected_ocr_pages:
            problems.append(
                f"{volume}: OCR pages={len(rows)} expected={expected_ocr_pages}"
            )
        page_numbers = [row.get("page") for row in rows]
        if start and page_numbers != list(range(start, end + 1)):
            problems.append(f"{volume}: OCR page numbers are not contiguous")

        total_pages += expected_pages
        total_ocr_pages += len(rows)
        print(f"{volume}: pages={expected_pages} thumbs={len(thumbs)} fulls={len(fulls)} ocr={len(rows)}")

    print(f"\nvolumes={len(prepared)} pages={total_pages} ocr_pages={total_ocr_pages}")
    if problems:
        print("\nPROBLEMS:")
        for problem in problems:
            print(f"- {problem}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
