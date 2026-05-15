import { useCallback, useEffect } from "react";

import { isImageAsset } from "@/domain/assets/types";
import {
  computeBulkGenerationPlacements,
  findAvailableGenerationPlacement,
  getViewportCenter,
} from "@/domain/jobs/generation-layout";
import {
  GENERATION_BULK_GRID_LIMIT,
  type GenerationBulkGrid,
  type GenerationRequest,
} from "@/domain/jobs/types";
import type { Point } from "@/domain/shared/types";
import { getGenerationProvider, listGenerationProviders } from "@/services/providers/provider-registry";
import {
  getGenerationConcurrencyPlan,
  runGenerationWithConcurrency,
} from "@/services/providers/generation-concurrency";
import { useAppStore } from "@/state/app-store";

const activeGenerationControllers = new Map<string, AbortController>();

interface UseGenerationHarnessOptions {
  onGenerationCompleted?: () => Promise<unknown> | unknown;
}

interface ExecuteGenerationOptions {
  retryJobId?: string;
  canvasPlacement?: Point;
}

interface SubmitGenerationOptions {
  bulkGrid?: GenerationBulkGrid;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getMissingReferenceIds(request: GenerationRequest, assets: Record<string, unknown>) {
  return request.selectedAssetIds.filter((assetId) => !assets[assetId]);
}

export function useGenerationHarness(options: UseGenerationHarnessOptions = {}) {
  const { onGenerationCompleted } = options;
  const project = useAppStore((state) => state.project);
  const cancelGenerationJobState = useAppStore((state) => state.cancelGenerationJob);
  const completeGenerationJob = useAppStore((state) => state.completeGenerationJob);
  const failGenerationJob = useAppStore((state) => state.failGenerationJob);
  const appendDiagnosticLog = useAppStore((state) => state.appendDiagnosticLog);
  const pushToast = useAppStore((state) => state.pushToast);
  const generationConcurrencyMode = useAppStore(
    (state) => state.uiPreferences.generationConcurrencyMode,
  );
  const queueGenerationJob = useAppStore((state) => state.queueGenerationJob);
  const runGenerationJob = useAppStore((state) => state.runGenerationJob);

  useEffect(() => {
    return () => {
      for (const controller of activeGenerationControllers.values()) {
        controller.abort();
      }

      activeGenerationControllers.clear();
    };
  }, []);

  const executeGeneration = useCallback(
    async (request: GenerationRequest, executeOptions: ExecuteGenerationOptions = {}) => {
      const provider = getGenerationProvider(request.provider);

      if (!provider) {
        pushToast({
          kind: "error",
          title: "Unknown provider",
          description: `No adapter is registered for ${request.provider}.`,
        });
        return null;
      }

      const missingReferenceIds = getMissingReferenceIds(request, project.assets);
      if (missingReferenceIds.length > 0) {
        const description = `${missingReferenceIds.length} original reference${missingReferenceIds.length === 1 ? "" : "s"} no longer exist.`;
        appendDiagnosticLog({
          level: "warning",
          scope: "generation",
          title: "Generation blocked",
          message: "Generation cannot rerun because original references are missing.",
          details: description,
        });
        pushToast({
          kind: "error",
          title: "References missing",
          description,
        });
        return null;
      }

      const referenceAssets = request.selectedAssetIds
        .map((assetId) => project.assets[assetId])
        .filter((asset) => Boolean(asset) && isImageAsset(asset));
      const imageReferenceIds = referenceAssets.map((asset) => asset.id);
      const imageRequest = {
        ...request,
        selectedAssetIds: imageReferenceIds,
      };

      const jobId = queueGenerationJob(imageRequest, {
        jobId: executeOptions.retryJobId,
        canvasPlacement: executeOptions.canvasPlacement,
      });
      appendDiagnosticLog({
        level: "info",
        scope: "generation",
        title: "Generation queued",
        message: `${provider.label} queued with ${imageReferenceIds.length} refs.`,
        details: `Model: ${request.model}. Prompt length: ${request.prompt.length}.`,
      });
      const controller = new AbortController();
      activeGenerationControllers.set(jobId, controller);

      try {
        const invocation = {
          jobId,
          request: imageRequest,
          referenceAssets,
          concurrencyMode: generationConcurrencyMode,
        };
        const concurrencyPlan = getGenerationConcurrencyPlan(invocation);
        appendDiagnosticLog({
          level: "info",
          scope: "generation",
          title: "Generation scheduled",
          message: `${provider.label} is using ${concurrencyPlan.permits}/${concurrencyPlan.capacity} generation slots.`,
          details:
            generationConcurrencyMode === "aggressive"
              ? "Aggressive concurrency is enabled; heavy jobs do not reserve extra capacity."
              : concurrencyPlan.isHeavy
                ? "Large or ref-heavy jobs reserve extra capacity."
                : null,
        });

        const result = await runGenerationWithConcurrency(
          invocation,
          controller.signal,
          () =>
            provider.generateImages(
              invocation,
              {
                signal: controller.signal,
                onStatusChange: () => {
                  runGenerationJob(jobId);
                  appendDiagnosticLog({
                    level: "info",
                    scope: "generation",
                    title: "Generation running",
                    message: `${provider.label} is generating images for job ${jobId}.`,
                  });
                },
              },
            ),
        );

        const generatedAssetIds = completeGenerationJob(jobId, result);
        await onGenerationCompleted?.();
        appendDiagnosticLog({
          level: "info",
          scope: "generation",
          title: "Generation succeeded",
          message: `${provider.label} completed with ${generatedAssetIds.length} result${generatedAssetIds.length === 1 ? "" : "s"}.`,
          details: result.requestId ? `Provider request: ${result.requestId}.` : null,
        });
        pushToast({
          kind: "success",
          title: "Generation finished",
          description: `${generatedAssetIds.length} ${provider.label} image${generatedAssetIds.length === 1 ? "" : "s"} added to the canvas.`,
        });
        return jobId;
      } catch (error) {
        if (isAbortError(error)) {
          cancelGenerationJobState(jobId);
          appendDiagnosticLog({
            level: "warning",
            scope: "generation",
            title: "Generation cancelled",
            message: `${provider.label} generation was cancelled.`,
          });
          pushToast({
            kind: "info",
            title: "Generation cancelled",
            description: `${provider.label} generation was cancelled.`,
          });
          return jobId;
        }

        const message = error instanceof Error ? error.message : "Mock generation failed.";
        failGenerationJob(jobId, message);
        appendDiagnosticLog({
          level: "error",
          scope: "generation",
          title: "Generation failed",
          message: `${provider.label} generation failed.`,
          details: message,
        });
        pushToast({
          kind: "error",
          title: "Generation failed",
          description: message,
        });
        return jobId;
      } finally {
        activeGenerationControllers.delete(jobId);
      }
    },
    [
      appendDiagnosticLog,
      cancelGenerationJobState,
      completeGenerationJob,
      failGenerationJob,
      generationConcurrencyMode,
      project.assets,
      pushToast,
      queueGenerationJob,
      runGenerationJob,
      onGenerationCompleted,
    ],
  );

  const submitGeneration = useCallback(
    async (request: GenerationRequest, submitOptions: SubmitGenerationOptions = {}) => {
      if (request.prompt.trim().length === 0) {
        appendDiagnosticLog({
          level: "warning",
          scope: "generation",
          title: "Generation blocked",
          message: "Prompt submission was blocked because the prompt was empty.",
        });
        pushToast({
          kind: "error",
          title: "Prompt required",
          description: "Enter a prompt before submitting a generation job.",
        });
        return null;
      }

      const cleanRequest = {
        ...request,
        prompt: request.prompt.trim(),
        negativePrompt: request.negativePrompt?.trim() || undefined,
      };
      const bulkGrid = submitOptions.bulkGrid ?? { columns: 1, rows: 1 };
      const bulkColumns = Math.max(
        1,
        Math.min(GENERATION_BULK_GRID_LIMIT, Math.round(bulkGrid.columns)),
      );
      const bulkRows = Math.max(
        1,
        Math.min(GENERATION_BULK_GRID_LIMIT, Math.round(bulkGrid.rows)),
      );
      const bulkJobCount = bulkColumns * bulkRows;

      if (bulkJobCount <= 1) {
        return executeGeneration(cleanRequest);
      }

      const activeJobs = Object.values(project.jobs).filter(
        (job) => job.status === "queued" || job.status === "running",
      );
      const origin = findAvailableGenerationPlacement(
        cleanRequest,
        activeJobs,
        getViewportCenter(project.camera),
      );
      const placements = computeBulkGenerationPlacements(
        cleanRequest,
        bulkColumns,
        bulkRows,
        origin,
      );

      appendDiagnosticLog({
        level: "info",
        scope: "generation",
        title: "Bulk generation queued",
        message: `${bulkJobCount} independent jobs queued in a ${bulkColumns} x ${bulkRows} grid.`,
        details: `Each job requests ${cleanRequest.settings.imageCount} output${cleanRequest.settings.imageCount === 1 ? "" : "s"}.`,
      });

      void Promise.all(
        placements.map((canvasPlacement) =>
          executeGeneration(cleanRequest, { canvasPlacement }),
        ),
      );

      return null;
    },
    [appendDiagnosticLog, executeGeneration, project.camera, project.jobs, pushToast],
  );

  const cancelGeneration = useCallback(
    (jobId: string) => {
      const controller = activeGenerationControllers.get(jobId);

      if (controller) {
        controller.abort();
        return;
      }

      cancelGenerationJobState(jobId);
      appendDiagnosticLog({
        level: "warning",
        scope: "generation",
        title: "Generation cancelled",
        message: `Generation ${jobId} was cancelled after it had already stopped running.`,
      });
    },
    [appendDiagnosticLog, cancelGenerationJobState],
  );

  const rerunGeneration = useCallback(
    async (jobId: string) => {
      const job = project.jobs[jobId];

      if (!job) {
        pushToast({
          kind: "error",
          title: "Job not found",
          description: "The selected generation job no longer exists.",
        });
        return null;
      }

      if (job.status === "queued" || job.status === "running") {
        pushToast({
          kind: "info",
          title: "Job already running",
          description: "Cancel the active job before rerunning it.",
        });
        return null;
      }

      return executeGeneration(job.request);
    },
    [executeGeneration, project.jobs, pushToast],
  );

  return {
    providers: listGenerationProviders(),
    submitGeneration,
    cancelGeneration,
    rerunGeneration,
  };
}
