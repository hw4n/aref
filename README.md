# Aref

Desktop-first infinite reference canvas for visual boards and reference-driven image generation.

## Current Scope

- infinite canvas with typed camera state
- import from file dialog and drag-and-drop
- selection, marquee, move, resize, rotate, duplicate, delete
- lock, hide, group, z-order, fit, frame, center
- single-file `.aref` project save/open/save-as
- autosave, startup restore, recent projects
- mock provider, OpenAI provider, and experimental ChatGPT OAuth bridge
- provider request logs in the inspector
- test coverage for geometry, store behavior, job state machine, persistence, and provider adapters

## Setup

### Prerequisites

- Node.js 22+
- npm 10+
- Rust toolchain
- Linux desktop deps for Tauri when building on Ubuntu/WSL:

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Install

```bash
npm install
```

### Run Checks

```bash
npm run typecheck
npm test
npm run build
```

### Run Renderer Only

```bash
npm run dev
```

### Run Desktop App

```bash
npm run tauri dev
```

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

The experimental provider expects a local `openai-oauth` style proxy and Codex auth on the host machine. The app can start the proxy from the inspector in desktop builds.

## `.aref` Project Format

- `.aref` is a single-file archive.
- The archive contains `project.json` plus embedded `assets/*`.
- Current saves use `schemaVersion: 2`.
- Old schema-1 JSON + sidecar projects still load for migration.

## Packaging

### Linux

```bash
npm run tauri build
```

Typical artifacts land under `src-tauri/target/release/bundle/`.

### Windows

Build on a Windows host for native installers:

```powershell
npm install
npm run tauri build
```

WSL builds Linux artifacts, not native Windows packages.

### macOS

Build on macOS with Xcode command line tools installed:

```bash
npm install
npm run tauri build
```

## Test Notes

- `src/test/e2e-smoke.test.ts` covers the renderer-side MVP flow: import -> arrange -> reopen-style roundtrip -> select refs -> mock generate.
- `src-tauri/src/project_persistence.rs` includes archive roundtrip and schema-1 migration tests for the desktop persistence boundary.
