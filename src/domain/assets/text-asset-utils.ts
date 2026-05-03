import { screenToWorld } from "@/domain/camera/camera-math";
import type { CameraState } from "@/domain/camera/types";
import type { Point } from "@/domain/shared/types";

import type { AssetItem, TextAssetContent } from "./types";

const DEFAULT_TEXT_FONT_SIZE = 40;
const DEFAULT_TEXT_LINE_HEIGHT = 1.2;
const DEFAULT_TEXT_VALUE = "Text";
const TEXT_LAYER_NAME = "Text Layer";
const MIN_TEXT_WIDTH = 16;
const MIN_TEXT_HEIGHT = 12;

export const DEFAULT_TEXT_ASSET_CONTENT: TextAssetContent = {
  value: DEFAULT_TEXT_VALUE,
  fontFamily: "Segoe UI",
  fontSize: DEFAULT_TEXT_FONT_SIZE,
  fontStyle: "normal",
  fill: "#eef1f5",
  align: "left",
  lineHeight: DEFAULT_TEXT_LINE_HEIGHT,
};

function getViewportCenter(camera: CameraState): Point {
  return screenToWorld(camera, {
    x: camera.viewportWidth / 2,
    y: camera.viewportHeight / 2,
  });
}

function getNextZIndex(existingAssets: Record<string, AssetItem>) {
  return Object.values(existingAssets).reduce(
    (highest, asset) => Math.max(highest, asset.zIndex),
    -1,
  ) + 1;
}

function getCharacterWidthFactor(character: string) {
  if (character === " " || character === "\t") {
    return 0.32;
  }

  if (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3040-\u30ff\u3400-\u9fff]/.test(character)) {
    return 1;
  }

  if (/[A-Z0-9]/.test(character)) {
    return 0.62;
  }

  if (/[il.,'`|]/.test(character)) {
    return 0.28;
  }

  if (/[mwMW@#%&]/.test(character)) {
    return 0.82;
  }

  return 0.54;
}

function estimateLineWidth(line: string, fontSize: number) {
  const visibleLine = line.replace(/[ \t]+$/g, "");

  return Array.from(visibleLine).reduce(
    (width, character) => width + getCharacterWidthFactor(character) * fontSize,
    0,
  );
}

export function estimateTextAssetSize(text: Pick<TextAssetContent, "value" | "fontSize" | "lineHeight">) {
  const lines = text.value.length > 0 ? text.value.split("\n") : [""];
  const width = Math.max(
    MIN_TEXT_WIDTH,
    ...lines.map((line) => estimateLineWidth(line, text.fontSize)),
  );
  const height = Math.max(
    MIN_TEXT_HEIGHT,
    lines.length * text.fontSize * text.lineHeight,
  );

  return {
    width: Math.ceil(width),
    height: Math.ceil(height),
  };
}

export function createTextAsset(
  existingAssets: Record<string, AssetItem>,
  camera: CameraState,
): AssetItem {
  const timestamp = new Date().toISOString();
  const text = { ...DEFAULT_TEXT_ASSET_CONTENT };
  const size = estimateTextAssetSize(text);
  const center = getViewportCenter(camera);

  return {
    id: crypto.randomUUID(),
    kind: "text",
    imagePath: "",
    sourceName: TEXT_LAYER_NAME,
    thumbnailPath: null,
    width: size.width,
    height: size.height,
    x: center.x,
    y: center.y,
    rotation: 0,
    scale: 1,
    zIndex: getNextZIndex(existingAssets),
    locked: false,
    hidden: false,
    tags: ["text"],
    createdAt: timestamp,
    updatedAt: timestamp,
    text,
  };
}

export function updateTextAsset(
  asset: AssetItem,
  update: Partial<TextAssetContent>,
): AssetItem {
  const currentText = asset.text ?? DEFAULT_TEXT_ASSET_CONTENT;
  const nextText = {
    ...currentText,
    ...update,
    fontSize: Math.max(6, Math.min(240, update.fontSize ?? currentText.fontSize)),
    lineHeight: Math.max(0.8, Math.min(3, update.lineHeight ?? currentText.lineHeight)),
  };
  const size = estimateTextAssetSize(nextText);

  return {
    ...asset,
    kind: "text",
    imagePath: "",
    thumbnailPath: null,
    width: size.width,
    height: size.height,
    sourceName: asset.sourceName ?? TEXT_LAYER_NAME,
    tags: asset.tags.includes("text") ? asset.tags : [...asset.tags, "text"],
    updatedAt: new Date().toISOString(),
    text: nextText,
  };
}
