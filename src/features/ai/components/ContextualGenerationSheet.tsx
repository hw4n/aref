import {
  CancelIcon,
  EyeIcon,
  EyeOffIcon,
  GroupIcon,
  KindIcon,
  LayersBackIcon,
  LayersDownIcon,
  LayersFrontIcon,
  LayersUpIcon,
  LockIcon,
  PositionIcon,
  SelectionIcon,
  SizeIcon,
  SourceIcon,
  SparklesIcon,
} from "@/components/icons/ui-icons";
import type { AssetItem } from "@/domain/assets/types";
import type {
  GenerationAspectRatio,
  GenerationImageQuality,
  GenerationModeration,
  GenerationRequest,
} from "@/domain/jobs/types";
import type { GenerationProviderAdapter } from "@/domain/providers/types";
import { useRenderableImageUrl } from "@/features/images/hooks/use-renderable-image-url";
import { useAppStore } from "@/state/app-store";
import { selectSelectedAssets, selectSelectedGroups } from "@/state/selectors/canvas-selectors";

function ReferenceThumb({ src }: { src: string }) {
  const renderableSrc = useRenderableImageUrl(src);

  return <img alt="" src={renderableSrc} />;
}

const ASPECT_RATIO_OPTIONS: GenerationAspectRatio[] = ["unspecified", "1:1", "4:3", "3:4", "16:9", "9:16"];
const QUALITY_OPTIONS: GenerationImageQuality[] = ["low", "medium", "high"];
const MODERATION_OPTIONS: GenerationModeration[] = ["low", "auto"];
const COUNT_OPTIONS = [1, 2, 4];

function getAspectRatioLabel(aspectRatio: GenerationAspectRatio) {
  if (aspectRatio === "unspecified") {
    return "Unspecified";
  }

  if (aspectRatio === "1:1") {
    return "1:1 (Square)";
  }

  if (aspectRatio === "4:3") {
    return "4:3";
  }

  if (aspectRatio === "3:4") {
    return "3:4";
  }

  if (aspectRatio === "16:9") {
    return "16:9";
  }

  return "9:16";
}

interface ContextualGenerationSheetProps {
  activeProvider: GenerationProviderAdapter | null;
  onSubmitGeneration: (request: GenerationRequest) => void | Promise<string | null>;
}

