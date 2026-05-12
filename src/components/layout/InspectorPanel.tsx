import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AssetsIcon,
  CancelIcon,
  CodeIcon,
  CopyIcon,
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
import type { GenerationJob } from "@/domain/jobs/types";
import type { ProviderRequestLogEntry } from "@/domain/providers/types";
import { useProviderRequestLogs } from "@/features/ai/provider-logs/use-provider-request-logs";
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

function isAdditiveSelectionModifier(event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}

const PROVIDER_LOG_LIMIT = 100;

function formatPayloadForDisplay(payload: unknown) {
  if (payload === undefined) {
    return "";
  }

  try {
    const serialized = JSON.stringify(payload, null, 2);
    return serialized ?? String(payload);
  } catch {
    return String(payload);
  }
}

async function copyTextToClipboard(text: string) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Text clipboard is not available.");
  }

  await navigator.clipboard.writeText(text);
}

function createJobRequestPayload(job: GenerationJob) {
  return {
    jobId: job.id,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt ?? null,
    attemptCount: job.attemptCount,
    canvasPlacement: job.canvasPlacement,
    request: job.request,
  };
}

function createJobResponsePayload(job: GenerationJob) {
  if (job.status === "queued" || job.status === "running") {
    return null;
  }

  return {
    jobId: job.id,
    status: job.status,
    completedAt: job.completedAt ?? null,
    cancelledAt: job.cancelledAt ?? null,
    error: job.error ?? null,
    providerRequestId: job.providerRequestId ?? null,
    providerMode: job.providerMode ?? null,
    resultAssetIds: job.resultAssetIds,
  };
}

