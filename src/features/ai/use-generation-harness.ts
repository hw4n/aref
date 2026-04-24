import { useCallback, useEffect } from "react";

import type { GenerationRequest } from "@/domain/jobs/types";
import { getGenerationProvider, listGenerationProviders } from "@/services/providers/provider-registry";
import { useAppStore } from "@/state/app-store";

const activeGenerationControllers = new Map<string, AbortController>();

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function getMissingReferenceIds(request: GenerationRequest, assets: Record<string, unknown>) {
  return request.selectedAssetIds.filter((assetId) => !assets[assetId]);
}

export function useGenerationHarness() {
  const project = useAppStore((state) => state.project);
  const cancelGenerationJobState = useAppStore((state) => state.cancelGenerationJob);
  const completeGenerationJob = useAppStore((state) => state.completeGenerationJob);
  const failGenerationJob = useAppStore((state) => state.failGenerationJob);
  const appendDiagnosticLog = useAppStore((state) => state.appendDiagnosticLog);
  const pushToast = useAppStore((state) => state.pushToast);
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
    async (request: GenerationRequest, retryJobId?: string) => {
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
        .filter(Boolean);

      const jobId = queueGenerationJob(request, retryJobId);
      appendDiagnosticLog({
        level: "info",
        scope: "generation",
        title: "Generation queued",
        message: `${provider.label} queued with ${request.selectedAssetIds.length} refs.`,
        details: `Model: ${request.model}. Prompt length: ${request.prompt.length}.`,
      });
      const controller = new AbortController();
      activeGenerationControllers.set(jobId, controller);

      try {
        const result = await provider.generateImages(
          {
            jobId,
            request,
            referenceAssets,
          },
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
        );

        const generatedAssetIds = completeGenerationJob(jobId, result);
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
      project.assets,
      pushToast,
      queueGenerationJob,
      runGenerationJob,
    ],
  );

  const submitGeneration = useCallback(
    async (request: GenerationRequest) => {
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

      return executeGeneration(
        {
          ...request,
          prompt: request.prompt.trim(),
          negativePrompt: request.negativePrompt?.trim() || undefined,
        },
      );
    },
    [appendDiagnosticLog, executeGeneration, pushToast],
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