export function ContextualGenerationSheet({
  activeProvider,
  onSubmitGeneration,
}: ContextualGenerationSheetProps) {
  const selectedAssets = useAppStore(selectSelectedAssets);
  const selectedGroups = useAppStore(selectSelectedGroups);
  const generationDraft = useAppStore((state) => state.generationDraft);
  const isPinnedReferenceSet = generationDraft.pinnedAssetIds !== null;
  const referenceAssets = useAppStore((state) => {
    const referenceAssetIds = state.generationDraft.pinnedAssetIds ?? state.project.selection.assetIds;
    return referenceAssetIds
      .map((assetId) => state.project.assets[assetId])
      .filter((asset): asset is AssetItem => Boolean(asset));
  });
  const referenceAssetIds = useAppStore(
    (state) => state.generationDraft.pinnedAssetIds ?? state.project.selection.assetIds,
  );
  const centerSelection = useAppStore((state) => state.centerSelection);
  const frameSelection = useAppStore((state) => state.frameSelection);
  const groupSelection = useAppStore((state) => state.groupSelection);
  const bringSelectionForward = useAppStore((state) => state.bringSelectionForward);
  const bringSelectionToFront = useAppStore((state) => state.bringSelectionToFront);
  const hideSelected = useAppStore((state) => state.hideSelected);
  const sendSelectionBackward = useAppStore((state) => state.sendSelectionBackward);
  const sendSelectionToBack = useAppStore((state) => state.sendSelectionToBack);
  const toggleSelectedLocked = useAppStore((state) => state.toggleSelectedLocked);
  const setGenerationDraft = useAppStore((state) => state.setGenerationDraft);
  const ungroupSelection = useAppStore((state) => state.ungroupSelection);
  const unhideSelected = useAppStore((state) => state.unhideSelected);

  const hiddenSelectionCount = referenceAssets.filter((asset) => asset.hidden).length;
  const hasReferences = referenceAssets.length > 0;
  const firstReferenceAsset = referenceAssets[0] ?? null;
  const allSelectedLocked = selectedAssets.length > 0 && selectedAssets.every((asset) => asset.locked);
  const allSelectedHidden = selectedAssets.length > 0 && selectedAssets.every((asset) => asset.hidden);
  const canSubmitGeneration = generationDraft.prompt.trim().length > 0 && Boolean(activeProvider);
  const isOAuthProvider = activeProvider?.id === "ima2-sidecar";

  const handleRemoveReference = (assetId: string) => {
    const sourceIds = generationDraft.pinnedAssetIds ?? referenceAssetIds;
    setGenerationDraft({
      pinnedAssetIds: sourceIds.filter((id) => id !== assetId),
    });
  };

  const handleFollowSelection = () => {
    setGenerationDraft({ pinnedAssetIds: null });
  };

  const handleSubmitGeneration = () => {
    if (!activeProvider) {
      return;
    }

    void onSubmitGeneration({
      selectedAssetIds: referenceAssetIds,
      prompt: generationDraft.prompt,
      negativePrompt: generationDraft.negativePrompt,
      provider: activeProvider.id,
      model: isOAuthProvider ? activeProvider.defaultModel : generationDraft.model,
      settings: generationDraft.settings,
    });
  };

  return (
    <aside className="generation-sheet">
      <section className={`inspector-panel__sheet ${hasReferences ? "" : "inspector-panel__sheet--neutral"}`}>
        <header className="inspector-panel__sheet-header">
          <div className="inspector-panel__sheet-title">
            <SparklesIcon size={16} />
            <h2>{hasReferences ? "Generate from Selection" : "Generate"}</h2>
          </div>
          <strong className="inspector-panel__count">{referenceAssets.length}</strong>
        </header>

        {activeProvider ? (
          <div className="inspector-panel__sheet-pills">
            <span>{activeProvider.label}</span>
            {isOAuthProvider ? null : <span>{generationDraft.model}</span>}
            <span>{hasReferences ? `${referenceAssets.length} refs` : "Prompt only"}</span>
            {isPinnedReferenceSet ? <span>Pinned refs</span> : <span>Live selection</span>}
            {isPinnedReferenceSet ? (
              <button className="inspector-panel__sheet-link" onClick={handleFollowSelection}>
                Follow selection
              </button>
            ) : null}
          </div>
        ) : null}

        {hasReferences ? (
          <div className="inspector-panel__thumbs" aria-label="Selected reference assets">
            {referenceAssets.map((asset) => (
              <button
                key={asset.id}
                className="inspector-panel__thumb inspector-panel__thumb--button"
                onClick={() => handleRemoveReference(asset.id)}
                title="Remove from generation references"
              >
                <ReferenceThumb src={asset.thumbnailPath ?? asset.imagePath} />
                <span className="inspector-panel__thumb-remove">
                  <CancelIcon size={12} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="inspector-panel__neutral-state">
            <div className="inspector-panel__empty">
              <SelectionIcon size={18} />
              <span>No live references selected.</span>
            </div>
            <p className="inspector-panel__sheet-note">
              Select one or more canvas items to use them as refs, remove refs by clicking thumbnails, or keep typing for prompt-only generation.
            </p>
          </div>
        )}

        {selectedAssets.length > 0 ? (
          <>
            <div className="inspector-panel__sheet-pills">
              <span>{`${selectedAssets.length} selected`}</span>
              {hiddenSelectionCount > 0 ? <span>{`${hiddenSelectionCount} hidden`}</span> : null}
              {selectedGroups.length > 0 ? <span>{`${selectedGroups.length} group${selectedGroups.length === 1 ? "" : "s"}`}</span> : null}
            </div>

            <div className="inspector-panel__selection-actions">
              <button className="inspector-panel__selection-action" onClick={toggleSelectedLocked}>
                <LockIcon size={14} />
                <span>{allSelectedLocked ? "Unlock" : "Lock"}</span>
              </button>
              <button className="inspector-panel__selection-action" onClick={hideSelected}>
                <EyeOffIcon size={14} />
                <span>Hide Selected</span>
              </button>
              <button
                className="inspector-panel__selection-action"
                disabled={!allSelectedHidden && hiddenSelectionCount === 0}
                onClick={unhideSelected}
              >
                <EyeIcon size={14} />
                <span>Unhide Selected</span>
              </button>
              <button
                className="inspector-panel__selection-action"
                disabled={selectedAssets.length < 2}
                onClick={groupSelection}
              >
                <GroupIcon size={14} />
                <span>Group</span>
              </button>
              <button
                className="inspector-panel__selection-action"
                disabled={selectedGroups.length === 0}
                onClick={ungroupSelection}
              >
                <CancelIcon size={14} />
                <span>Ungroup</span>
              </button>
              <button className="inspector-panel__selection-action" onClick={frameSelection}>
                <SizeIcon size={14} />
                <span>Fit</span>
              </button>
              <button className="inspector-panel__selection-action" onClick={centerSelection}>
                <PositionIcon size={14} />
                <span>Center</span>
              </button>
              <button className="inspector-panel__selection-action" onClick={sendSelectionToBack}>
                <LayersBackIcon size={14} />
                <span>Back</span>
              </button>
              <button className="inspector-panel__selection-action" onClick={sendSelectionBackward}>
                <LayersDownIcon size={14} />
                <span>Down</span>
              </button>
              <button className="inspector-panel__selection-action" onClick={bringSelectionForward}>
                <LayersUpIcon size={14} />
                <span>Up</span>
              </button>
              <button className="inspector-panel__selection-action" onClick={bringSelectionToFront}>
                <LayersFrontIcon size={14} />
                <span>Front</span>
              </button>
            </div>
          </>
        ) : null}

        <div className="inspector-panel__form">
          <label className="inspector-panel__field">
            <span>Prompt</span>
            <textarea
              placeholder={hasReferences ? "Describe the image you want to generate from these refs" : "Describe the image you want to generate"}
              rows={5}
              value={generationDraft.prompt}
              onChange={(event) => setGenerationDraft({ prompt: event.currentTarget.value })}
            />
          </label>

          <label className="inspector-panel__field">
            <span>Negative Prompt</span>
            <textarea
              placeholder="Optional constraints or things to avoid"
              rows={3}
              value={generationDraft.negativePrompt}
              onChange={(event) => setGenerationDraft({ negativePrompt: event.currentTarget.value })}
            />
          </label>

          <div className="inspector-panel__form-grid">
            {isOAuthProvider ? null : (
              <label className="inspector-panel__field">
                <span>Model</span>
                <select
                  value={generationDraft.model}
                  onChange={(event) => setGenerationDraft({ model: event.currentTarget.value })}
                >
                  {(activeProvider?.models ?? []).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {isOAuthProvider ? (
              <>
                <label className="inspector-panel__field">
                  <span>Quality</span>
                  <select
                    value={generationDraft.settings.quality}
                    onChange={(event) =>
                      setGenerationDraft({
                        settings: {
                          quality: event.currentTarget.value as GenerationImageQuality,
                        },
                      })
                    }
                  >
                    {QUALITY_OPTIONS.map((quality) => (
                      <option key={quality} value={quality}>
                        {quality}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="inspector-panel__field">
                  <span>Moderation</span>
                  <select
                    value={generationDraft.settings.moderation}
                    onChange={(event) =>
                      setGenerationDraft({
                        settings: {
                          moderation: event.currentTarget.value as GenerationModeration,
                        },
                      })
                    }
                  >
                    {MODERATION_OPTIONS.map((moderation) => (
                      <option key={moderation} value={moderation}>
                        {moderation}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            <label className="inspector-panel__field">
              <span>Count</span>
              <select
                value={generationDraft.settings.imageCount}
                onChange={(event) =>
                  setGenerationDraft({
                    settings: {
                      imageCount: Math.max(1, Math.min(4, Number.parseInt(event.currentTarget.value, 10) || 1)),
                    },
                  })
                }
              >
                {COUNT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>

            <label className="inspector-panel__field inspector-panel__field--span">
              <span>Aspect</span>
              <select
                value={generationDraft.settings.aspectRatio}
                onChange={(event) =>
                  setGenerationDraft({
                    settings: {
                      aspectRatio: event.currentTarget.value as GenerationAspectRatio,
                    },
                  })
                }
              >
                {ASPECT_RATIO_OPTIONS.map((aspectRatio) => (
                  <option key={aspectRatio} value={aspectRatio}>
                    {getAspectRatioLabel(aspectRatio)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <button className="inspector-panel__submit" disabled={!canSubmitGeneration} onClick={handleSubmitGeneration}>
          <SparklesIcon size={15} />
          <span>Generate</span>
        </button>

        {firstReferenceAsset ? (
          <>
            <div className="inspector-panel__divider" />
            <dl className="inspector-panel__grid">
              <div title="Kind">
                <dt>
                  <KindIcon size={14} />
                  <span className="sr-only">Kind</span>
                </dt>
                <dd>{firstReferenceAsset.kind}</dd>
              </div>
              <div title="Source">
                <dt>
                  <SourceIcon size={14} />
                  <span className="sr-only">Source</span>
                </dt>
                <dd>{firstReferenceAsset.sourceName ?? "Reference"}</dd>
              </div>
              <div title="Size">
                <dt>
                  <SizeIcon size={14} />
                  <span className="sr-only">Size</span>
                </dt>
                <dd>{`${firstReferenceAsset.width} x ${firstReferenceAsset.height}`}</dd>
              </div>
              <div title="Position">
                <dt>
                  <PositionIcon size={14} />
                  <span className="sr-only">Position</span>
                </dt>
                <dd>{`${Math.round(firstReferenceAsset.x)}, ${Math.round(firstReferenceAsset.y)}`}</dd>
              </div>
              <div title="State">
                <dt>
                  <LockIcon size={14} />
                  <span className="sr-only">State</span>
                </dt>
                <dd>{`${firstReferenceAsset.locked ? "Locked" : "Free"} • ${firstReferenceAsset.hidden ? "Hidden" : "Visible"}`}</dd>
              </div>
              {selectedGroups[0] ? (
                <div title="Group">
                  <dt>
                    <GroupIcon size={14} />
                    <span className="sr-only">Group</span>
                  </dt>
                  <dd>{selectedGroups[0].name}</dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : null}
      </section>
    </aside>
  );
}
