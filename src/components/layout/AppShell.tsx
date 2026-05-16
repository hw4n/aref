import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  FullscreenIcon,
  ImportIcon,
  NewProjectIcon,
  OpenProjectIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PhotoViewerIcon,
  SaveAsIcon,
  SaveIcon,
  SourceIcon,
} from "@/components/icons/ui-icons";
import { DeveloperLogDrawer } from "@/components/layout/DeveloperLogDrawer";
import { InspectorPanel } from "@/components/layout/InspectorPanel";
import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { PhotoViewerDialog } from "@/components/layout/PhotoViewerDialog";
import { ToastViewport } from "@/components/layout/ToastViewport";
import { ToolbarRail } from "@/components/layout/ToolbarRail";
import { isImageAsset } from "@/domain/assets/types";
import { ContextualGenerationSheet } from "@/features/ai/components/ContextualGenerationSheet";
import { shouldShowContextualGenerationSheet } from "@/features/ai/contextual-sheet";
import { useGenerationHarness } from "@/features/ai/use-generation-harness";
import { loadImageFiles, loadImagePaths } from "@/features/import/utils/load-image-files";
import {
  chooseImageExportDirectory,
  exportImageAssetsToDirectory,
  importChatGptShareImages,
} from "@/features/project/persistence/project-io";
import { useProjectPersistence } from "@/features/project/persistence/use-project-persistence";
import { getProjectDisplayName } from "@/features/project/persistence/project-title";
import { useWindowImageDrop } from "@/features/import/hooks/use-window-image-drop";
import { useWindowImagePaste } from "@/features/import/hooks/use-window-image-paste";
import { CanvasStage } from "@/features/canvas/adapters/react-konva/CanvasStage";
import { useProviderManagement } from "@/features/providers/use-provider-management";
import { useGenerationDraftPersistence } from "@/features/settings/use-generation-draft-persistence";
import { useUiPreferencesPersistence } from "@/features/settings/use-ui-preferences-persistence";
import { useAppStore } from "@/state/app-store";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

const LEFT_PANEL_WIDTH = 320;
const DEFAULT_INSPECTOR_WIDTH = 320;
const DEFAULT_GENERATION_SHEET_WIDTH = 360;
const MIN_INSPECTOR_WIDTH = 280;
const MAX_INSPECTOR_WIDTH = 560;
const MIN_GENERATION_SHEET_WIDTH = 320;
const MAX_GENERATION_SHEET_WIDTH = 520;
const MIN_CANVAS_WIDTH = 520;

function clampOverlayWidth(
  width: number,
  shellWidth: number,
  {
    leftReservedWidth,
    rightReservedWidth,
    minWidth,
    maxWidth,
  }: {
    leftReservedWidth: number;
    rightReservedWidth: number;
    minWidth: number;
    maxWidth: number;
  },
) {
  const viewportMaxWidth = Math.max(240, shellWidth - 24);
  const maxAllowedWidth = Math.min(
    maxWidth,
    viewportMaxWidth,
    Math.max(minWidth, shellWidth - leftReservedWidth - rightReservedWidth - MIN_CANVAS_WIDTH),
  );

  return Math.min(Math.max(width, Math.min(minWidth, viewportMaxWidth)), maxAllowedWidth);
}

