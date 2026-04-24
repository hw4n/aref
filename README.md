<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" alt="Aref icon" />
  <h1>Aref</h1>
  <p><strong>Desktop-first infinite reference canvas for visual boards and reference-driven image generation.</strong></p>
  <p>
    <a href="https://github.com/hw4n/aref/actions/workflows/release.yml"><img alt="Release workflow" src="https://github.com/hw4n/aref/actions/workflows/release.yml/badge.svg" /></a>
    <a href="https://github.com/hw4n/aref/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/hw4n/aref?include_prereleases&label=release" /></a>
    <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2.x-24C8DB" />
    <img alt="React 18" src="https://img.shields.io/badge/React-18-61DAFB" />
  </p>
</div>

## What It Is

Aref is a desktop workspace for collecting image references, arranging them on an infinite canvas, and sending selected references into image generation providers. It is built with Tauri, React, TypeScript, Zustand, and Konva.

## Highlights

- Infinite canvas with typed camera state, pan/zoom, fit, frame, and center controls.
- Image import from file dialog, drag-and-drop, and clipboard paste.
- Selection, marquee, move, resize, rotate, duplicate, delete, lock, hide, group, and z-order actions.
- Single-file `.aref` project save/open/save-as with autosave, startup restore, and recent projects.
- Context-aware generation sheet that can use live or pinned reference selections.
- Mock provider, OpenAI provider, and experimental ChatGPT OAuth bridge.
- Provider request logs, developer log drawer, and tested persistence boundaries.

## Quick Start

### Prerequisites

- Node.js 22+
- npm 10+
- Rust toolchain
- Linux desktop dependencies for local Tauri builds:

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Install

```bash
npm install
```

### Run The App

```bash
npm run tauri dev
```

For renderer-only development:

```bash
npm run dev
```

## Quality Gates

Run the same checks expected before cutting a release:

```bash
npm run release:check
```

That runs TypeScript type checking, the Vitest suite, and a production Vite build.

## Release

GitHub releases are created by `.github/workflows/release.yml` whenever a semantic version tag is pushed.

1. Update the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Run `npm run release:check`.
3. Commit the release changes.
4. Push a tag:

```bash
git tag v0.1.4
git push origin main
git push origin v0.1.4
```

The workflow builds Linux, Windows, and macOS installers and uploads them to the matching GitHub Release.

### Local Desktop Build

```bash
npm run build:desktop
```

Tauri bundles are written under:

```text
src-tauri/target/release/bundle/
```

WSL/Linux builds Linux artifacts only. Build on Windows or macOS hosts for native Windows or macOS packages.

## Provider Setup

### Mock

No setup required.

### OpenAI

Use the inspector settings panel, or launch with environment variables:

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_ORGANIZATION=org_...   # optional
export OPENAI_PROJECT=proj_...       # optional
export OPENAI_BASE_URL=https://api.openai.com/v1
npm run tauri dev
```

### ChatGPT OAuth Bridge

The experimental provider expects a local `openai-oauth` style proxy and Codex auth on the host machine. Desktop builds can start the proxy from the inspector.

## `.aref` Project Format

- `.aref` is a single-file archive.
- The archive contains `project.json` plus embedded `assets/*`.
- Current saves use `schemaVersion: 2`.
- Old schema-1 JSON plus sidecar projects still load for migration.

## Test Notes

- `src/test/e2e-smoke.test.ts` covers the renderer-side MVP flow: import, arrange, reopen-style roundtrip, select refs, and mock generate.
- `src-tauri/src/project_persistence.rs` includes archive roundtrip and schema-1 migration tests for the desktop persistence boundary.
