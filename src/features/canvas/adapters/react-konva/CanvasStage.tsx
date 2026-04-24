import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";

import {
  AssetsIcon,
  CancelIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MarqueeIcon,
  PanIcon,
  RetryIcon,
  SelectionIcon,
  SizeIcon,
  SparklesIcon,
  ZoomIcon,
} from "@/components/icons/ui-icons";
import { getAssetBounds } from "@/domain/assets/asset-geometry";
import type { AssetItem } from "@/domain/assets/types";
import { screenToWorld } from "@/domain/camera/camera-math";
import {
  computeGenerationCanvasLayout,
  getGenerationDisplaySizeForAspectRatio,
} from "@/domain/jobs/generation-layout";
import type { GenerationJob } from "@/domain/jobs/types";
import { normalizeRect, rectsIntersect } from "@/domain/shared/geometry";
import type { Point } from "@/domain/shared/types";
import { useCanvasShortcuts } from "@/features/canvas/hooks/use-canvas-shortcuts";
import { useStageContainerSize } from "@/features/canvas/hooks/use-stage-container-size";
import {
  copyAssetsToClipboard,
  type ClipboardCopyResult,
} from "@/features/canvas/utils/selection-clipboard";
import {
  ROTATION_SNAP_TOLERANCE_DEGREES,
  getRotationSnapAngles,
} from "@/features/canvas/utils/rotation-snaps";
import { isLikelyFilePath } from "@/features/project/persistence/project-io";
import { useAppStore } from "@/state/app-store";
import {
  selectActiveGenerationJobs,
  selectSelectedAssetIds,
  selectSortedVisibleAssets,
} from "@/state/selectors/canvas-selectors";

import { useHtmlImage } from "./use-html-image";

interface AssetLayerItemProps {
  asset: AssetItem;
  isSelected: boolean;
  isPanMode: boolean;
  onSelect: (assetId: string, additive: boolean) => void;
  onContextMenu: (assetId: string, clientPosition: Point, isSelected: boolean, additive: boolean) => void;
  onInteractionActiveChange: (active: boolean) => void;
  onBeginDrag: (assetId: string, position: Point) => void;
  onDrag: (assetId: string, position: Point) => void;
  onEndDrag: (assetId: string, position: Point) => void;
  setNodeRef: (assetId: string, node: Konva.Group | null) => void;
}

interface DragSession {
  assetId: string;
  selectedIds: string[];
  originPosition: Point;
  startPositions: Record<string, Point>;
}

function isAdditiveSelectionModifier(event: Pick<MouseEvent, "ctrlKey" | "metaKey" | "shiftKey">) {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}

function getClipboardSuccessDescription(result: ClipboardCopyResult) {
  if (result.mode === "files") {
    return result.copiedCount === 1
      ? "Image file is on the clipboard."
      : `${result.copiedCount} image files are on the clipboard.`;
  }

  if (result.mode === "single-image") {
    return "Image PNG is on the clipboard.";
  }

  return `${result.copiedCount} items rendered as one PNG.`;
}

function getAssetInitial(asset: AssetItem) {
  return (asset.sourceName ?? asset.kind).trim().charAt(0).toUpperCase() || "?";
}

function getAssetThumbnailSource(asset: AssetItem) {
  return asset.thumbnailPath ?? (isLikelyFilePath(asset.imagePath) ? null : asset.imagePath);
}

function getCoverCrop(image: HTMLImageElement, width: number, height: number) {
  const imageWidth = image.naturalWidth || image.width || width;
  const imageHeight = image.naturalHeight || image.height || height;
  const targetRatio = width / height;
  const imageRatio = imageWidth / imageHeight;

  if (imageRatio > targetRatio) {
    const cropWidth = imageHeight * targetRatio;
    return {
      x: (imageWidth - cropWidth) / 2,
      y: 0,
      width: cropWidth,
      height: imageHeight,
    };
  }

  const cropHeight = imageWidth / targetRatio;
  return {
    x: 0,
    y: (imageHeight - cropHeight) / 2,
    width: imageWidth,
    height: cropHeight,
  };
}

function GenerationPlaceholderThumbFrame({
  label,
  size,
  x,
  y,
}: {
  label?: string;
  size: number;
  x: number;
  y: number;
}) {
  return (
    <>
      <Rect
        x={x}
        y={y}
        width={size}
        height={size}
        cornerRadius={4}
        fill="rgba(255,255,255,0.08)"
        stroke="rgba(255,255,255,0.12)"
      />
      {label ? (
        <Text
          x={x}
          y={y + size / 2 - 7}
          width={size}
          align="center"
          text={label}
          fontSize={12}
          fontStyle="bold"
          fill="rgba(238, 241, 245, 0.72)"
        />
      ) : null}
    </>
  );
}

function GenerationPlaceholderThumbImage({
  src,
  size,
  x,
  y,
}: {
  src: string;
  size: number;
  x: number;
  y: number;
}) {
  const image = useHtmlImage(src);

  if (!image) {
    return <GenerationPlaceholderThumbFrame size={size} x={x} y={y} />;
  }

  const crop = getCoverCrop(image, size, size);

  return (
    <KonvaImage
      image={image}
      crop={crop}
      x={x}
      y={y}
      width={size}
      height={size}
      cornerRadius={4}
    />
  );
}

