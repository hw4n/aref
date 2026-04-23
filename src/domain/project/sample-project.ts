import { createInitialCamera } from "@/domain/camera/camera-math";

import type { AssetItem } from "../assets/types";
import type { Project } from "./types";

function createBaseProject(name: string, assets: AssetItem[] = []): Project {
  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    name,
    version: "0.1.0",
    createdAt: timestamp,
    updatedAt: timestamp,
    camera: createInitialCamera(),
    assets: Object.fromEntries(assets.map((asset) => [asset.id, asset])),
    groups: {},
    selection: {
      assetIds: [],
      marquee: null,
      lastActiveAssetId: null,
    },
    jobs: {},
  };
}

function createReferenceSvg(
  title: string,
  palette: { primary: string; secondary: string; tertiary: string },
) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.primary}" />
          <stop offset="100%" stop-color="${palette.secondary}" />
        </linearGradient>
      </defs>
      <rect width="960" height="720" fill="url(#bg)" />
      <circle cx="180" cy="168" r="120" fill="${palette.tertiary}" fill-opacity="0.38" />
      <circle cx="760" cy="540" r="180" fill="#ffffff" fill-opacity="0.08" />
      <path d="M110 562C198 430 358 352 488 364C618 376 726 458 850 598L850 720L110 720Z" fill="#071114" fill-opacity="0.34" />
      <text x="72" y="104" font-family="Ubuntu, Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="34" fill="#fff3df" opacity="0.85">Aref Sample Reference</text>
      <text x="72" y="166" font-family="Ubuntu, Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="80" font-weight="700" fill="#fff9ef">${title}</text>
      <text x="72" y="624" font-family="Ubuntu, Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="26" fill="#fff3df" opacity="0.78">Phase 1 canvas rendering with managed domain state</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createSampleAsset(
  partial: Pick<AssetItem, "id" | "x" | "y" | "rotation" | "scale" | "zIndex"> & {
    title: string;
    palette: { primary: string; secondary: string; tertiary: string };
  },
  createdAt: string,
): AssetItem {
  return {
    id: partial.id,
    kind: "imported",
    imagePath: createReferenceSvg(partial.title, partial.palette),
    thumbnailPath: null,
    width: 960,
    height: 720,
    x: partial.x,
    y: partial.y,
    rotation: partial.rotation,
    scale: partial.scale,
    zIndex: partial.zIndex,
    locked: false,
    hidden: false,
    tags: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function createSampleProject(): Project {
  const timestamp = new Date().toISOString();
  const assets = [
    createSampleAsset(
      {
        id: "asset-forest",
        title: "Atmosphere Board",
        palette: {
          primary: "#244f4c",
          secondary: "#0f2427",
          tertiary: "#7dd6c8",
        },
        x: -420,
        y: -120,
        rotation: -4,
        scale: 0.34,
        zIndex: 0,
      },
      timestamp,
    ),
    createSampleAsset(
      {
        id: "asset-portrait",
        title: "Character Ref",
        palette: {
          primary: "#7d463a",
          secondary: "#241416",
          tertiary: "#f3a55a",
        },
        x: 110,
        y: -30,
        rotation: 3,
        scale: 0.32,
        zIndex: 1,
      },
      timestamp,
    ),
    createSampleAsset(
      {
        id: "asset-architecture",
        title: "Material Study",
        palette: {
          primary: "#243755",
          secondary: "#151822",
          tertiary: "#b7c9ff",
        },
        x: 520,
        y: 220,
        rotation: -6,
        scale: 0.31,
        zIndex: 2,
      },
      timestamp,
    ),
  ];

  return {
    ...createBaseProject("Phase 1 Board", assets),
    id: "project-sample",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createEmptyProject(name = "Untitled Board"): Project {
  return createBaseProject(name);
}
