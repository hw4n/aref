import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";

import {
  ArrangeIcon,
  CancelIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  RetryIcon,
  SelectionIcon,
  SizeIcon,
  SparklesIcon,
} from "@/components/icons/ui-icons";
import { getAssetBounds } from "@/domain/assets/asset-geometry";
import {
  isImageAsset,
  isTextAsset,
  type AssetItem,
  type TextAssetContent,
  type TextAssetItem,
} from "@/domain/assets/types";
import type { CameraState } from "@/domain/camera/types";
import { screenToWorld } from "@/domain/camera/camera-math";
import {
  computeGenerationCanvasLayout,
  getGenerationDisplaySizeForSize,
} from "@/domain/jobs/generation-layout";
import type { GenerationJob } from "@/domain/jobs/types";
import { normalizeRect, rectsIntersect } from "@/domain/shared/geometry";
import { arrangeRectsWithoutOverlap } from "@/domain/shared/rect-arrangement";
import type { Point, Rect as CanvasRect } from "@/domain/shared/types";
import { useCanvasShortcuts } from "@/features/canvas/hooks/use-canvas-shortcuts";
import { useStageContainerSize } from "@/features/canvas/hooks/use-stage-container-size";
import {
  CANVAS_RENDER_SETTLE_MS,
  getCanvasRenderMode,
  shouldUseCanvasPreviewImage,
  type CanvasRenderMode,
} from "@/features/canvas/utils/render-mode";
import {
  CANVAS_PRELOAD_OVERSCAN_SCREENS,
  CANVAS_RETAIN_OVERSCAN_SCREENS,
  CANVAS_RENDER_OVERSCAN_SCREENS,
  assetIntersectsViewport,
  getCameraCullingAnchor,
  getCameraOverscanViewport,
  getStableRenderAssetIds,
} from "@/features/canvas/utils/viewport-rendering";
import {
  copyAssetsToClipboard,
  type ClipboardCopyResult,
} from "@/features/canvas/utils/selection-clipboard";
import {
  ROTATION_SNAP_TOLERANCE_DEGREES,
  getRotationSnapAngles,
} from "@/features/canvas/utils/rotation-snaps";
import { preloadRenderableImages } from "@/features/images/hooks/use-renderable-image-url";
import { isLikelyFilePath } from "@/features/project/persistence/project-io";
import { TextStylePanel } from "@/features/text/components/TextStylePanel";
import { useAppStore } from "@/state/app-store";
import {
  selectActiveGenerationJobs,
  selectHiddenAssetCount,
  selectSelectedAssetIds,
  selectSortedVisibleAssets,
} from "@/state/selectors/canvas-selectors";

import { useHtmlImage } from "./use-html-image";

interface AssetLayerItemProps {
  asset: AssetItem;
  isSelected: boolean;
  isPanMode: boolean;
  renderMode: CanvasRenderMode;
  cameraZoom: number;
  canvasPixelRatio: number;
  onSelect: (assetId: string, additive: boolean) => void;
  onEditText: (assetId: string) => void;
  onContextMenu: (assetId: string, clientPosition: Point, isSelected: boolean, additive: boolean) => void;
  onInteractionActiveChange: (active: boolean) => void;
  onBeginDrag: (assetId: string, position: Point) => void;
  onDrag: (assetId: string, position: Point) => void;
  onEndDrag: (assetId: string, position: Point) => void;
  setNodeRef: (assetId: string, node: Konva.Group | null) => void;
  isEditing: boolean;
}

interface DragSession {
  itemId: string;
  kind: "asset" | "generation-job";
  selectedAssetIds: string[];
  selectedGenerationJobIds: string[];
  originPosition: Point;
  assetStartPositions: Record<string, Point>;
  generationJobStartPositions: Record<string, Point>;
}

interface CanvasStageProps {
  onCancelGeneration?: (jobId: string) => void;
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
  if (!isImageAsset(asset)) {
    return null;
  }

  return asset.thumbnailPath ?? (isLikelyFilePath(asset.imagePath) ? null : asset.imagePath);
}

function getAssetRenderedMaxDimension(asset: AssetItem, cameraZoom: number, canvasPixelRatio: number) {
  return Math.max(asset.width * asset.scale, asset.height * asset.scale) * cameraZoom * canvasPixelRatio;
}

function getCanvasDevicePixelRatio() {
  if (typeof window === "undefined") {
    return 1;
  }

  return Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;
}