function GenerationPlaceholderThumb({
  asset,
  size,
  x,
  y,
}: {
  asset: AssetItem;
  size: number;
  x: number;
  y: number;
}) {
  const source = getAssetThumbnailSource(asset);

  if (!source) {
    return <GenerationPlaceholderThumbFrame label={getAssetInitial(asset)} size={size} x={x} y={y} />;
  }

  return <GenerationPlaceholderThumbImage src={source} size={size} x={x} y={y} />;
}

function GenerationJobPlaceholderItem({
  job,
  referenceAssets,
  animationTick,
  isPanMode,
  onDrag,
  onInteractionActiveChange,
}: {
  job: GenerationJob;
  referenceAssets: AssetItem[];
  animationTick: number;
  isPanMode: boolean;
  onDrag: (jobId: string, position: Point) => void;
  onInteractionActiveChange: (active: boolean) => void;
}) {
  const statusLabel = job.status === "queued" ? "Queued" : "Generating";
  const statusStroke = job.status === "queued" ? "rgba(255, 199, 92, 0.7)" : "rgba(127, 150, 255, 0.82)";
  const displaySize = getGenerationDisplaySizeForAspectRatio(job.request.settings.aspectRatio);
  const frames = Array.from({ length: job.request.settings.imageCount }, () => ({
    width: displaySize.width,
    height: displaySize.height,
  }));
  const positions = computeGenerationCanvasLayout(frames, { x: 0, y: 0 });
  const thumbnailSize = Math.max(32, Math.min(56, Math.round(displaySize.width * 0.16)));
  const visibleReferences = referenceAssets.slice(0, 3);
  const overflowReferenceCount = Math.max(0, referenceAssets.length - visibleReferences.length);
  const promptSummary = job.request.prompt.trim() || "Generating image";

  return (
    <Group
      x={job.canvasPlacement.x}
      y={job.canvasPlacement.y}
      draggable={!isPanMode}
      onDragStart={(event) => {
        event.cancelBubble = true;
        onInteractionActiveChange(true);
      }}
      onMouseDown={(event) => {
        event.cancelBubble = true;
      }}
      onTouchStart={(event) => {
        event.cancelBubble = true;
      }}
      onClick={(event) => {
        event.cancelBubble = true;
      }}
      onTap={(event) => {
        event.cancelBubble = true;
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        onDrag(job.id, {
          x: event.target.x(),
          y: event.target.y(),
        });
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onDrag(job.id, {
          x: event.target.x(),
          y: event.target.y(),
        });
        onInteractionActiveChange(false);
      }}
    >
      {positions.map((position, index) => {
        const dotGridColumns = 3;
        const dotGap = 12;
        const dotRadius = 3.4;
        const activeDot = (animationTick + index) % 9;
        const dotsStartX = -((dotGap * (dotGridColumns - 1)) / 2);
        const dotsStartY = -6;

        return (
          <Group key={`${job.id}-${index}`} x={position.x} y={position.y}>
            <Rect
              x={-displaySize.width / 2 - 10}
              y={-displaySize.height / 2 - 10}
              width={displaySize.width + 20}
              height={displaySize.height + 20}
              cornerRadius={6}
              fill="rgba(8, 11, 16, 0.42)"
              stroke={statusStroke}
              strokeWidth={1.5}
              dash={job.status === "queued" ? [12, 10] : [8, 6]}
              shadowBlur={16}
              shadowColor="rgba(0, 0, 0, 0.3)"
            />
            <Rect
              x={-displaySize.width / 2}
              y={-displaySize.height / 2}
              width={displaySize.width}
              height={displaySize.height}
              cornerRadius={4}
              fill="rgba(16, 20, 26, 0.92)"
            />

            <Text
              x={-displaySize.width / 2 + 18}
              y={-displaySize.height / 2 + 16}
              width={displaySize.width - 36}
              text={`${statusLabel} • ${index + 1}/${job.request.settings.imageCount}`}
              fontSize={15}
              fontStyle="bold"
              fill="#eef1f5"
            />
            <Text
              x={-displaySize.width / 2 + 18}
              y={-displaySize.height / 2 + 38}
              width={displaySize.width - 36}
              text={`${referenceAssets.length} refs • ${job.request.model}`}
              fontSize={12}
              fill="rgba(238, 241, 245, 0.7)"
            />

            <Group y={-displaySize.height / 2 + 64}>
              {visibleReferences.map((asset, referenceIndex) => (
                <GenerationPlaceholderThumb
                  key={asset.id}
                  asset={asset}
                  size={thumbnailSize}
                  x={-displaySize.width / 2 + 18 + referenceIndex * (thumbnailSize + 8)}
                  y={0}
                />
              ))}
              {overflowReferenceCount > 0 ? (
                <Rect
                  x={-displaySize.width / 2 + 18 + visibleReferences.length * (thumbnailSize + 8)}
                  y={0}
                  width={thumbnailSize}
                  height={thumbnailSize}
                  cornerRadius={4}
                  fill="rgba(255,255,255,0.08)"
                  stroke="rgba(255,255,255,0.12)"
                />
              ) : null}
              {overflowReferenceCount > 0 ? (
                <Text
                  x={-displaySize.width / 2 + 18 + visibleReferences.length * (thumbnailSize + 8)}
                  y={thumbnailSize / 2 - 8}
                  width={thumbnailSize}
                  align="center"
                  text={`+${overflowReferenceCount}`}
                  fontSize={12}
                  fill="#eef1f5"
                />
              ) : null}
            </Group>

            <Text
              x={-displaySize.width / 2 + 18}
              y={-12}
              width={displaySize.width - 36}
              height={54}
              text={promptSummary}
              fontSize={16}
              lineHeight={1.25}
              wrap="word"
              ellipsis
              fill="rgba(238, 241, 245, 0.92)"
            />

            <Group y={displaySize.height / 2 - 62}>
              {Array.from({ length: 9 }, (_unused, dotIndex) => {
                const column = dotIndex % dotGridColumns;
                const row = Math.floor(dotIndex / dotGridColumns);
                const isActive = dotIndex === activeDot;
                const isTrailing = dotIndex === (activeDot + 8) % 9 || dotIndex === (activeDot + 1) % 9;

                return (
                  <Circle
                    key={dotIndex}
                    x={dotsStartX + column * dotGap}
                    y={dotsStartY + row * dotGap}
                    radius={dotRadius}
                    fill={
                      isActive
                        ? "#7f96ff"
                        : isTrailing
                          ? "rgba(127, 150, 255, 0.56)"
                          : "rgba(255,255,255,0.18)"
                    }
                  />
                );
              })}
            </Group>
          </Group>
        );
      })}
    </Group>
  );
}

