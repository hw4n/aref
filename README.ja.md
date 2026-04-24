<div align="center">
  <img src="src-tauri/icons/icon.png" width="96" alt="Aref icon" />
  <h1>Aref</h1>
  <p><strong>無料のデスクトップ向けリファレンスボード。必要なときだけAI生成を接続できます。</strong></p>
  <p>
    <a href="./README.md">English</a> ·
    <a href="./README.ko.md">한국어</a>
  </p>
</div>

## 概要

Arefは、画像リファレンスを集め、配置し、比較するためのローカルファーストな無限キャンバスアプリです。

AIを使わない場合は、無料のリファレンスアプリとしてそのまま使えます。画像を読み込み、ボードに並べ、`.aref`ファイルとして保存し、オフラインでも作業できます。Codexや画像providerを接続すると、自分の生成ワークフローに合わせて拡張、修正、自動化しやすくなります。

## プレビュー

<video src="docs/media/aref-generation-demo.mp4" controls muted playsinline width="100%"></video>

プロンプトとリファレンスから画像を生成し、結果をそのままキャンバス上で移動、整理できます。

<img src="docs/media/aref-board-example.jpg" alt="多数の画像を配置したArefボード" />

アイデア、スタディ、生成結果、元資料を1つのボードに密度高く並べて使えます。

## 機能

- pan、zoom、fit、frame、centerに対応した無限キャンバス。
- ファイル選択、ドラッグ&ドロップ、クリップボード貼り付けで画像を読み込み。
- 移動、リサイズ、回転、複製、グループ化、非表示、ロック、重なり順の変更。
- assetsを含む単一の`.aref`プロジェクトとして保存/再オープン。
- 必要に応じてMock、OpenAI API、ChatGPT OAuth bridgeの生成providerを使用。
- job履歴からrerun、prompt reuse、削除、ログ確認、生成結果の配置。

## 実行

必要なもの: Node.js 22+、npm 10+、Rust toolchain。

```bash
npm install
npm run dev
```

レンダラーのみ:

```bash
npm run dev:web
```

## AI Provider

AI設定は任意です。設定しなくても通常のリファレンスボードとして動作します。

- Mock: 設定不要。
- OpenAI API: Settingsで設定、または`OPENAI_API_KEY`を使用。
- ChatGPT OAuth bridge: アプリのOAuthログインボタンを使用。Arefはグローバルな`~/.codex`に依存せず、アプリ専用のCodex OAuth homeを使います。

手動OAuth fallback:

```powershell
npx --yes @openai/codex@latest login
npx --yes openai-oauth@1.0.2 --port 10531 --codex-version 0.124.0
```

## プロジェクト形式

`.aref`は`project.json`と`assets/*`を含む単一ファイルarchiveです。現在の保存形式は`schemaVersion: 2`です。

## 開発

```bash
npm run typecheck
npm run test
npm run build:desktop
```

リリースタグは`.github/workflows/release.yml`でビルドされます。
