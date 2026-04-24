<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" alt="Aref icon" />
  <h1>Aref</h1>
  <p><strong>Free desktop reference board. Optional AI generation when you want it.</strong></p>
  <p>
    <a href="./README.ko.md">한국어</a> ·
    <a href="./README.ja.md">日本語</a>
  </p>
  <p>
    <a href="https://github.com/hw4n/aref/actions/workflows/release.yml"><img alt="Release workflow" src="https://github.com/hw4n/aref/actions/workflows/release.yml/badge.svg" /></a>
    <a href="https://github.com/hw4n/aref/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/hw4n/aref?include_prereleases&label=release" /></a>
    <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2.x-24C8DB" />
    <img alt="React 18" src="https://img.shields.io/badge/React-18-61DAFB" />
  </p>
</div>

## What It Is

Aref is a local-first infinite canvas for collecting, arranging, and comparing image references.

Without AI, it is simply a free desktop referencing app: import images, lay them out, save a `.aref` board, and keep working offline. With Codex or image providers connected, it becomes easy to extend, patch, and automate for your own generation workflow.

## Preview

<video src="docs/media/aref-generation-demo.mp4" controls muted playsinline width="100%"></video>

Generate images from prompts and references, then move the results directly on the canvas.

<img src="docs/media/aref-board-example.jpg" alt="Aref board with many laid-out image references" />

Use Aref as a dense visual board for ideas, studies, outputs, and source material.

## Features

- Infinite canvas with pan, zoom, fit, frame, and center controls.
- Import images by file picker, drag-and-drop, or clipboard paste.
- Move, resize, rotate, duplicate, group, hide, lock, and reorder items.
- Save and reopen single-file `.aref` projects with embedded assets.
- Optional generation through Mock, OpenAI API, or ChatGPT OAuth bridge.
- Job history with rerun, prompt reuse, removal, logs, and generated results on canvas.

## Run

Prerequisites: Node.js 22+, npm 10+, and the Rust toolchain.

```bash
npm install
npm run dev
```

Renderer-only development:

```bash
npm run dev:web
```

## AI Providers

AI is optional. The app works as a normal reference board without any provider setup.

- Mock: no setup.
- OpenAI API: configure from Settings, or use `OPENAI_API_KEY`.
- ChatGPT OAuth bridge: use the app's OAuth login button. Aref keeps its own Codex OAuth home under the app config directory instead of depending on your global `~/.codex`.

Manual OAuth fallback:

```powershell
npx --yes @openai/codex@latest login
npx --yes openai-oauth@1.0.2 --port 10531 --codex-version 0.124.0
```

## Project Format

`.aref` is a single-file archive containing `project.json` and embedded `assets/*`. Current saves use `schemaVersion: 2`.

## Development

```bash
npm run typecheck
npm run test
npm run build:desktop
```

Release tags are built by `.github/workflows/release.yml`:

```bash
git tag v0.3.1
git push origin main
git push origin v0.3.1
```