function providerLogTimestamp(entry: ProviderRequestLogEntry) {
  const timestamp = entry.timestamp ? new Date(entry.timestamp).getTime() : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function findProviderLogForJob(job: GenerationJob, entries: ProviderRequestLogEntry[]) {
  return (
    entries.find((entry) => entry.provider === job.request.provider && entry.clientRequestId === job.id)
    ?? entries.find((entry) => entry.clientRequestId === job.id)
    ?? null
  );
}

function GenerationJobCard({
  jobId,
  providerLog,
  onReloadProviderLogs,
  onCancelGeneration,
  onRerunGeneration,
}: {
  jobId: string;
  providerLog: ProviderRequestLogEntry | null;
  onReloadProviderLogs: () => void;
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
  const canReuseReferences = missingReferenceCount === 0;
  const resultCount = job.resultAssetIds.length;
  const reuseJobRequest = () => {
    setGenerationDraft({
      prompt: job.request.prompt,
      negativePrompt: job.request.negativePrompt ?? "",
      provider: job.request.provider,
      model: job.request.model,
      settings: job.request.settings,
      pinnedAssetIds: canReuseReferences ? job.request.selectedAssetIds : [],
      isExplicitlyOpened: true,
    });

    pushToast({
      kind: "success",
      title: "Job reused",
      description: canReuseReferences
        ? `${job.request.selectedAssetIds.length} reference${job.request.selectedAssetIds.length === 1 ? "" : "s"} loaded with the prompt.`
        : "Only the prompt was loaded because original references are missing.",
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
  const fallbackRequestPayload = createJobRequestPayload(job);
  const fallbackResponsePayload = createJobResponsePayload(job);
  const requestPayload = providerLog?.requestPayload ?? fallbackRequestPayload;
  const responsePayload = providerLog?.responsePayload ?? fallbackResponsePayload;
  const requestPayloadText = formatPayloadForDisplay(requestPayload);
  const responsePayloadText = responsePayload ? formatPayloadForDisplay(responsePayload) : "";
  const providerLogLabel = providerLog ? "Provider log" : "Job snapshot";
  const copyPayload = async (label: "request" | "response", text: string) => {
    try {
      await copyTextToClipboard(text);
      pushToast({
        kind: "success",
        title: "Payload copied",
        description: `${label === "request" ? "Request" : "Response"} payload is on the clipboard.`,
      });
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Could not copy the payload.",
      });
    }
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
        <span>{job.request.settings.size}</span>
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

      <details className="generation-job-card__payload">
        <summary className="generation-job-card__payload-summary">
          <span>
            <CodeIcon size={14} />
            <strong>Payloads</strong>
          </span>
          <span>{providerLogLabel}</span>
        </summary>

        <div className="generation-job-card__payload-body">
          <section className="generation-job-card__payload-section">
            <header className="generation-job-card__payload-header">
              <strong>Request</strong>
              <button
                className="generation-job-card__payload-action"
                onClick={() => void copyPayload("request", requestPayloadText)}
                title="Copy request payload"
              >
                <CopyIcon size={13} />
                <span>Copy req</span>
              </button>
            </header>
            <pre className="generation-job-card__payload-preview">{requestPayloadText}</pre>
          </section>

          <section className="generation-job-card__payload-section">
            <header className="generation-job-card__payload-header">
              <strong>Response</strong>
              <span className="generation-job-card__payload-actions">
                <button
                  className="generation-job-card__payload-action"
                  onClick={onReloadProviderLogs}
                  title="Refresh provider payload logs"
                >
                  <RetryIcon size={13} />
                  <span>Refresh</span>
                </button>
                <button
                  className="generation-job-card__payload-action"
                  disabled={!responsePayload}
                  onClick={() => void copyPayload("response", responsePayloadText)}
                  title={responsePayload ? "Copy response payload" : "Response payload is not available yet"}
                >
                  <CopyIcon size={13} />
                  <span>Copy res</span>
                </button>
              </span>
            </header>
            {responsePayload ? (
              <pre className="generation-job-card__payload-preview">{responsePayloadText}</pre>
            ) : (
              <p className="generation-job-card__payload-empty">Response payload is not available yet.</p>
            )}
          </section>
        </div>
      </details>

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
        <button
          className="generation-job-card__action"
          onClick={reuseJobRequest}
          title={canReuseReferences ? "Reuse prompt, refs, and settings" : "Reuse prompt only because references are missing"}
        >
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
        onClick={(event) => onSelect(asset.id, isAdditiveSelectionModifier(event))}
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
  const [activeTab, setActiveTab] = useState<"layers" | "jobs" | "recent">("layers");
  const [assetFilter, setAssetFilter] = useState<"all" | "imported" | "generated" | "text">("all");
  const sortedAssets = useAppStore(selectSortedAssets);
  const generationJobs = useAppStore(selectSortedGenerationJobs);
  const openAiProviderLogs = useProviderRequestLogs("openai", PROVIDER_LOG_LIMIT);
  const ima2SidecarProviderLogs = useProviderRequestLogs("ima2-sidecar", PROVIDER_LOG_LIMIT);
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
  const providerLogEntries = useMemo(
    () =>
      [...openAiProviderLogs.entries, ...ima2SidecarProviderLogs.entries].sort(
        (left, right) => providerLogTimestamp(right) - providerLogTimestamp(left),
      ),
    [ima2SidecarProviderLogs.entries, openAiProviderLogs.entries],
  );
  const reloadProviderLogs = useCallback(() => {
    void openAiProviderLogs.reload();
    void ima2SidecarProviderLogs.reload();
  }, [ima2SidecarProviderLogs.reload, openAiProviderLogs.reload]);
  const generationJobLogRefreshKey = useMemo(
    () =>
      generationJobs
        .map(
          (job) =>
            `${job.id}:${job.status}:${job.startedAt ?? ""}:${job.completedAt ?? ""}:${job.cancelledAt ?? ""}:${job.error ?? ""}`,
        )
        .join("|"),
    [generationJobs],
  );

  useEffect(() => {
    reloadProviderLogs();
  }, [generationJobLogRefreshKey, reloadProviderLogs]);

  const filteredAssets = useMemo(
    () =>
      sortedAssets.filter((asset) => {
        if (assetFilter === "all") {
          return true;
        }

        return asset.kind === assetFilter;
      }),
    [assetFilter, sortedAssets],
  );

  return (
    <aside className="inspector-panel">
      <header className="inspector-panel__tabs inspector-panel__tabs--triple" aria-label="Inspector sections">
        <button
          className={`inspector-panel__tab ${activeTab === "layers" ? "inspector-panel__tab--active" : ""}`}
          onClick={() => setActiveTab("layers")}
        >
          <span>Layers</span>
        </button>
        <button
          className={`inspector-panel__tab ${activeTab === "jobs" ? "inspector-panel__tab--active" : ""}`}
          onClick={() => setActiveTab("jobs")}
        >
          <span>Jobs</span>
        </button>
        <button
          className={`inspector-panel__tab ${activeTab === "recent" ? "inspector-panel__tab--active" : ""}`}
          onClick={() => setActiveTab("recent")}
        >
          <span>Recent</span>
        </button>
      </header>

      {activeTab === "layers" ? (
        <section key="layers" className="inspector-panel__section">
          <header className="inspector-panel__header inspector-panel__header--secondary">
            <div className="inspector-panel__title">
              <AssetsIcon size={16} />
              <h3>Layers</h3>
            </div>
            <strong className="inspector-panel__count">{sortedAssets.length}</strong>
          </header>

          <div className="inspector-panel__filter-tabs">
            {(["all", "imported", "generated", "text"] as const).map((filter) => (
              <button
                key={filter}
                className={`inspector-panel__filter-tab ${assetFilter === filter ? "inspector-panel__filter-tab--active" : ""}`}
                onClick={() => setAssetFilter(filter)}
              >
                <span>{filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1)}</span>
              </button>
            ))}
          </div>

          {filteredAssets.length > 0 ? (
            <div className="asset-layer-list">
              {filteredAssets.map((asset) => (
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

          <div className="inspector-panel__bulk-actions inspector-panel__bulk-actions--compact">
            <button className="inspector-panel__selection-action" disabled={selectedAssetIds.length === 0} onClick={hideSelected}>
              <EyeOffIcon size={14} />
              <span>Hide</span>
            </button>
            <button className="inspector-panel__selection-action" disabled={selectedAssetIds.length === 0} onClick={unhideSelected}>
              <EyeIcon size={14} />
              <span>Unhide</span>
            </button>
            <button className="inspector-panel__selection-action" disabled={hiddenAssetCount === 0} onClick={unhideAllHidden}>
              <EyeIcon size={14} />
              <span>All</span>
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
        </section>
      ) : null}

      {activeTab === "jobs" ? (
        <section key="jobs" className="inspector-panel__section">
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
                  providerLog={findProviderLogForJob(job, providerLogEntries)}
                  onReloadProviderLogs={reloadProviderLogs}
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
        </section>
      ) : null}

      {activeTab === "recent" ? (
        <section key="recent" className="inspector-panel__section">
          <header className="inspector-panel__header inspector-panel__header--secondary">
            <div className="inspector-panel__title">
              <RecentIcon size={16} />
              <h3>Recent</h3>
            </div>
            <strong className="inspector-panel__count">{recentProjects.length}</strong>
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
        </section>
      ) : null}
    </aside>
  );
}