export function AppShell() {
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatGptUrlInputRef = useRef<HTMLInputElement | null>(null);
  const settingsPaneRef = useRef<HTMLDivElement | null>(null);
  const resizePointerIdRef = useRef<number | null>(null);
  const [resizingPane, setResizingPane] = useState<"inspector" | "generation" | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isChatGptImporting, setIsChatGptImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [chatGptImportDialogOpen, setChatGptImportDialogOpen] = useState(false);
  const [chatGptShareUrl, setChatGptShareUrl] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [photoViewerAssetId, setPhotoViewerAssetId] = useState<string | null>(null);
  const [selectedPhotoAssetIds, setSelectedPhotoAssetIds] = useState<string[]>([]);
  const [isPhotoExporting, setIsPhotoExporting] = useState(false);
  const importAssets = useAppStore((state) => state.importAssets);
  const projectName = useAppStore((state) => state.project.name);
  const projectAssets = useAppStore((state) => state.project.assets);
  const selectedAssetIds = useAppStore((state) => state.project.selection.assetIds);
  const activeProviderId = useAppStore((state) => state.generationDraft.provider);
  const areLogsVisible = useAppStore((state) => state.uiPreferences.developerMode && state.uiPreferences.logsVisible);
  const leftRailOpen = useAppStore((state) => state.uiPreferences.leftRailOpen);
  const settingsOpen = useAppStore((state) => state.uiPreferences.settingsOpen);
  const inspectorOpen = useAppStore((state) => state.uiPreferences.inspectorOpen);
  const inspectorWidth = useAppStore((state) => state.uiPreferences.inspectorWidth);
  const generationSheetWidth = useAppStore((state) => state.uiPreferences.generationSheetWidth);
  const referenceSelectionCount = useAppStore((state) =>
    state.project.selection.assetIds.filter((assetId) => {
      const asset = state.project.assets[assetId];
      return asset?.kind === "imported" || asset?.kind === "generated";
    }).length,
  );
  const isGenerationSheetExplicitlyOpened = useAppStore((state) => state.generationDraft.isExplicitlyOpened);
  const toggleLeftSidebar = useAppStore((state) => state.toggleLeftSidebar);
  const toggleInspector = useAppStore((state) => state.toggleInspector);
  const setInspectorWidth = useAppStore((state) => state.setInspectorWidth);
  const setGenerationSheetWidth = useAppStore((state) => state.setGenerationSheetWidth);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const pushToast = useAppStore((state) => state.pushToast);
  useUiPreferencesPersistence();
  useGenerationDraftPersistence();
  const {
    createNewProject,
    currentProjectPath,
    error: persistenceError,
    isDesktopPersistenceAvailable,
    openProject,
    openRecentProject,
    recentProjects,
    saveAutosaveNow,
    saveProject,
    saveProjectAs,
    status: persistenceStatus,
  } = useProjectPersistence();
  const { submitGeneration, cancelGeneration, rerunGeneration } = useGenerationHarness({
    onGenerationCompleted: saveAutosaveNow,
  });
  const providerManagement = useProviderManagement();
  const showGenerationSheet = shouldShowContextualGenerationSheet(referenceSelectionCount, isGenerationSheetExplicitlyOpened);
  const photoAssets = useMemo(
    () =>
      Object.values(projectAssets)
        .filter(isImageAsset)
        .sort((left, right) => left.zIndex - right.zIndex),
    [projectAssets],
  );
  const photoViewerIndex = photoViewerAssetId
    ? photoAssets.findIndex((asset) => asset.id === photoViewerAssetId)
    : -1;
  const photoViewerAsset = photoViewerIndex >= 0 ? photoAssets[photoViewerIndex] : null;
  const selectedPhotoAssets = useMemo(
    () => selectedPhotoAssetIds
      .map((assetId) => photoAssets.find((asset) => asset.id === assetId))
      .filter((asset): asset is (typeof photoAssets)[number] => Boolean(asset)),
    [photoAssets, selectedPhotoAssetIds],
  );

  const handleImportFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      setIsImporting(true);
      setImportError(null);

      try {
        const drafts = await loadImageFiles(files);
        importAssets(drafts);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : "Failed to import image files.");
      } finally {
        setIsImporting(false);
      }
    },
    [importAssets],
  );

  const handleImportPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }

      setIsImporting(true);
      setImportError(null);

      try {
        const drafts = await loadImagePaths(paths);
        importAssets(drafts);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : "Failed to import dropped image files.");
      } finally {
        setIsImporting(false);
      }
    },
    [importAssets],
  );

  const isDropActive = useWindowImageDrop(handleImportFiles, handleImportPaths);
  useWindowImagePaste(handleImportFiles);

  const openImportDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const openChatGptImportDialog = useCallback(() => {
    setChatGptShareUrl("");
    setImportError(null);
    setChatGptImportDialogOpen(true);
  }, []);

  const openPhotoViewer = useCallback(() => {
    const selectedPhotoAssetId = selectedAssetIds.find((assetId) =>
      photoAssets.some((asset) => asset.id === assetId),
    );

    setPhotoViewerAssetId(selectedPhotoAssetId ?? photoAssets[0]?.id ?? null);
  }, [photoAssets, selectedAssetIds]);

  const showPreviousPhoto = useCallback(() => {
    setPhotoViewerAssetId((currentAssetId) => {
      const currentIndex = photoAssets.findIndex((asset) => asset.id === currentAssetId);

      if (currentIndex <= 0) {
        return currentAssetId;
      }

      return photoAssets[currentIndex - 1]?.id ?? currentAssetId;
    });
  }, [photoAssets]);

  const showNextPhoto = useCallback(() => {
    setPhotoViewerAssetId((currentAssetId) => {
      const currentIndex = photoAssets.findIndex((asset) => asset.id === currentAssetId);

      if (currentIndex < 0 || currentIndex >= photoAssets.length - 1) {
        return currentAssetId;
      }

      return photoAssets[currentIndex + 1]?.id ?? currentAssetId;
    });
  }, [photoAssets]);

  const togglePhotoSelection = useCallback((assetId: string) => {
    setSelectedPhotoAssetIds((currentIds) =>
      currentIds.includes(assetId)
        ? currentIds.filter((id) => id !== assetId)
        : [...currentIds, assetId],
    );
  }, []);

  const selectPhotoByIndex = useCallback((index: number) => {
    setPhotoViewerAssetId(photoAssets[index]?.id ?? null);
  }, [photoAssets]);

  const exportSelectedPhotos = useCallback(async () => {
    if (selectedPhotoAssets.length === 0 || isPhotoExporting) {
      return;
    }

    try {
      const directory = await chooseImageExportDirectory();

      if (!directory) {
        return;
      }

      setIsPhotoExporting(true);
      const result = await exportImageAssetsToDirectory(selectedPhotoAssets, directory);
      pushToast({
        kind: "success",
        title: "Images exported",
        description: `${result.exportedCount} image${result.exportedCount === 1 ? "" : "s"} written to ${result.directory}.`,
      });
    } catch (error) {
      pushToast({
        kind: "error",
        title: "Export failed",
        description: error instanceof Error ? error.message : "Could not export selected images.",
      });
    } finally {
      setIsPhotoExporting(false);
    }
  }, [isPhotoExporting, pushToast, selectedPhotoAssets]);

  const handleImportFromChatGpt = useCallback(async () => {
    const shareUrl = chatGptShareUrl.trim();

    if (!shareUrl) {
      setImportError("Paste a ChatGPT share link.");
      return;
    }

    setIsImporting(true);
    setIsChatGptImporting(true);
    setImportError(null);

    try {
      const result = await importChatGptShareImages(shareUrl);
      importAssets(result.drafts);
      setChatGptImportDialogOpen(false);
      setChatGptShareUrl("");
      pushToast({
        kind: result.skippedCount > 0 ? "info" : "success",
        title: "ChatGPT images imported",
        description: result.skippedCount > 0
          ? `${result.drafts.length} imported, ${result.skippedCount} unavailable in the shared link.`
          : `${result.drafts.length} imported.`,
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to import images from ChatGPT.");
    } finally {
      setIsImporting(false);
      setIsChatGptImporting(false);
    }
  }, [chatGptShareUrl, importAssets, pushToast]);

  useEffect(() => {
    if (!chatGptImportDialogOpen) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      chatGptUrlInputRef.current?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && !isChatGptImporting) {
        setChatGptImportDialogOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [chatGptImportDialogOpen, isChatGptImporting]);

  useEffect(() => {
    if (!photoViewerAssetId) {
      return;
    }

    if (photoAssets.length === 0) {
      setPhotoViewerAssetId(null);
      return;
    }

    if (!photoAssets.some((asset) => asset.id === photoViewerAssetId)) {
      setPhotoViewerAssetId(photoAssets[0]?.id ?? null);
    }
  }, [photoAssets, photoViewerAssetId]);

  useEffect(() => {
    setSelectedPhotoAssetIds((currentIds) => {
      const nextIds = currentIds.filter((assetId) => photoAssets.some((asset) => asset.id === assetId));

      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [photoAssets]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch((error) => {
        pushToast({
          kind: "error",
          title: "Fullscreen failed",
          description: error instanceof Error ? error.message : "Could not exit fullscreen.",
        });
      });
      return;
    }

    const target = appShellRef.current ?? document.documentElement;
    if (!target.requestFullscreen) {
      pushToast({
        kind: "error",
        title: "Fullscreen unavailable",
        description: "This environment does not expose the fullscreen API.",
      });
      return;
    }

    void target.requestFullscreen().catch((error) => {
      pushToast({
        kind: "error",
        title: "Fullscreen failed",
        description: error instanceof Error ? error.message : "Could not enter fullscreen.",
      });
    });
  }, [pushToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "KeyS") {
        event.preventDefault();
        void saveProjectAs();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.code === "KeyS") {
        event.preventDefault();
        void saveProject();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.code === "KeyO") {
        event.preventDefault();
        void openProject();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.code === "KeyN") {
        event.preventDefault();
        createNewProject();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.code === "KeyI") {
        event.preventDefault();
        openImportDialog();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createNewProject, openImportDialog, openProject, saveProject, saveProjectAs]);

  const workspaceClassName = useMemo(
    () => [
      "workspace",
      isDropActive ? "workspace--drop-active" : "",
    ].filter(Boolean).join(" "),
    [isDropActive],
  );
  const workspaceBodyClassName = useMemo(
    () => [
      "workspace__body",
      leftRailOpen ? "" : "workspace__body--rail-hidden",
    ].filter(Boolean).join(" "),
    [leftRailOpen],
  );
  const appShellClassName = useMemo(
    () => (resizingPane ? "app-shell app-shell--resizing" : "app-shell"),
    [resizingPane],
  );
  const displayProjectName = useMemo(
    () => getProjectDisplayName(projectName, currentProjectPath),
    [currentProjectPath, projectName],
  );
  const persistenceStatusLabel = useMemo(() => {
    switch (persistenceStatus) {
      case "idle":
      case "saved":
        return "Saved";
      case "modified":
        return "Unsaved";
      case "saving":
        return "Saving";
      case "loading":
        return "Loading";
      case "error":
        return "Save failed";
    }
  }, [persistenceStatus]);
  const workspaceError = importError ?? persistenceError;
  const projectActionItems = [
    {
      label: "New",
      icon: <NewProjectIcon size={15} />,
      onClick: createNewProject,
      disabled: false,
    },
    {
      label: "Open",
      icon: <OpenProjectIcon size={15} />,
      onClick: () => void openProject(),
      disabled: !isDesktopPersistenceAvailable,
    },
    {
      label: "Save",
      icon: <SaveIcon size={15} />,
      onClick: () => void saveProject(),
      disabled: !isDesktopPersistenceAvailable,
    },
    {
      label: "Save As",
      icon: <SaveAsIcon size={15} />,
      onClick: () => void saveProjectAs(),
      disabled: !isDesktopPersistenceAvailable,
    },
    {
      label: isImporting ? "Importing" : "Import",
      icon: <ImportIcon size={15} />,
      onClick: openImportDialog,
      disabled: isImporting,
    },
    {
      label: isChatGptImporting ? "Importing" : "ChatGPT",
      icon: <SourceIcon size={15} />,
      onClick: openChatGptImportDialog,
      disabled: !isDesktopPersistenceAvailable || isImporting,
    },
    {
      label: "Photos",
      icon: <PhotoViewerIcon size={15} />,
      onClick: openPhotoViewer,
      disabled: photoAssets.length === 0,
    },
  ];

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (settingsPaneRef.current?.contains(target)) {
        return;
      }

      setSettingsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [setSettingsOpen, settingsOpen]);

  const updateInspectorWidthFromClientX = useCallback((clientX: number) => {
    const shellBounds = appShellRef.current?.getBoundingClientRect();

    if (!shellBounds) {
      return;
    }

    const nextWidth = clampOverlayWidth(shellBounds.right - clientX, shellBounds.width, {
      leftReservedWidth: 0,
      rightReservedWidth: showGenerationSheet ? generationSheetWidth : 0,
      minWidth: MIN_INSPECTOR_WIDTH,
      maxWidth: MAX_INSPECTOR_WIDTH,
    });
    if (nextWidth !== inspectorWidth) {
      setInspectorWidth(nextWidth);
    }
  }, [generationSheetWidth, inspectorWidth, setInspectorWidth, showGenerationSheet]);

  const updateGenerationSheetWidthFromClientX = useCallback((clientX: number) => {
    const shellBounds = appShellRef.current?.getBoundingClientRect();

    if (!shellBounds) {
      return;
    }

    const rightEdge = shellBounds.right - (inspectorOpen ? inspectorWidth : 0);
    const nextWidth = clampOverlayWidth(rightEdge - clientX, shellBounds.width, {
      leftReservedWidth: 0,
      rightReservedWidth: inspectorOpen ? inspectorWidth : 0,
      minWidth: MIN_GENERATION_SHEET_WIDTH,
      maxWidth: MAX_GENERATION_SHEET_WIDTH,
    });
    if (nextWidth !== generationSheetWidth) {
      setGenerationSheetWidth(nextWidth);
    }
  }, [generationSheetWidth, inspectorOpen, inspectorWidth, setGenerationSheetWidth]);

  useEffect(() => {
    const clampToViewport = () => {
      const shellWidth = appShellRef.current?.getBoundingClientRect().width ?? window.innerWidth;
      const nextInspectorWidth = clampOverlayWidth(inspectorWidth, shellWidth, {
        leftReservedWidth: 0,
        rightReservedWidth: showGenerationSheet ? generationSheetWidth : 0,
        minWidth: MIN_INSPECTOR_WIDTH,
        maxWidth: MAX_INSPECTOR_WIDTH,
      });
      const nextGenerationSheetWidth = clampOverlayWidth(generationSheetWidth, shellWidth, {
        leftReservedWidth: 0,
        rightReservedWidth: inspectorOpen ? inspectorWidth : 0,
        minWidth: MIN_GENERATION_SHEET_WIDTH,
        maxWidth: MAX_GENERATION_SHEET_WIDTH,
      });

      if (nextInspectorWidth !== inspectorWidth) {
        setInspectorWidth(nextInspectorWidth);
      }

      if (nextGenerationSheetWidth !== generationSheetWidth) {
        setGenerationSheetWidth(nextGenerationSheetWidth);
      }
    };

    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [
    generationSheetWidth,
    inspectorOpen,
    inspectorWidth,
    setGenerationSheetWidth,
    setInspectorWidth,
    showGenerationSheet,
  ]);

  useEffect(() => {
    if (!resizingPane) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const stopResize = () => {
      resizePointerIdRef.current = null;
      setResizingPane(null);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (resizePointerIdRef.current !== null && event.pointerId !== resizePointerIdRef.current) {
        return;
      }

      event.preventDefault();
      if (resizingPane === "generation") {
        updateGenerationSheetWidthFromClientX(event.clientX);
        return;
      }

      updateInspectorWidthFromClientX(event.clientX);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    window.addEventListener("blur", stopResize);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      window.removeEventListener("blur", stopResize);
    };
  }, [resizingPane, updateGenerationSheetWidthFromClientX, updateInspectorWidthFromClientX]);

  const handleInspectorResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    resizePointerIdRef.current = event.pointerId;
    setResizingPane("inspector");
    updateInspectorWidthFromClientX(event.clientX);
    event.preventDefault();
  }, [updateInspectorWidthFromClientX]);

  const handleInspectorResizeReset = useCallback(() => {
    const shellWidth = appShellRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const nextWidth = clampOverlayWidth(DEFAULT_INSPECTOR_WIDTH, shellWidth, {
      leftReservedWidth: 0,
      rightReservedWidth: showGenerationSheet ? generationSheetWidth : 0,
      minWidth: MIN_INSPECTOR_WIDTH,
      maxWidth: MAX_INSPECTOR_WIDTH,
    });
    setInspectorWidth(nextWidth);
  }, [generationSheetWidth, setInspectorWidth, showGenerationSheet]);

  const handleGenerationSheetResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    resizePointerIdRef.current = event.pointerId;
    setResizingPane("generation");
    updateGenerationSheetWidthFromClientX(event.clientX);
    event.preventDefault();
  }, [updateGenerationSheetWidthFromClientX]);

  const handleGenerationSheetResizeReset = useCallback(() => {
    const shellWidth = appShellRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const nextWidth = clampOverlayWidth(DEFAULT_GENERATION_SHEET_WIDTH, shellWidth, {
      leftReservedWidth: 0,
      rightReservedWidth: inspectorOpen ? inspectorWidth : 0,
      minWidth: MIN_GENERATION_SHEET_WIDTH,
      maxWidth: MAX_GENERATION_SHEET_WIDTH,
    });
    setGenerationSheetWidth(nextWidth);
  }, [inspectorOpen, inspectorWidth, setGenerationSheetWidth]);

  return (
    <div ref={appShellRef} className={appShellClassName}>
      <input
        ref={inputRef}
        hidden
        accept="image/*"
        multiple
        type="file"
        onChange={async (event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          await handleImportFiles(files);
          event.currentTarget.value = "";
        }}
      />
      {chatGptImportDialogOpen ? (
        <div className="workspace-dialog-backdrop" role="presentation">
          <form
            className="workspace-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chatgpt-import-title"
            onSubmit={(event) => {
              event.preventDefault();
              void handleImportFromChatGpt();
            }}
          >
            <div className="workspace-dialog__header">
              <h2 id="chatgpt-import-title">Import from ChatGPT</h2>
            </div>
            <label className="workspace-dialog__field">
              <span>Share link</span>
              <input
                ref={chatGptUrlInputRef}
                autoComplete="off"
                disabled={isChatGptImporting}
                inputMode="url"
                placeholder="https://chatgpt.com/share/..."
                spellCheck={false}
                type="text"
                value={chatGptShareUrl}
                onChange={(event) => setChatGptShareUrl(event.currentTarget.value)}
              />
            </label>
            {importError ? <p className="workspace-dialog__error">{importError}</p> : null}
            <div className="workspace-dialog__actions">
              <button
                className="workspace-dialog__action"
                disabled={isChatGptImporting}
                type="button"
                onClick={() => setChatGptImportDialogOpen(false)}
              >
                <span>Cancel</span>
              </button>
              <button
                className="workspace-dialog__action workspace-dialog__action--primary"
                disabled={isChatGptImporting || chatGptShareUrl.trim().length === 0}
                type="submit"
              >
                <span>{isChatGptImporting ? "Importing" : "Import"}</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {photoViewerAsset ? (
        <PhotoViewerDialog
          asset={photoViewerAsset}
          assets={photoAssets}
          currentIndex={photoViewerIndex}
          totalCount={photoAssets.length}
          hasPrevious={photoViewerIndex > 0}
          hasNext={photoViewerIndex >= 0 && photoViewerIndex < photoAssets.length - 1}
          canExport={isDesktopPersistenceAvailable}
          isExporting={isPhotoExporting}
          selectedAssetIds={selectedPhotoAssetIds}
          onClose={() => setPhotoViewerAssetId(null)}
          onExportSelected={() => void exportSelectedPhotos()}
          onNext={showNextPhoto}
          onSelectIndex={selectPhotoByIndex}
          onPrevious={showPreviousPhoto}
          onToggleSelection={togglePhotoSelection}
        />
      ) : null}
      <main className={workspaceClassName}>
        <header className="workspace__header">
          <div className="workspace__header-left">
            <button
              className={`workspace__panel-toggle ${leftRailOpen ? "workspace__panel-toggle--active" : ""}`}
              onClick={toggleLeftSidebar}
              title={leftRailOpen ? "Hide Left Rail" : "Show Left Rail"}
            >
              <PanelLeftIcon size={16} />
            </button>
            <div className="workspace__project-actions">
              {projectActionItems.map((action) => (
                <button
                  key={action.label}
                  className="workspace__project-action"
                  disabled={action.disabled}
                  onClick={action.onClick}
                  title={action.label}
                >
                  {action.icon}
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="workspace__title">
            <h1>{displayProjectName}</h1>
          </div>

          <div className="workspace__header-right">
            <div className="workspace__path-status">
              <span className={`workspace__status workspace__status--${persistenceStatus}`}>
                {persistenceStatusLabel}
              </span>
              <span className="workspace__path" title={currentProjectPath || "Draft"}>
                {currentProjectPath ? currentProjectPath.split(/[\\/]/).at(-1) : "Draft"}
              </span>
            </div>
            <button
              className={`workspace__panel-toggle ${isFullscreen ? "workspace__panel-toggle--active" : ""}`}
              onClick={handleToggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              <FullscreenIcon size={16} />
            </button>
            <button
              className={`workspace__panel-toggle ${inspectorOpen ? "workspace__panel-toggle--active" : ""}`}
              onClick={toggleInspector}
              title={inspectorOpen ? "Hide Right Sidebar" : "Show Right Sidebar"}
            >
              <PanelRightIcon size={16} />
            </button>
          </div>

          {workspaceError ? <p className="workspace__error">{workspaceError}</p> : null}
        </header>

        <div className={workspaceBodyClassName}>
          {leftRailOpen ? <ToolbarRail /> : null}
          <div className="workspace__canvas">
            {isDropActive ? (
              <div className="workspace__drop-overlay">
                <strong>Drop images to import</strong>
              </div>
            ) : null}
            <CanvasStage onCancelGeneration={cancelGeneration} />
          </div>
          {settingsOpen ? (
            <div
              ref={settingsPaneRef}
              className={`workspace__left-pane ${leftRailOpen ? "" : "workspace__left-pane--rail-hidden"}`}
              style={{ width: LEFT_PANEL_WIDTH }}
            >
              <LeftSidebar
                providerEntries={providerManagement.providerEntries}
                openAiAuthMethod={providerManagement.openAiAuthMethod}
                openAiAvailabilityByMethod={providerManagement.openAiAvailabilityByMethod}
                openAiSettings={providerManagement.openAiSettings}
                openAiSettingsStatus={providerManagement.openAiSettingsStatus}
                openAiSettingsError={providerManagement.openAiSettingsError}
                isDesktopOpenAiAvailable={providerManagement.isDesktopOpenAiAvailable}
                saveOpenAiSettings={providerManagement.saveOpenAiSettings}
                clearOpenAiSettings={providerManagement.clearOpenAiSettings}
                ima2SidecarSettings={providerManagement.ima2SidecarSettings}
                ima2SidecarSettingsStatus={providerManagement.ima2SidecarSettingsStatus}
                ima2SidecarSettingsError={providerManagement.ima2SidecarSettingsError}
                isDesktopIma2SidecarAvailable={providerManagement.isDesktopIma2SidecarAvailable}
                saveIma2SidecarSettings={providerManagement.saveIma2SidecarSettings}
                clearIma2SidecarSettings={providerManagement.clearIma2SidecarSettings}
                reloadIma2SidecarSettings={providerManagement.reloadIma2SidecarSettings}
                startIma2SidecarProxy={providerManagement.startIma2SidecarProxy}
                startIma2SidecarLogin={providerManagement.startIma2SidecarLogin}
                selectProviderFamily={providerManagement.selectProviderFamily}
                setOpenAiAuthMethod={providerManagement.setOpenAiAuthMethod}
              />
            </div>
          ) : null}
          {showGenerationSheet ? (
            <div
              className="workspace__right-pane workspace__right-pane--generation"
              style={{
                right: inspectorOpen ? inspectorWidth + 22 : 10,
                width: generationSheetWidth,
              }}
            >
              <ContextualGenerationSheet
                activeProvider={providerManagement.activeProvider}
                onSubmitGeneration={submitGeneration}
              />
            </div>
          ) : null}
          {inspectorOpen ? (
          <div
            className="workspace__right-pane workspace__right-pane--inspector"
            style={{
              right: 10,
              width: inspectorWidth,
            }}
          >
              <InspectorPanel
                recentProjects={recentProjects}
                onOpenRecentProject={openRecentProject}
                onCancelGeneration={cancelGeneration}
                onRerunGeneration={rerunGeneration}
              />
          </div>
          ) : null}
        </div>
        {areLogsVisible ? <DeveloperLogDrawer activeProviderId={activeProviderId} /> : null}
      </main>
      <ToastViewport />
    </div>
  );
}
