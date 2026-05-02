"""Capture the local Windows screen and publish it through the repo.

Purpose
-------
This is a local 'getscreen' helper for Local Dev Agent.
GitHub is used only as a transport buffer between Action Bridge and GPT:

    ImageGrab -> PNG -> sanity check -> screenshots/latest-screenshot.png

The script does not open the image locally and does not print base64.
After this script succeeds, commit and push only screenshots/latest-screenshot.png.
"""

from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageGrab

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "screenshots"
OUT_PATH = OUT_DIR / "latest-screenshot.png"
RAW_URL = "https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/main/screenshots/latest-screenshot.png"


def run_git(*args: str) -> None:
    result = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        print(result.stdout, end="")
        print(result.stderr, end="", file=sys.stderr)
        raise SystemExit(result.returncode)


def capture_png() -> dict[str, object]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    img = ImageGrab.grab(all_screens=False)
    img.save(OUT_PATH, format="PNG", optimize=False)

    if not OUT_PATH.exists():
        raise RuntimeError(f"capture failed: {OUT_PATH} was not created")

    size_bytes = OUT_PATH.stat().st_size
    if size_bytes <= 0:
        raise RuntimeError("capture failed: PNG is empty")

    with Image.open(OUT_PATH) as check:
        width, height = check.size
        mode = check.mode
        sample = check.convert("RGB").resize((32, 18))
        unique_colors = len(sample.getcolors(maxcolors=32 * 18) or [])

    if width < 100 or height < 100:
        raise RuntimeError(f"capture looks invalid: {width}x{height}")

    if unique_colors < 8:
        raise RuntimeError(
            f"capture looks blank/monochrome: sampled_unique_colors={unique_colors}"
        )

    sha256 = hashlib.sha256(OUT_PATH.read_bytes()).hexdigest()
    return {
        "path": str(OUT_PATH),
        "width": width,
        "height": height,
        "mode": mode,
        "bytes": size_bytes,
        "sha256": sha256,
        "sampled_unique_colors": unique_colors,
    }


def publish() -> None:
    run_git("add", "screenshots/latest-screenshot.png")
    run_git("commit", "-m", "Update latest screenshot", "--", "screenshots/latest-screenshot.png")
    run_git("push", "origin", "main")


def main() -> int:
    try:
        meta = capture_png()
        print("CAPTURE_OK")
        for key, value in meta.items():
            print(f"{key}={value}")

        publish()
        print("PUBLISH_OK")
        print(f"raw_url={RAW_URL}")
        return 0
    except subprocess.CalledProcessError as exc:
        print(f"GIT_ERROR {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"GETSCREEN_ERROR {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
