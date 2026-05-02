#!/usr/bin/env python3
"""Capture, validate, and optionally publish an immutable PNG screenshot.

Designed for local Action Bridge / Local Dev Agent execution from the target repo.
Never prints image bytes or base64; stdout is compact JSON metadata only.

This script does not perform visual analysis. A successful capture/publish is still
metadata until ChatGPT or another vision-capable path loads the commit-pinned PNG.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_OWNER = "FokusNIK9"
DEFAULT_REPO = "mcp-gpt-auto"
DEFAULT_BRANCH = "main"
DEFAULT_LATEST_PATH = "screenshots/latest-screenshot.png"


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso_z(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sampled_unique_colors(image, max_samples_per_axis: int = 64) -> int:
    """Return the number of unique colors from a regular grid sample."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    step_x = max(1, width // max_samples_per_axis)
    step_y = max(1, height // max_samples_per_axis)
    colors = set()
    for y in range(0, height, step_y):
        for x in range(0, width, step_x):
            colors.add(rgb.getpixel((x, y)))
    return len(colors)


def run_git(args: list[str], *, check: bool = True, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        check=check,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=text,
    )


def git_root() -> Path | None:
    try:
        proc = run_git(["rev-parse", "--show-toplevel"])
        return Path(proc.stdout.strip())
    except Exception:
        return None


def path_for_git(path: Path) -> str:
    root = git_root()
    if root is None:
        return path.as_posix()
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except Exception:
        return path.as_posix()


def previous_committed_sha256(path: Path) -> str | None:
    """Return sha256 of the file at HEAD without touching the worktree."""
    git_path = path_for_git(path)
    try:
        proc = subprocess.run(
            ["git", "show", f"HEAD:{git_path}"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None
    return hashlib.sha256(proc.stdout).hexdigest()


def validate_png(path: Path, min_bytes: int, min_width: int, min_height: int, min_colors: int) -> dict[str, Any]:
    result: dict[str, Any] = {
        "exists": path.exists(),
        "size_bytes": 0,
        "width": 0,
        "height": 0,
        "sampled_unique_colors": 0,
        "sha256": None,
        "checks": {},
    }
    checks = result["checks"]
    checks["exists"] = bool(result["exists"])
    if not path.exists():
        result["ok"] = False
        return result

    result["size_bytes"] = path.stat().st_size
    result["sha256"] = sha256_file(path)
    checks["size_gt_min"] = result["size_bytes"] > min_bytes

    try:
        from PIL import Image
    except Exception as exc:  # pragma: no cover - environment dependent
        result["ok"] = False
        result["error"] = f"failed to import pillow for validation: {exc}"
        return result

    with Image.open(path) as image:
        result["width"], result["height"] = image.size
        result["sampled_unique_colors"] = sampled_unique_colors(image)

    checks["width_plausible"] = result["width"] >= min_width
    checks["height_plausible"] = result["height"] >= min_height
    checks["color_variation_plausible"] = result["sampled_unique_colors"] >= min_colors
    result["ok"] = all(bool(value) for value in checks.values())
    return result


def github_raw_url(owner: str, repo: str, ref: str, git_path: str) -> str:
    return f"https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{git_path}"


def short_status() -> list[str]:
    try:
        proc = run_git(["status", "--short"])
        return [line for line in proc.stdout.splitlines() if line.strip()]
    except Exception:
        return []


def detect_unrelated_status(status_lines: list[str], allowed_paths: set[str]) -> list[str]:
    unrelated: list[str] = []
    for line in status_lines:
        path_part = line[3:] if len(line) > 3 else line
        # Rename lines look like "old -> new"; inspect the destination but keep the full line.
        candidate = path_part.split(" -> ")[-1]
        if candidate not in allowed_paths:
            unrelated.append(line)
    return unrelated


def publish_files(
    unique_git_path: str,
    latest_git_path: str,
    owner: str,
    repo: str,
    branch: str,
    short_sha: str,
) -> dict[str, Any]:
    allowed = {unique_git_path, latest_git_path}
    status_before = short_status()
    unrelated_before = detect_unrelated_status(status_before, allowed)

    result: dict[str, Any] = {
        "ok": False,
        "pushed_branch": branch,
        "commit_sha": None,
        "commit_raw_url": None,
        "latest_main_raw_url": github_raw_url(owner, repo, branch, latest_git_path),
        "unique_main_raw_url": github_raw_url(owner, repo, branch, unique_git_path),
        "status_before": status_before,
        "unrelated_changes_ignored": unrelated_before,
    }

    try:
        run_git(["add", "--", unique_git_path, latest_git_path])
        commit = run_git(
            [
                "commit",
                "-m",
                f"Update screenshot capture {short_sha}",
                "--",
                unique_git_path,
                latest_git_path,
            ],
            check=False,
        )
        result["commit_stdout"] = commit.stdout.strip()
        result["commit_stderr"] = commit.stderr.strip()
        if commit.returncode != 0:
            result["error"] = "git commit failed or there was nothing to commit"
            return result

        push = run_git(["push", "origin", branch], check=False)
        result["push_stdout"] = push.stdout.strip()
        result["push_stderr"] = push.stderr.strip()
        if push.returncode != 0:
            result["error"] = "git push failed"
            return result

        rev = run_git(["rev-parse", "HEAD"])
        commit_sha = rev.stdout.strip()
        result["commit_sha"] = commit_sha
        result["commit_raw_url"] = github_raw_url(owner, repo, commit_sha, unique_git_path)
        result["latest_commit_raw_url"] = github_raw_url(owner, repo, commit_sha, latest_git_path)
        result["ok"] = True
        return result
    except Exception as exc:  # pragma: no cover - environment dependent
        result["error"] = str(exc)
        return result


def build_result(
    mode: str,
    capture: dict[str, Any],
    captured_at: str,
    previous_sha: str | None,
    publish: dict[str, Any],
) -> dict[str, Any]:
    current_sha = capture.get("sha256")
    sha_changed = None
    warning = None
    if previous_sha and current_sha:
        sha_changed = previous_sha != current_sha
        if sha_changed is False:
            warning = "Screenshot hash is identical to the previous committed latest capture; this may not be a new frame."

    return {
        "mode": mode,
        "capture": capture,
        "freshness": {
            "captured_at": captured_at,
            "previous_sha256": previous_sha,
            "sha256_changed": sha_changed,
            "is_latest": bool(capture.get("ok")),
            "warning": warning,
        },
        "publish": publish,
        "analysis": {
            "ok": False,
            "image_loaded": False,
            "loaded_from": None,
            "error": "metadata only; open publish.commit_raw_url as an image and set analysis.ok=true only after visual inspection",
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture, validate, and optionally publish an immutable PNG screenshot.")
    parser.add_argument("--latest-output", default=DEFAULT_LATEST_PATH)
    parser.add_argument("--unique-dir", default="screenshots")
    parser.add_argument("--owner", default=DEFAULT_OWNER)
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--branch", default=DEFAULT_BRANCH)
    parser.add_argument("--publish", action="store_true", help="commit and push only the unique screenshot and latest pointer")
    parser.add_argument("--validate-only", action="store_true", help="validate an existing latest PNG instead of capturing a new one")
    parser.add_argument("--min-bytes", type=int, default=1024)
    parser.add_argument("--min-width", type=int, default=320)
    parser.add_argument("--min-height", type=int, default=200)
    parser.add_argument("--min-colors", type=int, default=16)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    now = utc_now()
    captured_at = iso_z(now)
    latest_path = Path(args.latest_output)
    unique_dir = Path(args.unique_dir)
    previous_sha = previous_committed_sha256(latest_path)

    if not args.validate_only:
        latest_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            from PIL import ImageGrab
            image = ImageGrab.grab(all_screens=False)
            image.save(latest_path, format="PNG")
        except Exception as exc:  # pragma: no cover - environment dependent
            publish = {
                "ok": False,
                "pushed_branch": args.branch,
                "commit_sha": None,
                "commit_raw_url": None,
                "latest_main_raw_url": github_raw_url(args.owner, args.repo, args.branch, path_for_git(latest_path)),
                "status": "not_published",
            }
            result = build_result(
                "capture",
                {"ok": False, "latest_path": path_for_git(latest_path), "error": f"capture failed: {exc}"},
                captured_at,
                previous_sha,
                publish,
            )
            print(json.dumps(result, ensure_ascii=False, sort_keys=True))
            return 2

    try:
        validation = validate_png(latest_path, args.min_bytes, args.min_width, args.min_height, args.min_colors)
    except Exception as exc:  # pragma: no cover - environment dependent
        validation = {"ok": False, "error": f"validation failed: {exc}", "sha256": None}

    current_sha = validation.get("sha256")
    short_sha = str(current_sha or "nohash")[:8]
    stamp = now.strftime("%Y%m%d-%H%M%S")
    unique_path = unique_dir / f"capture-{stamp}-{short_sha}.png"

    if validation.get("ok"):
        unique_path.parent.mkdir(parents=True, exist_ok=True)
        # Copy the exact validated PNG to the immutable unique path.
        shutil.copy2(latest_path, unique_path)
        # Revalidate the unique file so the metadata refers to the analysis target.
        unique_validation = validate_png(unique_path, args.min_bytes, args.min_width, args.min_height, args.min_colors)
    else:
        unique_validation = validation.copy()

    latest_git_path = path_for_git(latest_path)
    unique_git_path = path_for_git(unique_path)

    capture: dict[str, Any] = {
        "ok": bool(validation.get("ok") and unique_validation.get("ok")),
        "latest_path": latest_git_path,
        "unique_path": unique_git_path,
        "width": unique_validation.get("width", 0),
        "height": unique_validation.get("height", 0),
        "size_bytes": unique_validation.get("size_bytes", 0),
        "sampled_unique_colors": unique_validation.get("sampled_unique_colors", 0),
        "sha256": unique_validation.get("sha256"),
        "checks": unique_validation.get("checks", {}),
    }
    if not capture["ok"]:
        capture["error"] = unique_validation.get("error") or validation.get("error") or "png validation failed"

    publish: dict[str, Any]
    if args.publish and capture["ok"]:
        publish = publish_files(unique_git_path, latest_git_path, args.owner, args.repo, args.branch, short_sha)
    else:
        publish = {
            "ok": False,
            "pushed_branch": args.branch,
            "commit_sha": None,
            "commit_raw_url": None,
            "latest_main_raw_url": github_raw_url(args.owner, args.repo, args.branch, latest_git_path),
            "unique_main_raw_url": github_raw_url(args.owner, args.repo, args.branch, unique_git_path),
            "status": "not_published_by_this_script" if not args.publish else "not_published_because_capture_failed",
        }

    mode = "capture" if not args.publish else "capture_and_publish"
    result = build_result(mode, capture, captured_at, previous_sha, publish)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if capture.get("ok") else 1


if __name__ == "__main__":
    code = main()
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)
