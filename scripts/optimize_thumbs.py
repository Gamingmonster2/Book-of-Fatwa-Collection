"""Re-encode prepared volume thumbnails to smaller WebP files.

Usage:
  python scripts/optimize_thumbs.py                 # in place, v11-v37
  python scripts/optimize_thumbs.py --dest DIR      # write copies to DIR instead

Only thumbnails of volumes with an existing volume JSON are touched; full-resolution
images, OCR data, and manifest data are never modified.
"""
import argparse
import json
from pathlib import Path

from PIL import Image

SCRIPTS = Path(__file__).resolve().parent
REPO = SCRIPTS.parent
DATA = REPO / "public" / "data"
PUBLIC = REPO / "public" / "files"


def dir_size(path: Path) -> int:
    return sum(p.stat().st_size for p in path.glob("p*.webp"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=int, default=11)
    parser.add_argument("--end", type=int, default=37)
    parser.add_argument("--max-width", type=int, default=632)
    parser.add_argument("--quality", type=int, default=50)
    parser.add_argument("--method", type=int, default=6)
    parser.add_argument("--grayscale", action="store_true")
    parser.add_argument("--bilevel", action="store_true")
    parser.add_argument("--threshold", type=int, default=180)
    parser.add_argument("--dest", type=Path, default=None)
    args = parser.parse_args()

    total_before = 0
    total_after = 0
    total_files = 0
    problems = []

    for number in range(args.start, args.end + 1):
        volume = f"v{number:02d}"
        detail_path = DATA / "volumes" / f"{volume}.json"
        if not detail_path.exists():
            continue
        expected_pages = json.loads(detail_path.read_text(encoding="utf-8"))["pages"]
        source_dir = PUBLIC / volume / "thumbs"
        files = sorted(source_dir.glob("p*.webp"))
        if len(files) != expected_pages:
            problems.append(f"{volume}: {len(files)} thumbs, expected {expected_pages}")
            continue

        target_dir = args.dest / volume / "thumbs" if args.dest else source_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        before = dir_size(source_dir) if not args.dest else sum(p.stat().st_size for p in files)

        for source in files:
            with Image.open(source) as opened:
                opened.load()
                image = opened
                width, height = image.size
                if width > args.max_width:
                    new_height = max(1, round(height * args.max_width / width))
                    image = image.resize(
                        (args.max_width, new_height), Image.Resampling.LANCZOS
                    )
                if args.grayscale:
                    image = image.convert("L")
                lossless = False
                if args.bilevel:
                    gray = image.convert("L")
                    threshold = args.threshold
                    image = gray.point(
                        lambda value: 255 if value > threshold else 0
                    ).convert("1")
                    lossless = True
                image.save(
                    target_dir / source.name,
                    "WEBP",
                    quality=args.quality,
                    method=args.method,
                    lossless=lossless,
                )

        after = dir_size(target_dir)
        total_before += before
        total_after += after
        total_files += len(files)
        print(
            f"{volume}: {len(files)} files  "
            f"{before / 1e6:8.1f} MB -> {after / 1e6:8.1f} MB"
        )

    print(
        f"\nTOTAL: {total_files} files  "
        f"{total_before / 1e6:.1f} MB -> {total_after / 1e6:.1f} MB"
    )
    if problems:
        print("\nPROBLEMS:")
        for problem in problems:
            print(f"- {problem}")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