function AssetLayerItem({
  asset,
  isSelected,
  isPanMode,
  onSelect,
  onContextMenu,
  onInteractionActiveChange,
  onBeginDrag,
  onDrag,
  onEndDrag,
  setNodeRef,
}: AssetLayerItemProps) {
  const image = useHtmlImage(asset.imagePath);
  const width = asset.width * asset.scale;
  const height = asset.height * asset.scale;
  const suppressClickAfterDragRef = useRef(false);

  return (
    <Group
      ref={(node) => setNodeRef(asset.id, node)}
      x={asset.x}
      y={asset.y}
      rotation={asset.rotation}
      draggable={!asset.locked && !isPanMode}
      onMouseDown={(event) => {
        if ((event.evt as MouseEvent).button === 0 && !asset.locked && !isPanMode) {
          onInteractionActiveChange(true);
        }
      }}
      onMouseUp={() => {
        onInteractionActiveChange(false);
      }}
      onTouchStart={() => {
        if (!asset.locked && !isPanMode) {
          onInteractionActiveChange(true);
        }
      }}
      onTouchEnd={() => {
        onInteractionActiveChange(false);
      }}
      onClick={(event) => {
        const mouseEvent = event.evt as MouseEvent;
        if (mouseEvent.button !== 0) {
          return;
        }

        event.cancelBubble = true;
        if (suppressClickAfterDragRef.current) {
          return;
        }

        onSelect(asset.id, isAdditiveSelectionModifier(mouseEvent));
      }}
      onTap={(event) => {
        event.cancelBubble = true;
        if (suppressClickAfterDragRef.current) {
          return;
        }

        onSelect(asset.id, false);
      }}
      onContextMenu={(event) => {
        event.evt.preventDefault();
        event.cancelBubble = true;
        onContextMenu(
          asset.id,
          {
            x: event.evt.clientX,
            y: event.evt.clientY,
          },
          isSelected,
          isAdditiveSelectionModifier(event.evt),
        );
      }}
      onDragStart={(event) => {
        event.cancelBubble = true;
        suppressClickAfterDragRef.current = false;
        onBeginDrag(
          asset.id,
          {
            x: event.target.x(),
            y: event.target.y(),
          },
        );
      }}
      onDragMove={(event) => {
        event.cancelBubble = true;
        suppressClickAfterDragRef.current = true;
        onDrag(asset.id, {
          x: event.target.x(),
          y: event.target.y(),
        });
      }}
      onDragEnd={(event) => {
        event.cancelBubble = true;
        onEndDrag(asset.id, {
          x: event.target.x(),
          y: event.target.y(),
        });
        window.setTimeout(() => {
          suppressClickAfterDragRef.current = false;
        }, 0);
      }}
    >
      <Rect
        x={-width / 2 - 8}
        y={-height / 2 - 8}
        width={width + 16}
        height={height + 16}
        cornerRadius={2}
        fill="rgba(255, 255, 255, 0.01)"
        stroke={isSelected ? "#7f96ff" : "rgba(255,255,255,0.06)"}
        strokeWidth={isSelected ? 2 : 1}
        shadowBlur={isSelected ? 12 : 4}
        shadowColor={isSelected ? "rgba(127, 150, 255, 0.35)" : "rgba(0,0,0,0.2)"}
      />
      {image ? (
        <KonvaImage
          image={image}
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          cornerRadius={0}
          shadowBlur={8}
          shadowColor="rgba(0, 0, 0, 0.2)"
        />
      ) : (
        <Rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          cornerRadius={0}
          fill="rgba(255, 255, 255, 0.1)"
        />
      )}
    </Group>
  );
}

