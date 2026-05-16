import { useEffect } from "react";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  SaveAsIcon,
} from "@/components/icons/ui-icons";
import type { ImageAssetItem } from "@/domain/assets/types";
import { useRenderableImageUrl } from "@/features/images/hooks/use-renderable-image-url";

interface PhotoViewerDialogProps {
  asset: ImageAssetItem;
  assets: ImageAssetItem[];
  currentIndex: number;
  totalCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  canExport: boolean;
  isExporting: boolean;
  selectedAssetIds: string[];
  onClose: () => void;
  onExportSelected: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSelectIndex: (index: number) => void;
  onToggleSelection: (assetId: string) => void;
}

function getPhotoTitle(asset: ImageAssetItem) {
  return asset.sourceName?.trim() || (asset.kind === "generated" ? "Generated image" : "Imported image");
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

export function PhotoViewerDialog({
  asset,
  assets,
  currentIndex,
  totalCount,
  hasPrevious,
  hasNext,
  canExport,
  isExporting,
  selectedAssetIds,
  onClose,
  onExportSelected,
  onNext,
  onPrevious,
  onSelectIndex,
  onToggleSelection,
}: PhotoViewerDialogProps) {
  const imageSource = useRenderableImageUrl(asset.imagePath);
  const title = getPhotoTitle(asset);
  const selectedAssetIdSet = new Set(selectedAssetIds);
  const isCurrentSelected = selectedAssetIdSet.has(asset.id);
  const selectedCount = selectedAssetIds.length;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowLeft" && hasPrevious) {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        onNext();
        return;
      }

      if (event.code === "Space" && !isInteractiveTarget(event.target)) {
        event.preventDefault();
        onToggleSelection(asset.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [asset.id, hasNext, hasPrevious, onClose, onNext, onPrevious, onToggleSelection]);

  return (
    <div
      className="photo-viewer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-viewer-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="photo-viewer__surface">
        <header className="photo-viewer__toolbar">
          <div className="photo-viewer__title-block">
            <h2 id="photo-viewer-title">{title}</h2>
            <span>{`${currentIndex + 1} / ${totalCount}`}</span>
          </div>
          <div className="photo-viewer__toolbar-actions">
            <label className="photo-viewer__current-check">
              <input
                type="checkbox"
                checked={isCurrentSelected}
                onChange={() => onToggleSelection(asset.id)}
              />
              <span>Selected</span>
            </label>
            <button
              className="photo-viewer__export-button"
              type="button"
              disabled={!canExport || selectedCount === 0 || isExporting}
              title={canExport ? "Export selected images" : "Desktop app required to export images"}
              onClick={onExportSelected}
            >
              <SaveAsIcon size={15} />
              <span>{isExporting ? "Exporting" : `Export selected (${selectedCount})`}</span>
            </button>
            <button
              className="photo-viewer__icon-button"
              type="button"
              title="Close"
              aria-label="Close photo viewer"
              onClick={onClose}
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </header>

        <div className="photo-viewer__content">
          <div className="photo-viewer__stage">
            <button
              className="photo-viewer__nav photo-viewer__nav--previous"
              type="button"
              title="Previous photo"
              aria-label="Previous photo"
              disabled={!hasPrevious}
              onClick={onPrevious}
            >
              <ChevronLeftIcon size={26} />
            </button>

            <img
              className="photo-viewer__image"
              src={imageSource}
              alt={title}
              draggable={false}
            />

            <button
              className="photo-viewer__nav photo-viewer__nav--next"
              type="button"
              title="Next photo"
              aria-label="Next photo"
              disabled={!hasNext}
              onClick={onNext}
            >
              <ChevronRightIcon size={26} />
            </button>
          </div>

          <aside className="photo-viewer__list" aria-label="Photo files">
            <div className="photo-viewer__list-header">
              <span>Files</span>
              <span>{`${selectedCount} selected`}</span>
            </div>
            <ul>
              {assets.map((candidate, index) => {
                const candidateTitle = getPhotoTitle(candidate);
                const checked = selectedAssetIdSet.has(candidate.id);
                const active = candidate.id === asset.id;

                return (
                  <li
                    key={candidate.id}
                    className={active ? "photo-viewer__list-item photo-viewer__list-item--active" : "photo-viewer__list-item"}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      aria-label={`Select ${candidateTitle}`}
                      onChange={() => onToggleSelection(candidate.id)}
                    />
                    <button
                      type="button"
                      onClick={() => onSelectIndex(index)}
                      title={candidateTitle}
                    >
                      <span>{candidateTitle}</span>
                      <small>{`${index + 1} / ${totalCount}`}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>

        <footer className="photo-viewer__details">
          <span>{asset.kind === "generated" ? "Generated" : "Imported"}</span>
          {asset.hidden ? <span>Hidden</span> : null}
          <span>{`${Math.round(asset.width)} x ${Math.round(asset.height)}`}</span>
        </footer>
      </div>
    </div>
  );
}
