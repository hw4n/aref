import {
  AssetsIcon,
  CancelIcon,
  EyeIcon,
  EyeOffIcon,
  RecentIcon,
  RemoveJobIcon,
  RerunJobIcon,
  RetryIcon,
  RunningIcon,
  ReuseJobIcon,
  SparklesIcon,
} from "@/components/icons/ui-icons";
import type { AssetItem } from "@/domain/assets/types";
import { AssetThumbnail } from "@/features/images/components/AssetThumbnail";
import { getProjectDisplayName } from "@/features/project/persistence/project-title";
import type { RecentProjectRecord } from "@/features/project/persistence/types";
import { useAppStore } from "@/state/app-store";
import { selectSortedAssets, selectSortedGenerationJobs } from "@/state/selectors/canvas-selectors";

interface InspectorPanelProps {
  recentProjects: RecentProjectRecord[];
  onOpenRecentProject: (path: string) => void | Promise<void>;
  onCancelGeneration: (jobId: string) => void;
  onRerunGeneration: (jobId: string) => void | Promise<string | null>;
}

function GenerationJobCard({
  jobId,
  onCancelGeneration,
  onRerunGeneration,
}: {
  jobId: string;
  onCancelGeneration: (jobId: string) => void;
  onRerunGeneration: (jobId: string) => void | Promise<string | null>;
}) {
  const { job, missingReferenceCount } = useAppStore((state) => {
    const currentJob = state.project.jobs[jobId];

    return {
      job: currentJob,
      missingReferenceCount: currentJob
        ? currentJob.request.selectedAssetIds.filter((assetId) => !state.project.assets[assetId]).length
        : 0,
    };
  });
  const setGenerationDraft = useAppStore((state) => state.setGenerationDraft);
  const removeGenerationJob = useAppStore((state) => state.removeGenerationJob);
  const pushToast = useAppStore((state) => state.pushToast);

  if (!job) {
    return null;
  }

  const canCancel = job.status === "queued" || job.status === "running";
  const canRerun = !canCancel && missingReferenceCount === 0;
  const canRemove = !canCancel;
  const resultCount = job.resultAssetIds.length;
  const reuseJobRequest = () => {
    setGenerationDraft({
      prompt: job.request.prompt,
      negativePrompt: job.request.negativePrompt ?? "",
      pinnedAssetIds: [],
      isExplicitlyOpened: true,
    });

    pushToast({
      kind: "success",
      title: "Prompt reused",
      description: "Only the prompt text was loaded. References were not copied.",
    });
  };

  const removeJob = () => {
    removeGenerationJob(job.id);
    pushToast({
      kind: "info",
      title: "Job removed",
      description: "The job was removed from the list.",
    });
  };

  return (
    <article className="generation-job-card">
      <header className="generation-job-card__header">
        <span className={`generation-job-card__status generation-job-card__status--${job.status}`}>
          <RunningIcon size={14} />
          <strong>{job.status}</strong>
        </span>
        <span className="generation-job-card__meta">{`${job.request.provider} • ${job.request.model}`}</span>
      </header>

      <p className="generation-job-card__prompt">{job.request.prompt}</p>

      <div className="generation-job-card__details">
        <span>{`${job.request.selectedAssetIds.length} refs`}</span>
        <span>{`${job.request.settings.imageCount} outputs`}</span>
        <span>{job.request.settings.aspectRatio}</span>
        <span>{job.providerMode ?? (job.request.selectedAssetIds.length === 1 ? "edit" : "generate")}</span>
        <span>{`Try ${job.attemptCount}`}</span>
        {missingReferenceCount > 0 ? (
          <span className="generation-job-card__warning">{`${missingReferenceCount} missing ref${missingReferenceCount === 1 ? "" : "s"}`}</span>
        ) : null}
      </div>

      {job.error ? <p className="generation-job-card__error">{job.error}</p> : null}
      {job.status === "succeeded" ? (
        <p className="generation-job-card__success">{`${resultCount} result${resultCount === 1 ? "" : "s"} on canvas`}</p>
      ) : null}

      <div className="generation-job-card__actions">
        {canCancel ? (
          <button className="generation-job-card__action" onClick={() => onCancelGeneration(job.id)} title="Cancel job">
            <CancelIcon size={14} />
            <span>Cancel</span>
          </button>
        ) : (
          <button
            className="generation-job-card__action"
            disabled={!canRerun}
            onClick={() => void onRerunGeneration(job.id)}
            title={canRerun ? "Rerun job" : "Cannot rerun because original references are missing"}
          >
            <RerunJobIcon size={14} />
            <span>Rerun</span>
          </button>
        )}
        <button className="generation-job-card__action" onClick={reuseJobRequest} title="Reuse prompt only">
          <ReuseJobIcon size={14} />
          <span>Reuse</span>
        </button>
        <button
          className="generation-job-card__action generation-job-card__action--danger"
          disabled={!canRemove}
          onClick={removeJob}
          title={canRemove ? "Remove job from list" : "Cancel before removing"}
        >
          <RemoveJobIcon size={14} />
          <span>Remove</span>
        </button>
      </div>
    </article>
  );
}

