---
name: getscreen-via-github-buffer
description: use this skill when the user asks to capture, refresh, inspect, or analyze the local screen without a direct getscreen api, including triggers such as "посмотри экран", "сделай скрин", "getscreen", "что у меня на экране", "обнови скриншот", "какая ссылка в браузере", or "сколько времени снизу справа". also use when the user asks this skill's version, status, protocol, instructions, or why @getscreen-via-github-buffer does not activate. current protocol version is 2.0.0. capture a png screenshot through action bridge or local dev agent, publish an immutable commit-sha raw url for a unique screenshot file, then require actual image loading and analysis.ok=true before reporting visible screen contents. raw_url or latest-screenshot.png alone is metadata, not visual evidence.
---

# getscreen-via-github-buffer

Version: 2.0.0  
Protocol: commit-pinned-capture  
Status: active  
Deprecated protocols: mutable-latest-analysis

## Purpose

Use GitHub only as a transport buffer for a locally captured PNG screenshot when no direct `/getscreen` API is available.

This skill must keep three concepts separate:

1. **Capture**: a local PNG file exists and passes file-level validation.
2. **Publish**: a specific screenshot file was committed and pushed to GitHub.
3. **Analysis**: the exact immutable raw PNG was loaded as an image and visually inspected.

A mutable URL such as `/main/screenshots/latest-screenshot.png` is never proof of visual analysis. It can be stale, cached, or overwritten. For content analysis, use the raw URL pinned to a specific commit SHA and a unique screenshot filename.

## Version contract

Version 2.0.0 is a breaking protocol update.

Rules:
- `latest-screenshot.png` is only a convenience pointer.
- `latest-screenshot.png` must never be used for screen analysis.
- Every analyzed capture must use an immutable file named `screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png`.
- Analysis must use only a commit-pinned raw URL:
  `https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/<COMMIT_SHA>/screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png`
- `analysis.ok=true` is allowed only after opening that exact `publish.commit_raw_url` as an image.
- If `analysis.loaded_from` is not exactly equal to `publish.commit_raw_url`, the assistant must not describe the screen.

## Version/status query

Use this path when the user asks about this skill's version, status, protocol, instruction availability, or why mentioning `@getscreen-via-github-buffer` changes routing. Do not capture a screenshot for these meta-questions unless the user also asks to inspect the screen.

For version/status questions, answer in Russian by default and include exactly this protocol metadata:

```text
Version: 2.0.0
Protocol: commit-pinned-capture
Status: active
Deprecated protocols: mutable-latest-analysis
```

If the user asks whether the installed skill can see or open its instructions, explain that skill routing usually exposes the trigger description first, and the full `SKILL.md` body is loaded only after the skill is selected. The version is duplicated in the trigger-visible description so the assistant can answer version/status questions more reliably.

If the user explicitly mentions `@getscreen-via-github-buffer` and asks a meta-question rather than a screen-content question, treat it as a version/status query.

## Operating modes

### `capture`

Use this mode when the user only asks to refresh, make, or publish a screenshot.

Return capture and publish metadata only. Do not describe visible screen contents in this mode.

### `capture_and_analyze`

Use this mode when the user asks anything about visible content, including:

- what is on the screen;
- what text is visible;
- what time is shown in the bottom-right corner;
- what browser URL or tab is open;
- what windows, buttons, dialogs, apps, or UI state are visible.

This mode is mandatory for content questions. It must open the immutable commit raw PNG as an image and inspect pixels before answering.

### User-facing mode aliases

Use these aliases when interpreting natural-language requests:

- `capture_only`: same as `capture`; make and publish the screenshot, then return metadata and links only.
- `capture_and_describe`: make, publish, open the immutable commit raw PNG, and describe what is visibly on the screen.
- `capture_and_analyze`: make, publish, open the immutable commit raw PNG, then extract requested values or give recommendations based on what is visible.

If the user asks to see, inspect, read, describe, troubleshoot, verify, or explain the screen, default to `capture_and_analyze`, not `capture_only`. After receiving any raw URL, continue to visual analysis unless the user explicitly asked only for a link or metadata.

## Response language

Reply to the user in Russian by default. Keep internal field names, JSON keys, shell commands, paths, and protocol identifiers in English.

## Agent self-check usage

Use this skill proactively when the assistant or Local Dev Agent needs to verify what happened on the local screen after an Action Bridge step, browser action, UI automation, installation, login flow, or other visual operation, especially when the Action Bridge response is too short, truncated, or constrained by a small character limit.

For self-checks, do not stop at `CAPTURE_OK`, `PUBLISH_OK`, or `raw_url`. Use `capture_and_analyze`, open the exact `publish.commit_raw_url`, and inspect the visible result before deciding whether the previous action succeeded, failed, is blocked, or needs the next step.

## Non-negotiable analysis gate

`CAPTURE_OK` and `PUBLISH_OK` are not sufficient to answer questions about screenshot contents.

`raw_url ≠ visual_analysis`.

The assistant MUST NOT report visible text, time, browser URL, UI elements, windows, buttons, or screen state unless `analysis.ok=true`.