function getRectsBounds(rects: CanvasRect[]): CanvasRect | null {
  if (rects.length === 0) {
    return null;
  }

  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getGenerationJobBounds(job: GenerationJob): CanvasRect {
  const displaySize = getGenerationDisplaySizeForSize(job.request.settings.size);
  const frames = Array.from({ length: job.request.settings.imageCount }, () => ({
    width: displaySize.width,
    height: displaySize.height,
  }));
  const positions = computeGenerationCanvasLayout(frames, { x: 0, y: 0 });
  const frameBounds = positions.map((position) => ({
    x: job.canvasPlacement.x + position.x - displaySize.width / 2 - 10,
    y: job.canvasPlacement.y + position.y - displaySize.height / 2 - 10,
    width: displaySize.width + 20,
    height: displaySize.height + 20,
  }));

  return getRectsBounds(frameBounds) ?? {
    x: job.canvasPlacement.x - displaySize.width / 2 - 10,
    y: job.canvasPlacement.y - displaySize.height / 2 - 10,
    width: displaySize.width + 20,
    height: displaySize.height + 20,
  };
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
  isSelected,
  isPanMode,
  onSelect,
  onBeginDrag,
  onDrag,
  onEndDrag,
  onInteractionActiveChange,
  setNodeRef,
}: {
  job: GenerationJob;
  referenceAssets: AssetItem[];
  animationTick: number;
  isSelected: boolean;
  isPanMode: boolean;
  onSelect: (jobId: string, additive: boolean) => void;
  onBeginDrag: (jobId: string, position: Point) => void;
  onDrag: (jobId: string, position: Point) => void;
  onEndDrag: (jobId: string, position: Point) => void;
  onInteractionActiveChange: (active: boolean) => void;
  setNodeRef: (jobId: string, node: Konva.Group | null) => void;
}) {
  const statusLabel = job.status === "queued" ? "Queued" : "Generating";
  const statusStroke = isSelected
    ? "#7f96ff"
    : job.status === "queued"
      ? "rgba(255, 199, 92, 0.7)"
      : "rgba(127, 150, 255, 0.82)";
  const displaySize = getGenerationDisplaySizeForSize(job.request.settings.size);
  const frames = Array.from({ length: job.request.settings.imageCount }, () => ({
    width: displaySize.width,
    height: displaySize.height,
  }));
  const positions = computeGenerationCanvasLayout(frames, { x: 0, y: 0 });
  const thumbnailSize = Math.max(32, Math.min(56, Math.round(displaySize.width * 0.16)));
  const visibleReferences = referenceAssets.slice(0, 3);
  const overflowReferenceCount = Math.max(0, referenceAssets.length - visibleReferences.length);
  const promptSummary = job.request.prompt.trim() || "Generating image";
  const suppressDragForPanRef = useRef(false);
  const suppressClickAfterDragRef = useRef(false);

  return (
    <Group
      ref={(node) => setNodeRef(job.id, node)}
      x={job.canvasPlacement.x}
      y={job.canvasPlacement.y}
      draggable={!isPanMode}
      onDragStart={(event) => {
        if (isPanMode || suppressDragForPanRef.current) {
          event.target.stopDrag();
          return;
        }

        event.cancelBubble = true;
        suppressClickAfterDragRef.current = false;
        onBeginDrag(job.id, {
          x: event.target.x(),
          y: event.target.y(),
        });
        onInteractionActiveChange(true);
      }}
      onMouseDown={(event) => {
        const mouseEvent = event.evt as MouseEvent;
        suppressDragForPanRef.current = isPanMode || mouseEvent.button === 1;

        if (!suppressDragForPanRef.current && mouseEvent.button === 0) {
          event.cancelBubble = true;
        }
      }}
      onMouseUp={() => {
        suppressDragForPanRef.current = false;
      }}
      onTouchStart={(event) => {
        if (!isPanMode) {
          event.cancelBubble = true;
          onInteractionActiveChange(true);
        }
      }}
      onTouchEnd={() => {
        onInteractionActiveChange(false);
      }}
      onClick={(event) => {
        if (!isPanMode) {
          event.cancelBubble = true;
        }

        const mouseEvent = event.evt as MouseEvent;
        if (isPanMode || mouseEvent.button !== 0 || suppressClickAfterDragRef.current) {
          return;
        }

        onSelect(job.id, isAdditiveSelectionModifier(mouseEvent));
      }}
      onTap={(event) => {
        if (!isPanMode) {
          event.cancelBubble = true;
        }

        if (isPanMode || suppressClickAfterDragRef.current) {
          return;
        }

        onSelect(job.id, false);
      }}
      onDragMove={(event) => {
        if (isPanMode || suppressDragForPanRef.current) {
          event.target.stopDrag();
          return;
        }

        event.cancelBubble = true;
        suppressClickAfterDragRef.current = true;
        onDrag(job.id, {
          x: event.target.x(),
          y: event.target.y(),
        });
      }}
      onDragEnd={(event) => {
        if (suppressDragForPanRef.current) {
          suppressDragForPanRef.current = false;
          event.target.stopDrag();
          return;
        }

        event.cancelBubble = true;
        onEndDrag(job.id, {
          x: event.target.x(),
          y: event.target.y(),
        });
        onInteractionActiveChange(false);
        window.setTimeout(() => {
          suppressClickAfterDragRef.current = false;
        }, 0);
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

function AssetLayerItemComponent({
  asset,
  isSelected,
  isPanMode,
  renderMode,
  cameraZoom,
  canvasPixelRatio,
  onSelect,
  onEditText,
  onContextMenu,
  onInteractionActiveChange,
  onBeginDrag,
  onDrag,
  onEndDrag,
  setNodeRef,
  isEditing,
}: AssetLayerItemProps) {
  const isText = isTextAsset(asset);
  const renderedMaxDimension = getAssetRenderedMaxDimension(asset, cameraZoom, canvasPixelRatio);
  const shouldUsePreviewImage = shouldUseCanvasPreviewImage(asset, renderMode, renderedMaxDimension);
  const fullImage = useHtmlImage(isText || shouldUsePreviewImage ? null : asset.imagePath);
  const previewImage = useHtmlImage(!isText && asset.thumbnailPath ? asset.thumbnailPath : null);
  const image = shouldUsePreviewImage ? previewImage ?? fullImage : fullImage ?? previewImage;
  const isPreviewImageVisible = Boolean(previewImage && image === previewImage);
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

        if (isPanMode) {
          return;
        }

        event.cancelBubble = true;
        if (suppressClickAfterDragRef.current) {
          return;
        }

        onSelect(asset.id, isAdditiveSelectionModifier(mouseEvent));
      }}
      onDblClick={(event) => {
        if (!isText || isPanMode || asset.locked) {
          return;
        }

        event.cancelBubble = true;
        onSelect(asset.id, false);
        onEditText(asset.id);
      }}
      onTap={(event) => {
        if (isPanMode) {
          return;
        }

        event.cancelBubble = true;
        if (suppressClickAfterDragRef.current) {
          return;
        }

        onSelect(asset.id, false);
      }}
      onDblTap={(event) => {
        if (!isText || isPanMode || asset.locked) {
          return;
        }

        event.cancelBubble = true;
        onSelect(asset.id, false);
        onEditText(asset.id);
      }}
      onContextMenu={(event) => {
        event.evt.preventDefault();
        if (isPanMode) {
          return;
        }

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
        x={isText ? -width / 2 : -width / 2 - 8}
        y={isText ? -height / 2 : -height / 2 - 8}
        width={isText ? width : width + 16}
        height={isText ? height : height + 16}
        cornerRadius={2}
        fill={isText ? "rgba(255, 255, 255, 0.001)" : "rgba(255, 255, 255, 0.01)"}
        stroke={isText ? "rgba(255,255,255,0)" : isSelected ? "#7f96ff" : "rgba(255,255,255,0.06)"}
        strokeWidth={isText ? 0 : isSelected ? 2 : 1}
        shadowBlur={isText || renderMode === "interactive" ? 0 : isSelected ? 12 : 4}
        shadowColor={isSelected ? "rgba(127, 150, 255, 0.35)" : "rgba(0,0,0,0.2)"}
        perfectDrawEnabled={renderMode === "settled"}
      />
      {isText ? (
        <Text
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          text={asset.text.value}
          fontFamily={asset.text.fontFamily}
          fontSize={asset.text.fontSize * asset.scale}
          fontStyle={asset.text.fontStyle}
          fill={asset.text.fill}
          align={asset.text.align}
          lineHeight={asset.text.lineHeight}
          wrap="word"
          opacity={isEditing ? 0.22 : 1}
          perfectDrawEnabled={renderMode === "settled"}
        />
      ) : image ? (
        <KonvaImage
          image={image}
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          cornerRadius={0}
          shadowBlur={renderMode === "interactive" ? 0 : 8}
          shadowColor="rgba(0, 0, 0, 0.2)"
          opacity={isPreviewImageVisible ? 0.92 : 1}
          perfectDrawEnabled={renderMode === "settled"}
        />
      ) : (
        <Rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          cornerRadius={0}
          fill="rgba(255, 255, 255, 0.1)"
          perfectDrawEnabled={renderMode === "settled"}
        />
      )}
    </Group>
  );
}

const AssetLayerItem = memo(
  AssetLayerItemComponent,
  (previous, next) =>
    previous.asset === next.asset
    && previous.isSelected === next.isSelected
    && previous.isPanMode === next.isPanMode
    && previous.renderMode === next.renderMode
    && previous.cameraZoom === next.cameraZoom
    && previous.canvasPixelRatio === next.canvasPixelRatio
    && previous.isEditing === next.isEditing,
);

function TextEditOverlay({
  asset,
  camera,
  onFinish,
  onUpdate,
}: {
  asset: TextAssetItem;
  camera: CameraState;
  onFinish: () => void;
  onUpdate: (update: Partial<TextAssetContent>) => void;
}) {
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const width = Math.max(48, asset.width * asset.scale * camera.zoom);
  const height = Math.max(32, asset.height * asset.scale * camera.zoom);
  const left = camera.x + asset.x * camera.zoom - width / 2;
  const top = camera.y + asset.y * camera.zoom - height / 2;

  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.focus();
    editor.setSelectionRange(0, editor.value.length);
  }, [asset.id]);

  return (
    <textarea
      ref={editorRef}
      className="canvas-text-editor"
      spellCheck={false}
      style={{
        left,
        top,
        width,
        height,
        color: asset.text.fill,
        fontFamily: asset.text.fontFamily,
        fontSize: asset.text.fontSize * asset.scale * camera.zoom,
        fontStyle: asset.text.fontStyle.includes("italic") ? "italic" : "normal",
        fontWeight: asset.text.fontStyle.includes("bold") ? 700 : 400,
        lineHeight: asset.text.lineHeight,
        textAlign: asset.text.align,
        transform: `rotate(${asset.rotation}deg)`,
      }}
      value={asset.text.value}
      onBlur={onFinish}
      onChange={(event) => onUpdate({ value: event.currentTarget.value })}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
          event.preventDefault();
          onFinish();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    />
  );
}

function CanvasStageComponent({ onCancelGeneration }: CanvasStageProps = {}) {
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isCameraRenderSettling, setIsCameraRenderSettling] = useState(false);
  const [isInteractionRenderSettling, setIsInteractionRenderSettling] = useState(false);
  const [isRotationSnapModifierPressed, setIsRotationSnapModifierPressed] = useState(false);
  const [generationAnimationTick, setGenerationAnimationTick] = useState(0);
  const [stableRenderAssetIds, setStableRenderAssetIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [selectedGenerationJobIds, setSelectedGenerationJobIds] = useState<string[]>([]);
  const [marqueeSession, setMarqueeSession] = useState<{
    additive: boolean;
    originWorld: Point;
    originScreen: Point;
  } | null>(null);

  const stageRef = useRef<Konva.Stage | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const assetNodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const generationJobNodeRefs = useRef<Record<string, Konva.Group | null>>({});
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragPreviewPositionsRef = useRef<Record<string, Point> | null>(null);
  const generationJobDragPreviewPositionsRef = useRef<Record<string, Point> | null>(null);
  const cameraRenderSettleTimerRef = useRef<number | null>(null);
  const interactionRenderSettleTimerRef = useRef<number | null>(null);
  const hasTrackedCameraRenderRef = useRef(false);
  const selectedAssetIdsRef = useRef<string[]>([]);
  const selectedGenerationJobIdsRef = useRef<string[]>([]);
  const assetMapRef = useRef<Record<string, AssetItem>>({});
  const generationJobMapRef = useRef<Record<string, GenerationJob>>({});
  const panSessionRef = useRef<{
    originPointer: Point;
    originCamera: Point;
  } | null>(null);
  const isPanningRef = useRef(false);
  const pendingPanCameraPositionRef = useRef<Point | null>(null);
  const panCameraAnimationFrameRef = useRef<number | null>(null);
  const pendingMarqueeRef = useRef<CanvasRect | null>(null);
  const marqueeAnimationFrameRef = useRef<number | null>(null);
  const size = useStageContainerSize(panelElement);

  const camera = useAppStore((state) => state.project.camera);
  const assets = useAppStore(selectSortedVisibleAssets);
  const assetRegistry = useAppStore((state) => state.project.assets);
  const activeGenerationJobs = useAppStore(selectActiveGenerationJobs);
  const selectedAssetIds = useAppStore(selectSelectedAssetIds);
  const hiddenAssetCount = useAppStore(selectHiddenAssetCount);
  const hiddenSelectedCount = useAppStore((state) =>
    state.project.selection.assetIds.filter((assetId) => state.project.assets[assetId]?.hidden).length,
  );
  const undoVisibilityCount = useAppStore((state) => state.visibilityHistory.undoStack.length);
  const redoVisibilityCount = useAppStore((state) => state.visibilityHistory.redoStack.length);
  const editingTextAssetId = useAppStore((state) => state.editingTextAssetId);
  const marquee = useAppStore((state) => state.project.selection.marquee);
  const beginTextEditing = useAppStore((state) => state.beginTextEditing);
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
  const setCanvasItemPositions = useAppStore((state) => state.setCanvasItemPositions);
  const updateTextAsset = useAppStore((state) => state.updateTextAsset);
  const finishTextEditing = useAppStore((state) => state.finishTextEditing);
  const setGenerationDraft = useAppStore((state) => state.setGenerationDraft);
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
  const gridVisible = useAppStore((state) => state.uiPreferences.gridVisible);
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

  const setRenderInteractive = useCallback((active: boolean) => {
    if (interactionRenderSettleTimerRef.current !== null) {
      window.clearTimeout(interactionRenderSettleTimerRef.current);
      interactionRenderSettleTimerRef.current = null;
    }

    if (active) {
      setIsInteractionRenderSettling(true);
      return;
    }

    interactionRenderSettleTimerRef.current = window.setTimeout(() => {
      setIsInteractionRenderSettling(false);
      interactionRenderSettleTimerRef.current = null;
    }, CANVAS_RENDER_SETTLE_MS);
  }, []);

  const setCanvasInteractionPreviewActive = useCallback(
    (active: boolean) => {
      setCanvasInteractionActive(active);
      setRenderInteractive(active);
    },
    [setCanvasInteractionActive, setRenderInteractive],
  );

  const clearCanvasSelection = useCallback(() => {
    clearSelection();
    setSelectedGenerationJobIds([]);
  }, [clearSelection]);

  const selectAllCanvasItems = useCallback(() => {
    selectAll();
    setSelectedGenerationJobIds(activeGenerationJobs.map((job) => job.id));
  }, [activeGenerationJobs, selectAll]);

  const handleCanvasDeleteSelection = useCallback(() => {
    for (const jobId of selectedGenerationJobIdsRef.current) {
      onCancelGeneration?.(jobId);
    }

    deleteSelection();
    setSelectedGenerationJobIds([]);
  }, [deleteSelection, onCancelGeneration]);

  useCanvasShortcuts({
    frameAll,
    frameSelection,
    centerSelection,
    copySelectionToClipboard,
    cutSelectionToClipboard,
    resetZoom,
    selectAll: selectAllCanvasItems,
    duplicateSelection,
    deleteSelection: handleCanvasDeleteSelection,
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
    clearSelection: clearCanvasSelection,
    setSpacePressed,
  });

  const selectedAssetSet = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);
  const selectedGenerationJobSet = useMemo(
    () => new Set(selectedGenerationJobIds),
    [selectedGenerationJobIds],
  );
  const selectedTextAsset = useMemo(() => {
    if (selectedAssetIds.length !== 1) {
      return null;
    }

    const asset = assetRegistry[selectedAssetIds[0]!];
    return asset && isTextAsset(asset) ? asset : null;
  }, [assetRegistry, selectedAssetIds]);
  const editingTextAsset = useMemo(() => {
    if (!editingTextAssetId) {
      return null;
    }

    const asset = assetRegistry[editingTextAssetId];
    return asset && isTextAsset(asset) && !asset.hidden ? asset : null;
  }, [assetRegistry, editingTextAssetId]);
  const assetMap = useMemo(
    () => Object.fromEntries(assets.map((asset) => [asset.id, asset])),
    [assets],
  );
  const generationJobMap = useMemo(
    () => Object.fromEntries(activeGenerationJobs.map((job) => [job.id, job])),
    [activeGenerationJobs],
  );
  const activeGenerationJobIdKey = activeGenerationJobs.map((job) => job.id).join("|");
  const renderMode: CanvasRenderMode = getCanvasRenderMode({
    isCameraRenderSettling,
    isInteractionRenderSettling,
    hasMarqueeSession: Boolean(marqueeSession),
  });
  const canvasPixelRatio = getCanvasDevicePixelRatio();
  const cullingAnchor = getCameraCullingAnchor(camera);
  const renderViewport = useMemo(
    () =>
      getCameraOverscanViewport(
        {
          ...camera,
          x: cullingAnchor.x,
          y: cullingAnchor.y,
        },
        CANVAS_RENDER_OVERSCAN_SCREENS,
      ),
    [camera.zoom, camera.viewportHeight, camera.viewportWidth, cullingAnchor.x, cullingAnchor.y],
  );
  const preloadViewport = useMemo(
    () =>
      getCameraOverscanViewport(
        {
          ...camera,
          x: cullingAnchor.x,
          y: cullingAnchor.y,
        },
        CANVAS_PRELOAD_OVERSCAN_SCREENS,
      ),
    [camera.zoom, camera.viewportHeight, camera.viewportWidth, cullingAnchor.x, cullingAnchor.y],
  );
  const retainViewport = useMemo(
    () =>
      getCameraOverscanViewport(
        {
          ...camera,
          x: cullingAnchor.x,
          y: cullingAnchor.y,
        },
        CANVAS_RETAIN_OVERSCAN_SCREENS,
      ),
    [camera.zoom, camera.viewportHeight, camera.viewportWidth, cullingAnchor.x, cullingAnchor.y],
  );
  const targetRenderAssetIds = useMemo(
    () =>
      assets
        .filter(
          (asset) =>
            selectedAssetSet.has(asset.id) ||
            editingTextAssetId === asset.id ||
            assetIntersectsViewport(asset, renderViewport),
        )
        .map((asset) => asset.id),
    [assets, editingTextAssetId, renderViewport, selectedAssetSet],
  );
  const retainedRenderAssetIds = useMemo(
    () =>
      assets
        .filter(
          (asset) =>
            selectedAssetSet.has(asset.id) ||
            editingTextAssetId === asset.id ||
            assetIntersectsViewport(asset, retainViewport),
        )
        .map((asset) => asset.id),
    [assets, editingTextAssetId, retainViewport, selectedAssetSet],
  );
  const targetRenderAssetIdKey = targetRenderAssetIds.join("|");
  const retainedRenderAssetIdKey = retainedRenderAssetIds.join("|");
  const renderAssetIdSet = useMemo(() => {
    const assetIds = new Set(stableRenderAssetIds);

    for (const assetId of targetRenderAssetIds) {
      assetIds.add(assetId);
    }

    return assetIds;
  }, [stableRenderAssetIds, targetRenderAssetIds]);
  const renderAssets = useMemo(
    () => assets.filter((asset) => renderAssetIdSet.has(asset.id)),
    [assets, renderAssetIdSet],
  );
  const preloadSources = useMemo(() => {
    const sources = new Set<string>();

    for (const asset of assets) {
      if (!isImageAsset(asset) || !assetIntersectsViewport(asset, preloadViewport)) {
        continue;
      }

      if (asset.thumbnailPath) {
        sources.add(asset.thumbnailPath);
      }

      const renderedMaxDimension = getAssetRenderedMaxDimension(asset, camera.zoom, canvasPixelRatio);
      const shouldUsePreviewImage = shouldUseCanvasPreviewImage(asset, renderMode, renderedMaxDimension);

      if (!shouldUsePreviewImage && (renderMode === "settled" || assetIntersectsViewport(asset, renderViewport))) {
        sources.add(asset.imagePath);
      }
    }

    return [...sources];
  }, [assets, camera.zoom, canvasPixelRatio, preloadViewport, renderMode, renderViewport]);
  const visibleAssetNodeKey = useMemo(
    () =>
      renderAssets
        .map((asset) => {
          const textSignature = isTextAsset(asset)
            ? `${asset.text.value}:${asset.text.fontFamily}:${asset.text.fontSize}:${asset.text.fontStyle}:${asset.text.align}:${asset.text.lineHeight}`
            : "";

          return [
            asset.id,
            asset.locked ? "1" : "0",
            asset.width,
            asset.height,
            asset.scale,
            asset.rotation,
            textSignature,
          ].join(":");
        })
        .join("|"),
    [renderAssets],
  );
  const zoomLabel = `${Math.round(camera.zoom * 100)}%`;
  const hasLockedSelection = selectedAssetIds.some((assetId) => assetMap[assetId]?.locked);
  const isPanInteractionMode = isPanning || isSpacePressed || Boolean(marqueeSession);
  const panelClassName = gridVisible ? "canvas-panel" : "canvas-panel canvas-panel--grid-hidden";
  const surfaceClassName = isPanning
    ? "canvas-surface canvas-surface--panning"
    : isSpacePressed
      ? "canvas-surface canvas-surface--pan"
      : "canvas-surface";

  isPanningRef.current = isPanning;

  const canHideSelected = selectedAssetIds.some((assetId) => !assetMap[assetId]?.hidden);
  const canUnhideSelected = hiddenSelectedCount > 0;
  const selectedCanvasItemCount = selectedAssetIds.length + selectedGenerationJobIds.length;
  const movableSelectedCanvasItemCount =
    selectedAssetIds.filter((assetId) => {
      const asset = assetMap[assetId];
      return Boolean(asset) && !asset.locked;
    }).length
    + selectedGenerationJobIds.filter((jobId) => Boolean(generationJobMap[jobId])).length;
  const rotationSnaps = useMemo(
    () => getRotationSnapAngles(isRotationSnapModifierPressed),
    [isRotationSnapModifierPressed],
  );
  const clampedContextMenuPosition = contextMenu
    ? {
        left: Math.max(12, Math.min(contextMenu.x, size.width - 220)),
        top: Math.max(12, Math.min(contextMenu.y, size.height - 300)),
      }
    : null;

  const arrangeSelectedCanvasItemsWithoutOverlap = useCallback(() => {
    type CanvasArrangementId = {
      kind: "asset" | "generation-job";
      id: string;
    };

    const items: Array<{ id: CanvasArrangementId; bounds: CanvasRect; anchor: Point }> = [];

    for (const assetId of selectedAssetIds) {
      const asset = assetMap[assetId];

      if (!asset || asset.locked) {
        continue;
      }

      const bounds = getAssetBounds(asset);
      items.push({
        id: { kind: "asset", id: asset.id },
        bounds,
        anchor: {
          x: asset.x - bounds.x,
          y: asset.y - bounds.y,
        },
      });
    }

    for (const jobId of selectedGenerationJobIds) {
      const job = generationJobMap[jobId];

      if (!job) {
        continue;
      }

      const bounds = getGenerationJobBounds(job);
      items.push({
        id: { kind: "generation-job", id: job.id },
        bounds,
        anchor: {
          x: job.canvasPlacement.x - bounds.x,
          y: job.canvasPlacement.y - bounds.y,
        },
      });
    }

    if (items.length < 2) {
      return;
    }

    const updates = arrangeRectsWithoutOverlap(items);
    const assetPositions = updates
      .filter((update) => update.id.kind === "asset")
      .map((update) => ({ id: update.id.id, position: update.position }));
    const generationJobPlacements = updates
      .filter((update) => update.id.kind === "generation-job")
      .map((update) => ({ id: update.id.id, position: update.position }));

    setCanvasItemPositions({
      assetPositions,
      generationJobPlacements,
    });
  }, [assetMap, generationJobMap, selectedAssetIds, selectedGenerationJobIds, setCanvasItemPositions]);

  useEffect(() => {
    selectedAssetIdsRef.current = selectedAssetIds;
  }, [selectedAssetIds]);

  useEffect(() => {
    selectedGenerationJobIdsRef.current = selectedGenerationJobIds;
  }, [selectedGenerationJobIds]);

  useEffect(() => {
    assetMapRef.current = assetMap;
  }, [assetMap]);

  useEffect(() => {
    generationJobMapRef.current = generationJobMap;
  }, [generationJobMap]);

  useEffect(() => {
    return () => {
      if (panCameraAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(panCameraAnimationFrameRef.current);
      }

      if (marqueeAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(marqueeAnimationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedGenerationJobIds((currentIds) => {
      const nextIds = currentIds.filter((jobId) => Boolean(generationJobMap[jobId]));

      return areStringArraysEqual(currentIds, nextIds) ? currentIds : nextIds;
    });
  }, [activeGenerationJobIdKey, generationJobMap]);

  useEffect(() => {
    if (editingTextAssetId && !editingTextAsset) {
      finishTextEditing();
    }
  }, [editingTextAsset, editingTextAssetId, finishTextEditing]);

  useEffect(() => {
    if (size.width > 0 && size.height > 0) {
      setViewportSize(size.width, size.height);
    }
  }, [setViewportSize, size.height, size.width]);

  useEffect(() => {
    setStableRenderAssetIds((currentIds) => {
      const nextIds = getStableRenderAssetIds({
        currentIds,
        targetIds: targetRenderAssetIds,
        retainedIds: retainedRenderAssetIds,
        pruneToTarget: renderMode === "settled",
      });

      return areStringArraysEqual(currentIds, nextIds) ? currentIds : nextIds;
    });
  }, [renderMode, retainedRenderAssetIdKey, targetRenderAssetIdKey, retainedRenderAssetIds, targetRenderAssetIds]);

  useEffect(() => {
    if (!hasTrackedCameraRenderRef.current) {
      hasTrackedCameraRenderRef.current = true;
      return;
    }

    if (isPanningRef.current) {
      return;
    }

    setIsCameraRenderSettling(true);

    if (cameraRenderSettleTimerRef.current !== null) {
      window.clearTimeout(cameraRenderSettleTimerRef.current);
    }

    cameraRenderSettleTimerRef.current = window.setTimeout(() => {
      setIsCameraRenderSettling(false);
      cameraRenderSettleTimerRef.current = null;
    }, CANVAS_RENDER_SETTLE_MS);

    return () => {
      if (cameraRenderSettleTimerRef.current !== null) {
        window.clearTimeout(cameraRenderSettleTimerRef.current);
        cameraRenderSettleTimerRef.current = null;
      }
    };
  }, [camera.x, camera.y, camera.zoom]);

  useEffect(() => {
    return () => {
      if (interactionRenderSettleTimerRef.current !== null) {
        window.clearTimeout(interactionRenderSettleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (preloadSources.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void preloadRenderableImages(preloadSources);
    }, renderMode === "interactive" ? 120 : 40);

    return () => window.clearTimeout(timeoutId);
  }, [preloadSources, renderMode]);

  useEffect(() => {
    if (activeGenerationJobs.length === 0 || renderMode === "interactive") {
      setGenerationAnimationTick(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setGenerationAnimationTick((tick) => (tick + 1) % 9);
    }, 180);

    return () => window.clearInterval(intervalId);
  }, [activeGenerationJobs.length, renderMode]);

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
    transformer.forceUpdate();
    transformer.getLayer()?.batchDraw();

    const animationFrame = window.requestAnimationFrame(() => {
      transformer.forceUpdate();
      transformer.getLayer()?.batchDraw();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [hasLockedSelection, selectedAssetIds, visibleAssetNodeKey]);

  const setNodeRef = (assetId: string, node: Konva.Group | null) => {
    assetNodeRefs.current[assetId] = node;
  };

  const setGenerationJobNodeRef = (jobId: string, node: Konva.Group | null) => {
    generationJobNodeRefs.current[jobId] = node;
  };

  const syncDragPreviewNodes = (
    assetPreviewPositions: Record<string, Point>,
    generationJobPreviewPositions: Record<string, Point>,
    activeItemId: string,
    activeKind: DragSession["kind"],
  ) => {
    for (const [id, previewPosition] of Object.entries(assetPreviewPositions)) {
      if (activeKind === "asset" && id === activeItemId) {
        continue;
      }

      assetNodeRefs.current[id]?.position(previewPosition);
    }

    for (const [id, previewPosition] of Object.entries(generationJobPreviewPositions)) {
      if (activeKind === "generation-job" && id === activeItemId) {
        continue;
      }

      generationJobNodeRefs.current[id]?.position(previewPosition);
    }

    const transformer = transformerRef.current;
    transformer?.forceUpdate();
    transformer?.getLayer()?.batchDraw();
    for (const node of Object.values(generationJobNodeRefs.current)) {
      node?.getLayer()?.batchDraw();
    }
  };

  const schedulePanCameraPosition = (position: Point) => {
    pendingPanCameraPositionRef.current = position;

    if (panCameraAnimationFrameRef.current !== null) {
      return;
    }

    panCameraAnimationFrameRef.current = window.requestAnimationFrame(() => {
      panCameraAnimationFrameRef.current = null;
      const nextPosition = pendingPanCameraPositionRef.current;
      pendingPanCameraPositionRef.current = null;

      if (nextPosition) {
        setCameraPosition(nextPosition);
      }
    });
  };

  const flushPendingPanCameraPosition = (fallbackPosition: Point | null = null) => {
    if (panCameraAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(panCameraAnimationFrameRef.current);
      panCameraAnimationFrameRef.current = null;
    }

    const nextPosition = fallbackPosition ?? pendingPanCameraPositionRef.current;
    pendingPanCameraPositionRef.current = null;

    if (nextPosition) {
      setCameraPosition(nextPosition);
    }
  };

  const scheduleMarquee = (nextMarquee: CanvasRect) => {
    pendingMarqueeRef.current = nextMarquee;

    if (marqueeAnimationFrameRef.current !== null) {
      return;
    }

    marqueeAnimationFrameRef.current = window.requestAnimationFrame(() => {
      marqueeAnimationFrameRef.current = null;
      const queuedMarquee = pendingMarqueeRef.current;
      pendingMarqueeRef.current = null;

      if (queuedMarquee) {
        setMarquee(queuedMarquee);
      }
    });
  };

  const flushPendingMarquee = () => {
    if (marqueeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(marqueeAnimationFrameRef.current);
      marqueeAnimationFrameRef.current = null;
    }

    const nextMarquee = pendingMarqueeRef.current;
    pendingMarqueeRef.current = null;

    if (nextMarquee) {
      setMarquee(nextMarquee);
    }
  };

  const clearPendingMarquee = () => {
    if (marqueeAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(marqueeAnimationFrameRef.current);
      marqueeAnimationFrameRef.current = null;
    }

    pendingMarqueeRef.current = null;
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

  const beginCanvasItemDrag = (
    kind: DragSession["kind"],
    itemId: string,
    position: Point,
  ) => {
    setCanvasInteractionPreviewActive(true);
    const currentSelectedAssetIds = selectedAssetIdsRef.current;
    const currentSelectedGenerationJobIds = selectedGenerationJobIdsRef.current;
    const currentAssetMap = assetMapRef.current;
    const currentGenerationJobMap = generationJobMapRef.current;
    const isAssetSelected = kind === "asset" && currentSelectedAssetIds.includes(itemId);
    const isGenerationJobSelected =
      kind === "generation-job" && currentSelectedGenerationJobIds.includes(itemId);
    const selectedAssetIdsForDrag =
      kind === "asset"
        ? isAssetSelected
          ? currentSelectedAssetIds
          : [itemId]
        : isGenerationJobSelected
          ? currentSelectedAssetIds
          : [];
    const selectedGenerationJobIdsForDrag =
      kind === "generation-job"
        ? isGenerationJobSelected
          ? currentSelectedGenerationJobIds
          : [itemId]
        : isAssetSelected
          ? currentSelectedGenerationJobIds
          : [];
    const movableAssetIds = selectedAssetIdsForDrag.filter((id) => !currentAssetMap[id]?.locked);
    const movableGenerationJobIds = selectedGenerationJobIdsForDrag.filter((id) =>
      Boolean(currentGenerationJobMap[id]),
    );

    if (kind === "asset" && !isAssetSelected) {
      setSelectedGenerationJobIds([]);
      selectAsset(itemId);
    }

    if (kind === "generation-job" && !isGenerationJobSelected) {
      clearSelection();
      setSelectedGenerationJobIds([itemId]);
    }

    dragPreviewPositionsRef.current = null;
    generationJobDragPreviewPositionsRef.current = null;
    const assetStartPositions = Object.fromEntries(
      movableAssetIds
        .map((id) => {
          const asset = currentAssetMap[id];

          if (!asset) {
            return null;
          }

          return [id, { x: asset.x, y: asset.y }] as const;
        })
        .filter((entry): entry is readonly [string, Point] => Boolean(entry)),
    );
    const generationJobStartPositions = Object.fromEntries(
      movableGenerationJobIds
        .map((id) => {
          const job = currentGenerationJobMap[id];

          if (!job) {
            return null;
          }

          return [id, job.canvasPlacement] as const;
        })
        .filter((entry): entry is readonly [string, Point] => Boolean(entry)),
    );
    const originPosition =
      kind === "asset"
        ? assetStartPositions[itemId] ?? position
        : generationJobStartPositions[itemId] ?? position;

    dragSessionRef.current = {
      itemId,
      kind,
      selectedAssetIds: movableAssetIds,
      selectedGenerationJobIds: movableGenerationJobIds,
      originPosition,
      assetStartPositions,
      generationJobStartPositions,
    };
  };

  const updateCanvasItemDrag = (
    kind: DragSession["kind"],
    itemId: string,
    position: Point,
  ) => {
    const dragSession = dragSessionRef.current;

    if (!dragSession || dragSession.kind !== kind || dragSession.itemId !== itemId) {
      return;
    }

    const delta = {
      x: position.x - dragSession.originPosition.x,
      y: position.y - dragSession.originPosition.y,
    };
    const assetPreviewPositions = Object.fromEntries(
      dragSession.selectedAssetIds
        .map((id) => {
          const startPosition = dragSession.assetStartPositions[id];

          if (!startPosition) {
            return null;
          }

          return [id, { x: startPosition.x + delta.x, y: startPosition.y + delta.y }] as const;
        })
        .filter((entry): entry is readonly [string, Point] => Boolean(entry)),
    );
    const generationJobPreviewPositions = Object.fromEntries(
      dragSession.selectedGenerationJobIds
        .map((id) => {
          const startPosition = dragSession.generationJobStartPositions[id];

          if (!startPosition) {
            return null;
          }

          return [id, { x: startPosition.x + delta.x, y: startPosition.y + delta.y }] as const;
        })
        .filter((entry): entry is readonly [string, Point] => Boolean(entry)),
    );

    if (
      Object.keys(assetPreviewPositions).length === 0
      && Object.keys(generationJobPreviewPositions).length === 0
    ) {
      return;
    }

    dragPreviewPositionsRef.current = assetPreviewPositions;
    generationJobDragPreviewPositionsRef.current = generationJobPreviewPositions;
    syncDragPreviewNodes(assetPreviewPositions, generationJobPreviewPositions, itemId, kind);
  };

  const endCanvasItemDrag = (
    kind: DragSession["kind"],
    itemId: string,
    position: Point,
  ) => {
    const dragSession = dragSessionRef.current;

    if (!dragSession || dragSession.kind !== kind || dragSession.itemId !== itemId) {
      if (kind === "asset") {
        setCanvasItemPositions({ assetPositions: [{ id: itemId, position }] });
      } else {
        setCanvasItemPositions({ generationJobPlacements: [{ id: itemId, position }] });
      }

      dragPreviewPositionsRef.current = null;
      generationJobDragPreviewPositionsRef.current = null;
      setCanvasInteractionPreviewActive(false);
      return;
    }

    const delta = {
      x: position.x - dragSession.originPosition.x,
      y: position.y - dragSession.originPosition.y,
    };
    const assetUpdates = dragSession.selectedAssetIds
      .map((id) => {
        const startPosition = dragSession.assetStartPositions[id];

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
    const generationJobUpdates = dragSession.selectedGenerationJobIds
      .map((id) => {
        const startPosition = dragSession.generationJobStartPositions[id];

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
    const assetPreviewPositions = Object.fromEntries(assetUpdates.map((update) => [update.id, update.position]));
    const generationJobPreviewPositions = Object.fromEntries(
      generationJobUpdates.map((update) => [update.id, update.position]),
    );

    dragPreviewPositionsRef.current = assetPreviewPositions;
    generationJobDragPreviewPositionsRef.current = generationJobPreviewPositions;
    syncDragPreviewNodes(assetPreviewPositions, generationJobPreviewPositions, itemId, kind);
    setCanvasItemPositions({
      assetPositions: assetUpdates,
      generationJobPlacements: generationJobUpdates,
    });
    dragSessionRef.current = null;
    dragPreviewPositionsRef.current = null;
    generationJobDragPreviewPositionsRef.current = null;
    setCanvasInteractionPreviewActive(false);
  };

  const finalizeMarquee = (pointer: Point | null) => {
    if (!marqueeSession) {
      return;
    }

    const width = pointer ? Math.abs(pointer.x - marqueeSession.originScreen.x) : 0;
    const height = pointer ? Math.abs(pointer.y - marqueeSession.originScreen.y) : 0;
    const finalMarquee = pointer
      ? normalizeRect(marqueeSession.originWorld, screenToWorld(camera, pointer))
      : null;
    clearPendingMarquee();

    if (!pointer || (width < 4 && height < 4)) {
      if (!marqueeSession.additive) {
        clearCanvasSelection();
      }

      setMarquee(null);
      setMarqueeSession(null);
      return;
    }

    const hits = finalMarquee
      ? assets
          .filter((asset) => rectsIntersect(getAssetBounds(asset), finalMarquee))
          .map((asset) => asset.id)
      : [];
    const generationJobHits = finalMarquee
      ? activeGenerationJobs
          .filter((job) => rectsIntersect(getGenerationJobBounds(job), finalMarquee))
          .map((job) => job.id)
      : [];

    selectAssets(hits, { additive: marqueeSession.additive });
    setSelectedGenerationJobIds((currentIds) =>
      marqueeSession.additive
        ? Array.from(new Set([...currentIds, ...generationJobHits]))
        : generationJobHits,
    );
    setMarquee(null);
    setMarqueeSession(null);
  };

  const handleAssetSelect = (assetId: string, additive: boolean) => {
    if (!additive) {
      setSelectedGenerationJobIds([]);
    }

    selectAsset(assetId, { additive });
  };

  const handleGenerationJobSelect = (jobId: string, additive: boolean) => {
    if (additive) {
      setSelectedGenerationJobIds((currentIds) =>
        currentIds.includes(jobId)
          ? currentIds.filter((id) => id !== jobId)
          : [...currentIds, jobId],
      );
      return;
    }

    clearSelection();
    setSelectedGenerationJobIds([jobId]);
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
      if (!additive) {
        setSelectedGenerationJobIds([]);
      }

      selectAsset(assetId, { additive });
    }

    openContextMenuAt(clientPosition);
  };

  const runContextMenuAction = (action: () => void) => {
    action();
    setContextMenu(null);
  };

  return (
    <div className={panelClassName} ref={setPanelElement}>
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
                setCanvasInteractionPreviewActive(true);
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
                schedulePanCameraPosition({
                  x: panSessionRef.current.originCamera.x + (pointer.x - panSessionRef.current.originPointer.x),
                  y: panSessionRef.current.originCamera.y + (pointer.y - panSessionRef.current.originPointer.y),
                });
                return;
              }

              if (marqueeSession) {
                const worldPointer = screenToWorld(camera, pointer);
                scheduleMarquee(normalizeRect(marqueeSession.originWorld, worldPointer));
              }
            }}
            onMouseUp={(event) => {
              const pointer = event.target.getStage()?.getPointerPosition() ?? null;
              const panSession = panSessionRef.current;

              if (panSession && pointer) {
                flushPendingPanCameraPosition({
                  x: panSession.originCamera.x + (pointer.x - panSession.originPointer.x),
                  y: panSession.originCamera.y + (pointer.y - panSession.originPointer.y),
                });
              } else {
                flushPendingPanCameraPosition();
              }

              panSessionRef.current = null;
              setIsPanning(false);
              finalizeMarquee(pointer);
              if (panSession) {
                setCanvasInteractionActive(false);
              } else {
                setCanvasInteractionPreviewActive(false);
              }
            }}
            onMouseLeave={() => {
              const panSession = panSessionRef.current;
              flushPendingPanCameraPosition();
              flushPendingMarquee();
              panSessionRef.current = null;
              setIsPanning(false);
              if (panSession) {
                setCanvasInteractionActive(false);
              } else {
                setCanvasInteractionPreviewActive(false);
              }
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
              {renderAssets.map((asset) => {
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
                    isEditing={editingTextAssetId === asset.id}
                    isPanMode={isPanInteractionMode}
                    renderMode={renderMode}
                    cameraZoom={camera.zoom}
                    canvasPixelRatio={canvasPixelRatio}
                    onContextMenu={handleAssetContextMenu}
                    onEditText={beginTextEditing}
                    onInteractionActiveChange={setCanvasInteractionPreviewActive}
                    onSelect={handleAssetSelect}
                    onBeginDrag={(assetId, position) => beginCanvasItemDrag("asset", assetId, position)}
                    onDrag={(assetId, position) => updateCanvasItemDrag("asset", assetId, position)}
                    onEndDrag={(assetId, position) => endCanvasItemDrag("asset", assetId, position)}
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
                onTransformStart={() => setCanvasInteractionPreviewActive(true)}
                onTransformEnd={() => {
                  commitTransformerState();
                  setCanvasInteractionPreviewActive(false);
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
              {activeGenerationJobs.map((job) => {
                const previewPosition = generationJobDragPreviewPositionsRef.current?.[job.id];
                const displayJob = previewPosition
                  ? {
                      ...job,
                      canvasPlacement: previewPosition,
                    }
                  : job;

                return (
                  <GenerationJobPlaceholderItem
                    key={job.id}
                    job={displayJob}
                    referenceAssets={job.request.selectedAssetIds
                      .map((assetId) => assetRegistry[assetId])
                      .filter((asset): asset is AssetItem => Boolean(asset) && isImageAsset(asset))}
                    animationTick={generationAnimationTick}
                    isSelected={selectedGenerationJobSet.has(job.id)}
                    isPanMode={isPanInteractionMode}
                    onSelect={handleGenerationJobSelect}
                    onBeginDrag={(jobId, position) => beginCanvasItemDrag("generation-job", jobId, position)}
                    onDrag={(jobId, position) => updateCanvasItemDrag("generation-job", jobId, position)}
                    onEndDrag={(jobId, position) => endCanvasItemDrag("generation-job", jobId, position)}
                    onInteractionActiveChange={setCanvasInteractionPreviewActive}
                    setNodeRef={setGenerationJobNodeRef}
                  />
                );
              })}
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

      {selectedTextAsset ? (
        <TextStylePanel
          asset={selectedTextAsset}
          onUpdate={(update) => updateTextAsset(selectedTextAsset.id, update)}
        />
      ) : null}

      {editingTextAsset ? (
        <TextEditOverlay
          asset={editingTextAsset}
          camera={camera}
          onFinish={finishTextEditing}
          onUpdate={(update) => updateTextAsset(editingTextAsset.id, update)}
        />
      ) : null}

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

          {selectedCanvasItemCount > 0 ? (
            <button
              className="canvas-context-menu__item"
              disabled={movableSelectedCanvasItemCount < 2}
              onClick={() => runContextMenuAction(arrangeSelectedCanvasItemsWithoutOverlap)}
            >
              <ArrangeIcon size={14} />
              <span>Tidy Selection</span>
            </button>
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
        <button className="canvas-statusbar__item" onClick={resetZoom} title="Reset Zoom">
          {zoomLabel}
        </button>
      </div>
    </div>
  );
}

export const CanvasStage = memo(CanvasStageComponent);