export function CanvasStage() {
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isRotationSnapModifierPressed, setIsRotationSnapModifierPressed] = useState(false);
  const [generationAnimationTick, setGenerationAnimationTick] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [marqueeSession, setMarqueeSession] = useState<{
    additive: boolean;
    originWorld: Point;
    originScreen: Point;
  } | null>(null);

  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const assetNodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragPreviewPositionsRef = useRef<Record<string, Point> | null>(null);
  const selectedAssetIdsRef = useRef<string[]>([]);
  const assetMapRef = useRef<Record<string, AssetItem>>({});
  const panSessionRef = useRef<{
    originPointer: Point;
    originCamera: Point;
  } | null>(null);
  const size = useStageContainerSize(panelElement);

  const camera = useAppStore((state) => state.project.camera);
  const assets = useAppStore(selectSortedVisibleAssets);
  const assetRegistry = useAppStore((state) => state.project.assets);
  const activeGenerationJobs = useAppStore(selectActiveGenerationJobs);
  const assetCount = useAppStore((state) => Object.keys(state.project.assets).length);
  const selectedAssetIds = useAppStore(selectSelectedAssetIds);
  const selectionCount = useAppStore((state) => state.project.selection.assetIds.length);
  const hiddenAssetCount = useAppStore((state) =>
    Object.values(state.project.assets).filter((asset) => asset.hidden).length,
  );
  const hiddenSelectedCount = useAppStore((state) =>
    state.project.selection.assetIds.filter((assetId) => state.project.assets[assetId]?.hidden).length,
  );
  const undoVisibilityCount = useAppStore((state) => state.visibilityHistory.undoStack.length);
  const redoVisibilityCount = useAppStore((state) => state.visibilityHistory.redoStack.length);
  const marquee = useAppStore((state) => state.project.selection.marquee);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const centerSelection = useAppStore((state) => state.centerSelection);
  const commitAssetTransforms = useAppStore((state) => state.commitAssetTransforms);
  const deleteSelection = useAppStore((state) => state.deleteSelection);
  const duplicateSelection = useAppStore((state) => state.duplicateSelection);
  const bringSelectionForward = useAppStore((state) => state.bringSelectionForward);
  const sendSelectionBackward = useAppStore((state) => state.sendSelectionBackward);
  const bringSelectionToFront = useAppStore((state) => state.bringSelectionToFront);
  const sendSelectionToBack = useAppStore((state) => state.sendSelectionToBack);
  const frameAll = useAppStore((state) => state.frameAll);
  const frameSelection = useAppStore((state) => state.frameSelection);
  const groupSelection = useAppStore((state) => state.groupSelection);
  const ungroupSelection = useAppStore((state) => state.ungroupSelection);
  const resetZoom = useAppStore((state) => state.resetZoom);
  const selectAll = useAppStore((state) => state.selectAll);
  const selectAsset = useAppStore((state) => state.selectAsset);
  const selectAssets = useAppStore((state) => state.selectAssets);
  const setCameraPosition = useAppStore((state) => state.setCameraPosition);
  const setAssetPosition = useAppStore((state) => state.setAssetPosition);
  const setAssetPositions = useAppStore((state) => state.setAssetPositions);
  const setGenerationDraft = useAppStore((state) => state.setGenerationDraft);
  const setGenerationJobCanvasPlacement = useAppStore((state) => state.setGenerationJobCanvasPlacement);
  const setCanvasInteractionActive = useAppStore((state) => state.setCanvasInteractionActive);
  const setMarquee = useAppStore((state) => state.setMarquee);
  const setSpacePressed = useAppStore((state) => state.setSpacePressed);
  const setViewportSize = useAppStore((state) => state.setViewportSize);
  const toggleSelectedLocked = useAppStore((state) => state.toggleSelectedLocked);
  const hideSelected = useAppStore((state) => state.hideSelected);
  const unhideSelected = useAppStore((state) => state.unhideSelected);
  const unhideAllHidden = useAppStore((state) => state.unhideAllHidden);
  const undoProjectChange = useAppStore((state) => state.undoProjectChange);
  const redoProjectChange = useAppStore((state) => state.redoProjectChange);
  const undoVisibilityChange = useAppStore((state) => state.undoVisibilityChange);
  const redoVisibilityChange = useAppStore((state) => state.redoVisibilityChange);
  const zoomCameraAtPoint = useAppStore((state) => state.zoomCameraAtPoint);
  const isSpacePressed = useAppStore((state) => state.isSpacePressed);
  const pushToast = useAppStore((state) => state.pushToast);

  const writeSelectedAssetsToClipboard = useCallback(async () => {
    const selectedAssets = assets.filter((asset) => selectedAssetIds.includes(asset.id));

    return copyAssetsToClipboard(selectedAssets);
  }, [assets, selectedAssetIds]);

  const copySelectionToClipboard = useCallback(async () => {
    try {
      const result = await writeSelectedAssetsToClipboard();

      if (result.copiedCount === 0) {
        return;
      }

      pushToast({
        kind: "success",
        title: result.copiedCount === 1 ? "Copied image" : "Copied selection",
        description: getClipboardSuccessDescription(result),
      });
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Could not copy the selection.",
      });
    }
  }, [pushToast, writeSelectedAssetsToClipboard]);

  const cutSelectionToClipboard = useCallback(async () => {
    try {
      const result = await writeSelectedAssetsToClipboard();

      if (result.copiedCount === 0) {
        return;
      }

      deleteSelection();
      pushToast({
        kind: "success",
        title: result.copiedCount === 1 ? "Cut image" : "Cut selection",
        description: getClipboardSuccessDescription(result),
      });
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Cut failed",
        description: error instanceof Error ? error.message : "Could not cut the selection.",
      });
    }
  }, [deleteSelection, pushToast, writeSelectedAssetsToClipboard]);

  useCanvasShortcuts({
    frameAll,
    frameSelection,
    centerSelection,
    copySelectionToClipboard,
    cutSelectionToClipboard,
    resetZoom,
    selectAll,
    duplicateSelection,
    deleteSelection,
    toggleSelectedLocked,
    hideSelected,
    unhideSelected,
    unhideAllHidden,
    undoProjectChange,
    redoProjectChange,
    undoVisibilityChange,
    redoVisibilityChange,
    bringSelectionForward,
    sendSelectionBackward,
    bringSelectionToFront,
    sendSelectionToBack,
    groupSelection,
    ungroupSelection,
    clearSelection,
    setSpacePressed,
  });

  const selectedAssetSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const assetMap = useMemo(
    () => Object.fromEntries(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const visibleAssetNodeKey = useMemo(
    () => assets.map((asset) => `${asset.id}:${asset.locked ? "1" : "0"}`).join("|"),
    [assets],
  );
  const zoomLabel = `${Math.round(camera.zoom * 100)}%`;
  const hasLockedSelection = selectedAssetIds.some((assetId) => assetMap[assetId]?.locked);
  const surfaceClassName = isPanning
    ? "canvas-surface canvas-surface--panning"
    : isSpacePressed
      ? "canvas-surface canvas-surface--pan"
      : "canvas-surface";
  const canHideSelected = selectedAssetIds.some((assetId) => !assetMap[assetId]?.hidden);
  const canUnhideSelected = hiddenSelectedCount > 0;
  const rotationSnaps = useMemo(
    () => getRotationSnapAngles(isRotationSnapModifierPressed),
    [isRotationSnapModifierPressed],
  );
  const clampedContextMenuPosition = contextMenu
    ? {
        left: Math.max(12, Math.min(contextMenu.x, size.width - 220)),
        top: Math.max(12, Math.min(contextMenu.y, size.height - 260)),
      }
    : null;

  useEffect(() => {
    selectedAssetIdsRef.current = selectedAssetIds;
  }, [selectedAssetIds]);

  useEffect(() => {
    assetMapRef.current = assetMap;
  }, [assetMap]);

  useEffect(() => {
    if (size.width > 0 && size.height > 0) {
      setViewportSize(size.width, size.height);
    }
  }, [setViewportSize, size.height, size.width]);

  useEffect(() => {
    if (activeGenerationJobs.length === 0) {
      setGenerationAnimationTick(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setGenerationAnimationTick((tick) => (tick + 1) % 9);
    }, 180);

    return () => window.clearInterval(intervalId);
  }, [activeGenerationJobs.length]);

  useEffect(() => {
    const updateRotationSnapModifier = (pressed: boolean) => {
      setIsRotationSnapModifierPressed(pressed);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        updateRotationSnapModifier(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        updateRotationSnapModifier(false);
      }
    };

    const onBlur = () => {
      updateRotationSnapModifier(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeContextMenu = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeContextMenu();
      }
    };

    window.addEventListener("pointerdown", closeContextMenu);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", closeContextMenu);
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    const transformer = transformerRef.current;

    if (!transformer) {
      return;
    }

    const nodes = (hasLockedSelection ? [] : selectedAssetIds)
      .map((assetId) => assetNodeRefs.current[assetId])
      .filter((node): node is Konva.Group => Boolean(node));

    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [hasLockedSelection, selectedAssetIds, visibleAssetNodeKey]);

  const setNodeRef = (assetId: string, node: Konva.Group | null) => {
    assetNodeRefs.current[assetId] = node;
  };

  const syncDragPreviewNodes = (previewPositions: Record<string, Point>, activeAssetId: string) => {
    for (const [id, previewPosition] of Object.entries(previewPositions)) {
      if (id === activeAssetId) {
        continue;
      }

      assetNodeRefs.current[id]?.position(previewPosition);
    }

    const transformer = transformerRef.current;
    transformer?.forceUpdate();
    transformer?.getLayer()?.batchDraw();
  };

  const commitTransformerState = () => {
    const updates = selectedAssetIds
      .map((assetId) => {
        const node = assetNodeRefs.current[assetId];
        const asset = assets.find((candidate) => candidate.id === assetId);

        if (!node || !asset) {
          return null;
        }

        const nextScale = Math.max(
          0.05,
          asset.scale * ((Math.abs(node.scaleX()) + Math.abs(node.scaleY())) / 2),
        );

        return {
          id: assetId,
          x: node.x(),
          y: node.y(),
          rotation: ((node.rotation() % 360) + 360) % 360,
          scale: nextScale,
          node,
        };
      })
      .filter(
        (
          update,
        ): update is {
          id: string;
          x: number;
          y: number;
          rotation: number;
          scale: number;
          node: Konva.Group;
        } => Boolean(update),
      );

    for (const update of updates) {
      update.node.scaleX(1);
      update.node.scaleY(1);
    }

    commitAssetTransforms(
      updates.map(({ node: _node, ...update }) => update),
    );
  };

  const beginAssetDrag = (assetId: string, position: Point) => {
    setCanvasInteractionActive(true);
    const currentSelectedIds = selectedAssetIdsRef.current;
    const currentAssetMap = assetMapRef.current;
    const isCurrentlySelected = currentSelectedIds.includes(assetId);
    const activeIds = isCurrentlySelected ? currentSelectedIds : [assetId];
    const movableIds = activeIds.filter((id) => !currentAssetMap[id]?.locked);

    if (!isCurrentlySelected) {
      selectAsset(assetId);
    }

    dragPreviewPositionsRef.current = null;
    const startPositions = Object.fromEntries(
      movableIds
        .map((id) => {
          const asset = currentAssetMap[id];

          if (!asset) {
            return null;
          }

          return [id, { x: asset.x, y: asset.y }] as const;
        })
        .filter((entry): entry is readonly [string, Point] => Boolean(entry)),
    );

    dragSessionRef.current = {
      assetId,
      selectedIds: movableIds,
      originPosition: startPositions[assetId] ?? position,
      startPositions,
    };
  };

  const updateAssetDrag = (assetId: string, position: Point) => {
    const dragSession = dragSessionRef.current;

    if (!dragSession || dragSession.assetId !== assetId) {
      return;
    }

    const delta = {
      x: position.x - dragSession.originPosition.x,
      y: position.y - dragSession.originPosition.y,
    };
    const previewPositions = Object.fromEntries(
      dragSession.selectedIds
        .map((id) => {
          const startPosition = dragSession.startPositions[id];

          if (!startPosition) {
            return null;
          }

          return [id, { x: startPosition.x + delta.x, y: startPosition.y + delta.y }] as const;
        })
        .filter((entry): entry is readonly [string, Point] => Boolean(entry)),
    );

    if (Object.keys(previewPositions).length === 0) {
      return;
    }

    dragPreviewPositionsRef.current = previewPositions;
    syncDragPreviewNodes(previewPositions, assetId);
  };

  const endAssetDrag = (assetId: string, position: Point) => {
    const dragSession = dragSessionRef.current;

    if (!dragSession || dragSession.assetId !== assetId) {
      setAssetPosition(assetId, position);
      dragPreviewPositionsRef.current = null;
      setCanvasInteractionActive(false);
      return;
    }

    const delta = {
      x: position.x - dragSession.originPosition.x,
      y: position.y - dragSession.originPosition.y,
    };
    const updates = dragSession.selectedIds
      .map((id) => {
        const startPosition = dragSession.startPositions[id];

        if (!startPosition) {
          return null;
        }

        return {
          id,
          position: {
            x: startPosition.x + delta.x,
            y: startPosition.y + delta.y,
          },
        };
      })
      .filter((update): update is { id: string; position: Point } => Boolean(update));

    dragPreviewPositionsRef.current = Object.fromEntries(updates.map((update) => [update.id, update.position]));
    syncDragPreviewNodes(dragPreviewPositionsRef.current, assetId);
    setAssetPositions(updates);
    dragSessionRef.current = null;
    dragPreviewPositionsRef.current = null;
    setCanvasInteractionActive(false);
  };

  const finalizeMarquee = (pointer: Point | null) => {
    if (!marqueeSession) {
      return;
    }

    const width = pointer ? Math.abs(pointer.x - marqueeSession.originScreen.x) : 0;
    const height = pointer ? Math.abs(pointer.y - marqueeSession.originScreen.y) : 0;

    if (!pointer || (width < 4 && height < 4)) {
      if (!marqueeSession.additive) {
        clearSelection();
      }

      setMarquee(null);
      setMarqueeSession(null);
      return;
    }

    const hits = marquee
      ? assets
          .filter((asset) => rectsIntersect(getAssetBounds(asset), marquee))
          .map((asset) => asset.id)
      : [];

    selectAssets(hits, { additive: marqueeSession.additive });
    setMarquee(null);
    setMarqueeSession(null);
  };

  const openContextMenuAt = (clientPosition: Point) => {
    const panelBounds = panelElement?.getBoundingClientRect();

    if (!panelBounds) {
      return;
    }

    setContextMenu({
      x: clientPosition.x - panelBounds.left,
      y: clientPosition.y - panelBounds.top,
    });
  };

  const handleAssetContextMenu = (
    assetId: string,
    clientPosition: Point,
    isSelected: boolean,
    additive: boolean,
  ) => {
    if (!isSelected) {
      selectAsset(assetId, { additive });
    }

    openContextMenuAt(clientPosition);
  };

  const runContextMenuAction = (action: () => void) => {
    action();
    setContextMenu(null);
  };

  return (
    <div className="canvas-panel" ref={setPanelElement}>
      <div className={surfaceClassName}>
        {assets.length === 0 && activeGenerationJobs.length === 0 ? (
          <div className="canvas-onboarding">
            <div className="canvas-onboarding__icon">
              <SelectionIcon size={18} />
            </div>
            <strong>Drop images anywhere to start a board</strong>
            <span>Scroll to zoom. Space or middle mouse to pan. Drag empty space to marquee-select.</span>
          </div>
        ) : null}
        {size.width > 0 && size.height > 0 ? (
          <Stage
            ref={stageRef}
            width={size.width}
            height={size.height}
            x={camera.x}
            y={camera.y}
            scaleX={camera.zoom}
            scaleY={camera.zoom}
            onWheel={(event) => {
              event.evt.preventDefault();
              setContextMenu(null);
              const pointer = event.target.getStage()?.getPointerPosition();

              if (!pointer) {
                return;
              }

              const zoomFactor = event.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
              zoomCameraAtPoint(pointer, zoomFactor);
            }}
            onMouseDown={(event) => {
              setContextMenu(null);
              const stage = event.target.getStage();
              const pointer = stage?.getPointerPosition();

              if (!pointer) {
                return;
              }

              const shouldPan = isSpacePressed || event.evt.button === 1;
              const clickedEmptyCanvas = event.target === stage;

              if (shouldPan) {
                event.evt.preventDefault();
                setCanvasInteractionActive(true);
                panSessionRef.current = {
                  originPointer: pointer,
                  originCamera: {
                    x: camera.x,
                    y: camera.y,
                  },
                };
                setIsPanning(true);
                return;
              }

              if (clickedEmptyCanvas && event.evt.button === 0) {
                const originWorld = screenToWorld(camera, pointer);
                setCanvasInteractionActive(true);
                setMarqueeSession({
                  additive: isAdditiveSelectionModifier(event.evt),
                  originWorld,
                  originScreen: pointer,
                });
                setMarquee({
                  x: originWorld.x,
                  y: originWorld.y,
                  width: 0,
                  height: 0,
                });
              }
            }}
            onMouseMove={(event) => {
              const pointer = event.target.getStage()?.getPointerPosition();

              if (!pointer) {
                return;
              }

              if (panSessionRef.current) {
                setCameraPosition({
                  x: panSessionRef.current.originCamera.x + (pointer.x - panSessionRef.current.originPointer.x),
                  y: panSessionRef.current.originCamera.y + (pointer.y - panSessionRef.current.originPointer.y),
                });
                return;
              }

              if (marqueeSession) {
                const worldPointer = screenToWorld(camera, pointer);
                setMarquee(normalizeRect(marqueeSession.originWorld, worldPointer));
              }
            }}
            onMouseUp={(event) => {
              const pointer = event.target.getStage()?.getPointerPosition() ?? null;
              panSessionRef.current = null;
              setIsPanning(false);
              finalizeMarquee(pointer);
              setCanvasInteractionActive(false);
            }}
            onMouseLeave={() => {
              panSessionRef.current = null;
              setIsPanning(false);
              setCanvasInteractionActive(false);
            }}
            onContextMenu={(event) => {
              event.evt.preventDefault();

              const stage = event.target.getStage();
              if (event.target !== stage) {
                return;
              }

              openContextMenuAt({
                x: event.evt.clientX,
                y: event.evt.clientY,
              });
            }}
          >
            <Layer listening={false}>
              <Rect
                x={-4000}
                y={-4000}
                width={8000}
                height={8000}
                fill="rgba(0,0,0,0.001)"
              />
            </Layer>

            <Layer>
              {assets.map((asset) => {
                const previewPosition = dragPreviewPositionsRef.current?.[asset.id];
                const displayAsset = previewPosition
                  ? {
                      ...asset,
                      x: previewPosition.x,
                      y: previewPosition.y,
                    }
                  : asset;

                return (
                  <AssetLayerItem
                    key={asset.id}
                    asset={displayAsset}
                    isSelected={selectedAssetSet.has(asset.id)}
                    isPanMode={isPanning || isSpacePressed || Boolean(marqueeSession)}
                    onContextMenu={handleAssetContextMenu}
                    onInteractionActiveChange={setCanvasInteractionActive}
                    onSelect={(assetId, additive) => selectAsset(assetId, { additive })}
                    onBeginDrag={beginAssetDrag}
                    onDrag={updateAssetDrag}
                    onEndDrag={endAssetDrag}
                    setNodeRef={setNodeRef}
                  />
                );
              })}

              <Transformer
                ref={transformerRef}
                rotateEnabled={!hasLockedSelection}
                rotationSnaps={rotationSnaps}
                rotationSnapTolerance={ROTATION_SNAP_TOLERANCE_DEGREES}
                keepRatio
                flipEnabled={false}
                enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
                anchorCornerRadius={2}
                anchorFill="#7f96ff"
                anchorSize={10}
                borderStroke="#7f96ff"
                borderStrokeWidth={1.5}
                resizeEnabled={!hasLockedSelection}
                onTransformStart={() => setCanvasInteractionActive(true)}
                onTransformEnd={() => {
                  commitTransformerState();
                  setCanvasInteractionActive(false);
                }}
                boundBoxFunc={(oldBox, newBox) => {
                  if (Math.abs(newBox.width) < 32 || Math.abs(newBox.height) < 32) {
                    return oldBox;
                  }

                  return newBox;
                }}
              />
            </Layer>

            <Layer>
              {activeGenerationJobs.map((job) => (
                <GenerationJobPlaceholderItem
                  key={job.id}
                  job={job}
                  referenceAssets={job.request.selectedAssetIds
                    .map((assetId) => assetRegistry[assetId])
                    .filter((asset): asset is AssetItem => Boolean(asset))}
                  animationTick={generationAnimationTick}
                  isPanMode={isPanning || isSpacePressed || Boolean(marqueeSession)}
                  onDrag={setGenerationJobCanvasPlacement}
                  onInteractionActiveChange={setCanvasInteractionActive}
                />
              ))}
            </Layer>

            <Layer listening={false}>
              {marquee ? (
                <Rect
                  x={marquee.x}
                  y={marquee.y}
                  width={marquee.width}
                  height={marquee.height}
                  fill="rgba(125, 214, 200, 0.12)"
                  stroke="rgba(125, 214, 200, 0.8)"
                  strokeWidth={1.5}
                  dash={[12, 8]}
                />
              ) : null}
            </Layer>
          </Stage>
        ) : null}
      </div>

      {clampedContextMenuPosition ? (
        <div
          className="canvas-context-menu"
          style={clampedContextMenuPosition}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            className="canvas-context-menu__item"
            onClick={() =>
              runContextMenuAction(() =>
                setGenerationDraft({
                  pinnedAssetIds: null,
                  isExplicitlyOpened: true,
                }),
              )
            }
          >
            <SparklesIcon size={14} />
            <span>Generate Image</span>
          </button>

          {selectedAssetIds.length > 0 ? (
            <>
              <button
                className="canvas-context-menu__item"
                disabled={!canHideSelected}
                onClick={() => runContextMenuAction(hideSelected)}
              >
                <EyeOffIcon size={14} />
                <span>Hide Selected</span>
              </button>
              <button
                className="canvas-context-menu__item"
                disabled={!canUnhideSelected}
                onClick={() => runContextMenuAction(unhideSelected)}
              >
                <EyeIcon size={14} />
                <span>Unhide Selected</span>
              </button>
              <button
                className="canvas-context-menu__item"
                disabled={selectedAssetIds.length === 0}
                onClick={() => runContextMenuAction(toggleSelectedLocked)}
              >
                <LockIcon size={14} />
                <span>Toggle Lock</span>
              </button>
              <button
                className="canvas-context-menu__item"
                disabled={selectedAssetIds.length === 0}
                onClick={() => runContextMenuAction(frameSelection)}
              >
                <SizeIcon size={14} />
                <span>Fit Selection</span>
              </button>
            </>
          ) : null}

          {hiddenAssetCount > 0 ? (
            <button
              className="canvas-context-menu__item"
              onClick={() => runContextMenuAction(unhideAllHidden)}
            >
              <EyeIcon size={14} />
              <span>Unhide All Hidden</span>
            </button>
          ) : null}

          <button
            className="canvas-context-menu__item"
            disabled={undoVisibilityCount === 0}
            onClick={() => runContextMenuAction(undoVisibilityChange)}
          >
            <CancelIcon size={14} />
            <span>Undo Visibility</span>
          </button>
          <button
            className="canvas-context-menu__item"
            disabled={redoVisibilityCount === 0}
            onClick={() => runContextMenuAction(redoVisibilityChange)}
          >
            <RetryIcon size={14} />
            <span>Redo Visibility</span>
          </button>
        </div>
      ) : null}

      <div className="canvas-statusbar">
        <span className="canvas-statusbar__item" title="Assets">
          <AssetsIcon size={13} />
          {assetCount}
        </span>
        <span className="canvas-statusbar__item" title="Selected">
          <SelectionIcon size={13} />
          {selectionCount}
        </span>
        <span className="canvas-statusbar__item" title="Zoom">
          <ZoomIcon size={13} />
          {zoomLabel}
        </span>
        <span className="canvas-statusbar__item" title="Pan">
          <PanIcon size={13} />
          Space
        </span>
        <span className="canvas-statusbar__item" title="Marquee selection">
          <MarqueeIcon size={13} />
          Drag
        </span>
      </div>
    </div>
  );
}