Set `analysis.ok=true` only after the exact `publish.commit_raw_url` has been opened/loaded through an image-capable path and the assistant has inspected the image.

If `analysis.ok=false`, say that the screenshot was captured and published, but visual analysis was not completed. Do not infer visible contents.

If the only available outputs are `raw_url`, `main_raw_url`, `commit_raw_url`, `local_path`, `unique_path`, `latest_path`, `width`, `height`, `bytes`, `size_bytes`, `sha256`, `captured_at`, or `commit_sha`, the assistant has metadata only, not visual evidence. Do not infer screenshot contents from these values.

## Immutable artifact rule

For any content question, the analysis target must be the immutable commit-pinned URL for the unique screenshot file:

```text
https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/<COMMIT_SHA>/screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png
```

Do not use this mutable URL as the analysis target:

```text
https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/main/screenshots/latest-screenshot.png
```

`latest-screenshot.png` may be updated for convenience, but it is only a pointer. The final answer must identify the immutable `commit_sha`, `unique_path`, and `commit_raw_url` that were analyzed.

## Mandatory pipeline for content questions

For `capture_and_analyze`, follow this exact sequence:

1. Trigger local capture through Action Bridge / Local Dev Agent.
2. Run a local Python capture using `PIL.ImageGrab.grab(all_screens=False)`.
3. Save the PNG to a unique immutable filename:

```text
screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png
```

4. Also update the convenience pointer:

```text
screenshots/latest-screenshot.png
```

5. Validate the local PNG:
   - file exists;
   - size is greater than `1024` bytes;
   - dimensions are plausible for a real screen;
   - sampled unique colors are high enough to reject blank/gray captures;
   - `sha256` is computed;
   - `captured_at` is recorded in UTC ISO-8601 format.
6. Compare the new `sha256` with the previous committed `latest-screenshot.png` when possible.
   - If `sha256_changed=false`, continue only with a warning that the frame may not be fresh.
7. Inspect `git status --short` enough to avoid unrelated changes.
8. Stage and commit only the two screenshot files:

```bash
git add -- screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png screenshots/latest-screenshot.png
git commit -m "Update screenshot capture <shortsha>" -- screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png screenshots/latest-screenshot.png
git push origin main
```

9. Obtain the exact commit SHA:

```bash
git rev-parse HEAD
```

10. Construct the immutable raw URL using that exact commit SHA and unique filename:

```text
https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/<COMMIT_SHA>/screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png
```

11. Open/load that immutable raw URL through the chat/web/vision/image-capable tool.
    - The URL being opened must include the `commit_sha`, not `main`.
    - The path being opened must be the unique `capture-...png`, not `latest-screenshot.png`.
12. Confirm the PNG was actually loaded/decoded as an image, not merely linked.
13. Extract only the requested visible data from the loaded image.
14. Return the structured result. Only then provide a human-readable answer.

## What counts as visual analysis

Set `analysis.ok=true` only when all of these are true:

- the loaded image source is `publish.commit_raw_url` or an equivalent local decoded copy of the same unique PNG;
- the loaded URL/path includes the immutable `commit_sha` and unique screenshot filename;
- the PNG was loaded through an image-capable path such as a vision pipeline, decoded raw PNG, or equivalent visual inspection tool;
- the assistant inspected the visible pixels and extracted the requested data;
- each extracted value has its own confidence value.

Set `analysis.ok=false` when the PNG was not loaded as an image, when only metadata is available, when the raw URL failed to load, when the loaded URL is the mutable `main/latest-screenshot.png`, or when the assistant cannot visually inspect the screenshot.

## Required metadata consistency checks

For `capture_and_analyze`, include and use these fields:

- `capture.sha256`
- `capture.unique_path`
- `capture.latest_path`
- `freshness.captured_at`
- `freshness.sha256_changed`
- `publish.commit_sha`
- `publish.commit_raw_url`
- `analysis.loaded_from`

Before answering visible-content questions, verify:

1. `publish.ok=true`.
2. `publish.commit_sha` is present.
3. `publish.commit_raw_url` contains the same `publish.commit_sha`.
4. `publish.commit_raw_url` contains the same `capture.unique_path`.
5. `analysis.loaded_from` exactly equals `publish.commit_raw_url`. If a local decoded copy is used for image processing, also keep `analysis.loaded_from` as the original `publish.commit_raw_url` and record the local copy separately in `analysis.local_decoded_copy`.
6. `analysis.image_loaded=true`.
7. `analysis.ok=true`.

If any of these fail, do not answer about screen contents.

## Structured result contract

Always return or internally construct this shape. Omit unknown optional values only when they truly cannot be known.