function AssetLayerRow({
  asset,
  isSelected,
  onReveal,
  onSelect,
  onToggleHidden,
}: {
  asset: AssetItem;
  isSelected: boolean;
  onReveal: (assetId: string) => void;
  onSelect: (assetId: string, additive: boolean) => void;
  onToggleHidden: (assetId: string, hidden: boolean) => void;
}) {
  return (
    <div
      className={[
        "asset-layer-row",
        isSelected ? "asset-layer-row--selected" : "",
        asset.hidden ? "asset-layer-row--hidden" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        className="asset-layer-row__main"
        onClick={(event) => onSelect(asset.id, event.shiftKey)}
        title={asset.sourceName ?? asset.id}
      >
        <span className="asset-layer-row__thumb">
          <AssetThumbnail asset={asset} />
        </span>
        <span className="asset-layer-row__body">
          <strong>{asset.sourceName ?? asset.id}</strong>
          <span className="asset-layer-row__meta">
            <span>{asset.kind}</span>
            <span>{`${asset.width} x ${asset.height}`}</span>
            {asset.locked ? <span>locked</span> : null}
            {asset.hidden ? <span>hidden</span> : null}
          </span>
        </span>
      </button>

      <div className="asset-layer-row__actions">
        <button
          className="asset-layer-row__action"
          onClick={() => onToggleHidden(asset.id, !asset.hidden)}
          title={asset.hidden ? "Unhide item" : "Hide item"}
        >
          {asset.hidden ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
        </button>
        {asset.hidden ? (
          <button
            className="asset-layer-row__action asset-layer-row__action--text"
            onClick={() => onReveal(asset.id)}
            title="Reveal on canvas"
          >
            Reveal
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function InspectorPanel({
  recentProjects,
  onOpenRecentProject,
  onCancelGeneration,
  onRerunGeneration,
}: InspectorPanelProps) {
  const sortedAssets = useAppStore(selectSortedAssets);
  const generationJobs = useAppStore(selectSortedGenerationJobs);
  const selectedAssetIds = useAppStore((state) => state.project.selection.assetIds);
  const revealHiddenAsset = useAppStore((state) => state.revealHiddenAsset);
  const selectAsset = useAppStore((state) => state.selectAsset);
  const hideSelected = useAppStore((state) => state.hideSelected);
  const setAssetHidden = useAppStore((state) => state.setAssetHidden);
  const unhideAllHidden = useAppStore((state) => state.unhideAllHidden);
  const unhideSelected = useAppStore((state) => state.unhideSelected);
  const undoVisibilityChange = useAppStore((state) => state.undoVisibilityChange);
  const redoVisibilityChange = useAppStore((state) => state.redoVisibilityChange);
  const undoVisibilityCount = useAppStore((state) => state.visibilityHistory.undoStack.length);
  const redoVisibilityCount = useAppStore((state) => state.visibilityHistory.redoStack.length);

  const hiddenAssetCount = sortedAssets.filter((asset) => asset.hidden).length;

  return (
    <aside className="inspector-panel">
      <header className="inspector-panel__header inspector-panel__header--secondary">
        <div className="inspector-panel__title">
          <AssetsIcon size={16} />
          <h3>Layers</h3>
        </div>
        <strong className="inspector-panel__count">{sortedAssets.length}</strong>
      </header>

      <div className="inspector-panel__bulk-actions">
        <button className="inspector-panel__selection-action" disabled={selectedAssetIds.length === 0} onClick={hideSelected}>
          <EyeOffIcon size={14} />
          <span>Hide Selected</span>
        </button>
        <button className="inspector-panel__selection-action" disabled={selectedAssetIds.length === 0} onClick={unhideSelected}>
          <EyeIcon size={14} />
          <span>Unhide Selected</span>
        </button>
        <button className="inspector-panel__selection-action" disabled={hiddenAssetCount === 0} onClick={unhideAllHidden}>
          <EyeIcon size={14} />
          <span>Unhide All</span>
        </button>
        <button className="inspector-panel__selection-action" disabled={undoVisibilityCount === 0} onClick={undoVisibilityChange}>
          <CancelIcon size={14} />
          <span>Undo</span>
        </button>
        <button className="inspector-panel__selection-action" disabled={redoVisibilityCount === 0} onClick={redoVisibilityChange}>
          <RetryIcon size={14} />
          <span>Redo</span>
        </button>
      </div>

      {sortedAssets.length > 0 ? (
        <div className="asset-layer-list">
          {sortedAssets.map((asset) => (
            <AssetLayerRow
              key={asset.id}
              asset={asset}
              isSelected={selectedAssetIds.includes(asset.id)}
              onReveal={revealHiddenAsset}
              onSelect={(assetId, additive) => selectAsset(assetId, { additive })}
              onToggleHidden={setAssetHidden}
            />
          ))}
        </div>
      ) : (
        <div className="inspector-panel__empty inspector-panel__empty--compact">
          <AssetsIcon size={16} />
          <span>No canvas items yet</span>
        </div>
      )}

      <div className="inspector-panel__divider" />
      <header className="inspector-panel__header inspector-panel__header--secondary">
        <div className="inspector-panel__title">
          <RunningIcon size={16} />
          <h3>Jobs</h3>
        </div>
        <strong className="inspector-panel__count">{generationJobs.length}</strong>
      </header>

      {generationJobs.length > 0 ? (
        <div className="inspector-panel__jobs">
          {generationJobs.map((job) => (
            <GenerationJobCard
              key={job.id}
              jobId={job.id}
              onCancelGeneration={onCancelGeneration}
              onRerunGeneration={onRerunGeneration}
            />
          ))}
        </div>
      ) : (
        <div className="inspector-panel__empty inspector-panel__empty--compact">
          <SparklesIcon size={16} />
          <span>No generation jobs yet</span>
        </div>
      )}

      <div className="inspector-panel__divider" />
      <header className="inspector-panel__header inspector-panel__header--secondary">
        <div className="inspector-panel__title">
          <RecentIcon size={16} />
          <h3>Recent</h3>
        </div>
      </header>

      {recentProjects.length > 0 ? (
        <div className="inspector-panel__recent-list">
          {recentProjects.map((project) => (
            <button
              key={project.path}
              className="inspector-panel__recent-item"
              disabled={!project.exists}
              onClick={() => void onOpenRecentProject(project.path)}
              title={project.path}
            >
              <strong>{getProjectDisplayName(project.name, project.path)}</strong>
              <span>{project.path.split(/[\\/]/).at(-1)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="inspector-panel__empty inspector-panel__empty--compact">
          <RecentIcon size={16} />
          <span>No recent files</span>
        </div>
      )}
    </aside>
  );
}