```json
{
  "mode": "capture_and_analyze",
  "capture": {
    "ok": true,
    "latest_path": "screenshots/latest-screenshot.png",
    "unique_path": "screenshots/capture-20260502-194700-a1b2c3d4.png",
    "width": 2560,
    "height": 1440,
    "size_bytes": 1234567,
    "sampled_unique_colors": 240,
    "sha256": "a1b2c3d4..."
  },
  "freshness": {
    "captured_at": "2026-05-02T19:47:00Z",
    "previous_sha256": "...",
    "sha256_changed": true,
    "is_latest": true,
    "warning": null
  },
  "publish": {
    "ok": true,
    "commit_sha": "0123456789abcdef0123456789abcdef01234567",
    "commit_raw_url": "https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/0123456789abcdef0123456789abcdef01234567/screenshots/capture-20260502-194700-a1b2c3d4.png",
    "latest_main_raw_url": "https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/main/screenshots/latest-screenshot.png",
    "pushed_branch": "main"
  },
  "analysis": {
    "ok": true,
    "source": "commit_raw_png|local_png|vision",
    "loaded_from": "https://raw.githubusercontent.com/FokusNIK9/mcp-gpt-auto/0123456789abcdef0123456789abcdef01234567/screenshots/capture-20260502-194700-a1b2c3d4.png",
    "image_loaded": true,
    "extracted": [
      {
        "field": "visible_time_bottom_right",
        "value": "21:47",
        "confidence": "high",
        "evidence": "bottom-right taskbar clock",
        "notes": []
      },
      {
        "field": "browser_url",
        "value": "https://chatgpt.com/...",
        "confidence": "medium",
        "evidence": "browser address bar",
        "notes": ["part of the url is visually truncated"]
      }
    ],
    "notes": []
  }
}
```

For capture-only mode, use the same top-level shape but set:

```json
{
  "mode": "capture",
  "analysis": {
    "ok": false,
    "error": "capture mode only; png was not loaded for visual analysis"
  }
}
```

For failed analysis after successful capture/publish, use:

```json
{
  "analysis": {
    "ok": false,
    "error": "png was captured and published to an immutable commit raw url, but was not loaded for visual analysis"
  }
}
```

## Freshness rules

The result must include `freshness.captured_at` and `capture.sha256`.

If `freshness.sha256_changed=false`, include a warning in both the structured result and the human answer:

```text
Скрин получен, но hash совпадает с предыдущим. Возможно, это не новый кадр.
```

Do not silently treat an unchanged hash as fresh visual evidence. The image may still be analyzable, but the answer must disclose the freshness risk.

## Recommended local capture/publish script

Use `scripts/capture_and_validate_screenshot.py` as the Action Bridge payload or as the basis for the local command. The script captures or validates a PNG, writes both the unique capture file and `latest-screenshot.png`, and can optionally publish only those screenshot files.

Capture only:

```bash
python scripts/capture_and_validate_screenshot.py
```

Capture and publish:

```bash
python scripts/capture_and_validate_screenshot.py --publish
```

The script prints compact JSON metadata only. It never prints image bytes or base64. Even when `--publish` succeeds, the script still sets `analysis.ok=false`; visual analysis must happen after the immutable `publish.commit_raw_url` is opened as an image.

If the repository does not contain the bundled script, create an equivalent temporary local Python script with the same behavior.

## Git hygiene rules

Before committing, inspect status enough to avoid unrelated changes:

```bash
git status --short
```

Only stage and commit these files:

```text
screenshots/capture-YYYYMMDD-HHMMSS-<shortsha>.png
screenshots/latest-screenshot.png
```

Never use broad commands such as `git add .` or `git commit -am`. If unrelated files are already modified, leave them untouched and mention that they were ignored.

If there is nothing to commit, do not pretend that a new immutable frame was published. Report `publish.ok=false`, include the error, and do not answer content questions unless a previously published immutable URL has explicitly been opened and identified.

## Human answer rules

When `analysis.ok=true`, answer the user's visible-content question directly, then include compact confidence/freshness/provenance notes: `commit_sha`, `unique_path`, `sha256`, and `loaded_from`.

When `analysis.ok=false`, do not answer the visible-content question. Say:

```text
Скриншот был создан и опубликован, но commit-pinned PNG не был загружен для визуального анализа, поэтому я не могу честно сказать, что видно на экране.
```

If a value is partially visible or uncertain, return it with `confidence=low` or `confidence=medium` and explain why. Never upgrade confidence to high unless the value is clearly visible in the loaded immutable image.

## Prohibitions

Do not:

- create an HTML site or HTML preview;
- use sandbox as the main transport channel;
- print or pass PNG data via base64/stdout;
- open the local PNG with `start`, `open`, or local file viewers;
- commit, stage, reset, stash, or modify unrelated files;
- use `git add .` or `git commit -am`;
- use `/main/screenshots/latest-screenshot.png` as proof of the analyzed frame;
- answer from metadata only;
- treat any raw URL as proof of visual analysis until that exact immutable PNG is loaded as an image.

## Version history

### 2.0.0
- Introduced immutable capture files.
- Introduced commit-pinned raw URLs.
- Prohibited analysis from `/main/screenshots/latest-screenshot.png`.
- Split publish and analysis states.

### 1.0.0
- Used mutable `latest-screenshot.png`.
- Deprecated because it can be cached or overwritten.
