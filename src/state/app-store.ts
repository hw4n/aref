import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import {
  bringSelectionForward,
  bringSelectionToFront,
  sendSelectionBackward,
  sendSelectionToBack,
} from "@/domain/assets/asset-order";
import { createGeneratedAssets } from "@/domain/assets/generated-asset-utils";
import { createImportedAssets, type ImportedImageDraft } from "@/domain/assets/imported-asset-utils";
import { getAssetsBounds } from "@/domain/assets/asset-geometry";
import type { AssetItem } from "@/domain/assets/types";
import {
  applyZoomAtPoint,
  centerRect,
  frameRect,
  panCamera,
  resetCameraZoom,
  resizeViewport,
} from "@/domain/camera/camera-math";
import type { GenerationRequest } from "@/domain/jobs/types";
import {
  createQueuedGenerationJob,
  markGenerationJobCancelled,
  markGenerationJobFailed,
  markGenerationJobRunning,
  markGenerationJobSucceeded,
} from "@/domain/jobs/job-state-machine";
import { getViewportCenter } from "@/domain/jobs/generation-layout";
import {
  createGroupFromSelection,
  getSelectedGroupIds,
  removeAssetIdsFromGroups,
  syncGroupsWithAssets,
  ungroupSelection,
} from "@/domain/groups/group-utils";
import type { GenerationProviderResult } from "@/domain/providers/types";
import { createEmptyProject } from "@/domain/project/sample-project";
import type { Project } from "@/domain/project/types";
import type { ProviderAuthMethod, ProviderFamilyId } from "@/domain/providers/types";
import type { Point } from "@/domain/shared/types";
import type { ToastKind, ToastMessage } from "@/domain/toasts/types";
import type {
  AppUiPreferences,
  DiagnosticLogEntry,
  DiagnosticLogLevel,
  DiagnosticLogScope,
  GenerationSheetDraft,
  SettingsSurfaceSection,
  VisibilityHistoryEntry,
} from "@/domain/ui/types";
import { getDefaultAppUiPreferences } from "@/features/settings/preferences-storage";

type SelectionOptions = {
  additive?: boolean;
};

export interface AssetTransformCommit {
  id: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

export interface AppStoreState {
  project: Project;
  isSpacePressed: boolean;
  isCanvasInteractionActive: boolean;
  toasts: ToastMessage[];
  generationDraft: GenerationSheetDraft;
  uiPreferences: AppUiPreferences;
  diagnosticLogs: DiagnosticLogEntry[];
  visibilityHistory: {
    undoStack: VisibilityHistoryEntry[];
    redoStack: VisibilityHistoryEntry[];
  };
  replaceProject: (project: Project) => void;
  importAssets: (drafts: ImportedImageDraft[]) => void;
  setViewportSize: (viewportWidth: number, viewportHeight: number) => void;
  panCameraBy: (deltaX: number, deltaY: number) => void;
  setCameraPosition: (position: Point) => void;
  zoomCameraAtPoint: (pointer: Point, zoomFactor: number) => void;
  resetZoom: () => void;
  frameAll: () => void;
  frameSelection: () => void;
  centerSelection: () => void;
  selectAll: () => void;
  selectAsset: (assetId: string, options?: SelectionOptions) => void;
  selectAssets: (assetIds: string[], options?: SelectionOptions) => void;
  clearSelection: () => void;
  setMarquee: (marquee: Project["selection"]["marquee"]) => void;
  setAssetThumbnailPath: (assetId: string, thumbnailPath: string) => void;
  setAssetPosition: (assetId: string, position: Point) => void;
  setAssetPositions: (updates: Array<{ id: string; position: Point }>) => void;
  moveAssetsBy: (assetIds: string[], delta: Point) => void;
  commitAssetTransforms: (updates: AssetTransformCommit[]) => void;
  hydrateUiPreferences: (preferences: Partial<AppUiPreferences>) => void;
  setGenerationDraft: (
    draft: Partial<Omit<GenerationSheetDraft, "settings">> & {
      settings?: Partial<GenerationSheetDraft["settings"]>;
    },
  ) => void;
  toggleLeftSidebar: () => void;
  toggleInspector: () => void;
  setInspectorWidth: (width: number) => void;
  setGenerationSheetWidth: (width: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setSettingsSection: (section: SettingsSurfaceSection) => void;
  setDeveloperMode: (enabled: boolean) => void;
  setLogsVisible: (visible: boolean) => void;
  setMockProviderEnabled: (enabled: boolean) => void;
  setProviderAuthMethod: (providerFamily: ProviderFamilyId, authMethod: ProviderAuthMethod) => void;
  toggleSelectedLocked: () => void;
  hideSelected: () => void;
  unhideSelected: () => void;
  unhideAllHidden: () => void;
  setAssetHidden: (assetId: string, hidden: boolean) => void;
  revealHiddenAsset: (assetId: string) => void;
  undoVisibilityChange: () => void;
  redoVisibilityChange: () => void;
  bringSelectionForward: () => void;
  sendSelectionBackward: () => void;
  bringSelectionToFront: () => void;
  sendSelectionToBack: () => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  duplicateSelection: () => void;
  deleteSelection: () => void;
  queueGenerationJob: (request: GenerationRequest, jobId?: string) => string;
  setGenerationJobCanvasPlacement: (jobId: string, position: Point) => void;
  runGenerationJob: (jobId: string) => void;
  completeGenerationJob: (jobId: string, result: GenerationProviderResult) => string[];
  failGenerationJob: (jobId: string, error: string) => void;
  cancelGenerationJob: (jobId: string) => void;
  removeGenerationJob: (jobId: string) => void;
  appendDiagnosticLog: (entry: {
    level: DiagnosticLogLevel;
    scope: DiagnosticLogScope;
    title: string;
    message: string;
    details?: string | null;
  }) => string;
  clearDiagnosticLogs: () => void;
  pushToast: (toast: { kind: ToastKind; title: string; description?: string }) => string;
  dismissToast: (toastId: string) => void;
  setCanvasInteractionActive: (active: boolean) => void;
  setSpacePressed: (pressed: boolean) => void;
}

function bumpProject(project: Project): Project {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
  };
}

function updateAssetRecord(
  assets: Record<string, AssetItem>,
  assetIds: string[],
  update: (asset: AssetItem) => AssetItem,
) {
  const nextAssets = { ...assets };

  for (const assetId of assetIds) {
    const asset = nextAssets[assetId];

    if (!asset) {
      continue;
    }

    nextAssets[assetId] = update(asset);
  }

  return nextAssets;
}

function getLockedAssetIds(assets: Record<string, AssetItem>) {
  return new Set(
    Object.values(assets)
      .filter((asset) => asset.locked)
      .map((asset) => asset.id),
  );
}

function getHiddenAssetIds(assets: Record<string, AssetItem>) {
  return new Set(
    Object.values(assets)
      .filter((asset) => asset.hidden)
      .map((asset) => asset.id),
  );
}

function syncProjectGroups(project: Project, assets: Record<string, AssetItem>) {
  return syncGroupsWithAssets(project.groups, getLockedAssetIds(assets), getHiddenAssetIds(assets));
}

const MAX_VISIBILITY_HISTORY = 64;
const MAX_DIAGNOSTIC_LOGS = 250;

function createDefaultGenerationDraft(): GenerationSheetDraft {
  return {
    prompt: "",
    negativePrompt: "",
    provider: "ima2-sidecar",
    model: "gpt-5.5",
    settings: {
      imageCount: 1,
      aspectRatio: "unspecified",
      quality: "medium",
      moderation: "low",
    },
    pinnedAssetIds: null,
    isExplicitlyOpened: false,
  };
}

function resetGenerationSheetContext(generationDraft: GenerationSheetDraft): GenerationSheetDraft {
  if (generationDraft.pinnedAssetIds === null && !generationDraft.isExplicitlyOpened) {
    return generationDraft;
  }

  return {
    ...generationDraft,
    pinnedAssetIds: null,
    isExplicitlyOpened: false,
  };
}

function applyHiddenMap(
  assets: Record<string, AssetItem>,
  hiddenById: Record<string, boolean>,
  timestamp: string,
) {
  const nextAssets = { ...assets };
  let didChange = false;

  for (const [assetId, hidden] of Object.entries(hiddenById)) {
    const asset = nextAssets[assetId];

    if (!asset || asset.hidden === hidden) {
      continue;
    }

    nextAssets[assetId] = {
      ...asset,
      hidden,
      updatedAt: timestamp,
    };
    didChange = true;
  }

  return didChange ? nextAssets : assets;
}

function createVisibilityHistoryEntry(
  assets: Record<string, AssetItem>,
  assetIds: string[],
  hidden: boolean,
): VisibilityHistoryEntry | null {
  const uniqueIds = Array.from(new Set(assetIds)).filter((assetId) => assets[assetId]);

  if (uniqueIds.length === 0) {
    return null;
  }

  const previousHiddenById = Object.fromEntries(
    uniqueIds.map((assetId) => [assetId, assets[assetId]!.hidden]),
  );
  const nextHiddenById = Object.fromEntries(uniqueIds.map((assetId) => [assetId, hidden]));
  const didChange = uniqueIds.some((assetId) => previousHiddenById[assetId] !== nextHiddenById[assetId]);

  return didChange
    ? {
        assetIds: uniqueIds,
        previousHiddenById,
        nextHiddenById,
      }
    : null;
}

function applyVisibilityEntry(
  state: AppStoreState,
  hiddenById: Record<string, boolean>,
  options?: {
    historyMode?: "push-undo" | "push-redo" | "none";
    pairedEntry?: VisibilityHistoryEntry;
    selectionAssetIds?: string[] | null;
    centerSelection?: boolean;
  },
) {
  const timestamp = new Date().toISOString();
  const nextAssets = applyHiddenMap(state.project.assets, hiddenById, timestamp);

  if (nextAssets === state.project.assets) {
    return state;
  }

  const nextSelection = options?.selectionAssetIds
    ? {
        assetIds: options.selectionAssetIds,
        marquee: null,
        lastActiveAssetId: options.selectionAssetIds.at(-1) ?? null,
      }
    : state.project.selection;

  let nextCamera = state.project.camera;
  if (options?.centerSelection && options.selectionAssetIds && options.selectionAssetIds.length > 0) {
    const bounds = getAssetsBounds(
      options.selectionAssetIds
        .map((assetId) => nextAssets[assetId])
        .filter(Boolean),
    );

    if (bounds) {
      nextCamera = centerRect(state.project.camera, bounds);
    }
  }

  const nextProject = bumpProject({
    ...state.project,
    assets: nextAssets,
    groups: syncProjectGroups(state.project, nextAssets),
    selection: nextSelection,
    camera: nextCamera,
  });

  if (options?.historyMode === "push-undo" && options.pairedEntry) {
    return {
      project: nextProject,
      visibilityHistory: {
        undoStack: [...state.visibilityHistory.undoStack, options.pairedEntry].slice(-MAX_VISIBILITY_HISTORY),
        redoStack: [],
      },
    };
  }

  if (options?.historyMode === "push-redo" && options.pairedEntry) {
    return {
      project: nextProject,
      visibilityHistory: {
        undoStack: state.visibilityHistory.undoStack,
        redoStack: [...state.visibilityHistory.redoStack, options.pairedEntry].slice(-MAX_VISIBILITY_HISTORY),
      },
    };
  }

  return {
    project: nextProject,
    visibilityHistory: state.visibilityHistory,
  };
}

export function createAppStore(initialProject: Project = createEmptyProject()) {
  return createStore<AppStoreState>((set, get) => ({
    project: initialProject,
    isSpacePressed: false,
    isCanvasInteractionActive: false,
    toasts: [],
    generationDraft: createDefaultGenerationDraft(),
    uiPreferences: getDefaultAppUiPreferences(),
    diagnosticLogs: [],
    visibilityHistory: {
      undoStack: [],
      redoStack: [],
    },
    replaceProject: (project) => {
      set({
        project,
        generationDraft: createDefaultGenerationDraft(),
        visibilityHistory: {
          undoStack: [],
          redoStack: [],
        },
      });
    },
    importAssets: (drafts) => {
      if (drafts.length === 0) {
        return;
      }

      set((state) => {
        const importedAssets = createImportedAssets(drafts, state.project.assets, state.project.camera);

        return {
          project: bumpProject({
            ...state.project,
            assets: {
              ...state.project.assets,
              ...Object.fromEntries(importedAssets.map((asset) => [asset.id, asset])),
            },
            selection: {
              assetIds: importedAssets.map((asset) => asset.id),
              marquee: null,
              lastActiveAssetId: importedAssets.at(-1)?.id ?? null,
            },
          }),
          generationDraft: resetGenerationSheetContext(state.generationDraft),
        };
      });
    },
    setViewportSize: (viewportWidth, viewportHeight) => {
      set((state) => ({
        project: {
          ...state.project,
          camera: resizeViewport(state.project.camera, viewportWidth, viewportHeight),
        },
      }));
    },
    setAssetThumbnailPath: (assetId, thumbnailPath) => {
      set((state) => {
        const asset = state.project.assets[assetId];

        if (!asset || asset.thumbnailPath === thumbnailPath) {
          return {};
        }

        const timestamp = new Date().toISOString();

        return {
          project: bumpProject({
            ...state.project,
            assets: {
              ...state.project.assets,
              [assetId]: {
                ...asset,
                thumbnailPath,
                updatedAt: timestamp,
              },
            },
          }),
        };
      });
    },
    panCameraBy: (deltaX, deltaY) => {
      set((state) => ({
        project: bumpProject({
          ...state.project,
          camera: panCamera(state.project.camera, deltaX, deltaY),
        }),
      }));
    },
    setCameraPosition: (position) => {
      set((state) => ({
        project: bumpProject({
          ...state.project,
          camera: {
            ...state.project.camera,
            x: position.x,
            y: position.y,
          },
        }),
      }));
    },
    zoomCameraAtPoint: (pointer, zoomFactor) => {
      set((state) => ({
        project: bumpProject({
          ...state.project,
          camera: applyZoomAtPoint(state.project.camera, pointer, zoomFactor),
        }),
      }));
    },
    resetZoom: () => {
      set((state) => ({
        project: bumpProject({
          ...state.project,
          camera: resetCameraZoom(state.project.camera),
        }),
      }));
    },
    frameAll: () => {
      const visibleAssets = Object.values(get().project.assets).filter((asset) => !asset.hidden);
      const bounds = getAssetsBounds(visibleAssets);

      if (!bounds) {
        return;
      }

      set((state) => ({
        project: bumpProject({
          ...state.project,
          camera: frameRect(state.project.camera, bounds),
        }),
      }));
    },
    frameSelection: () => {
      const state = get();
      const selectedAssets = state.project.selection.assetIds
        .map((assetId) => state.project.assets[assetId])
        .filter(Boolean);
      const bounds = getAssetsBounds(selectedAssets);

      if (!bounds) {
        return;
      }

      set((currentState) => ({
        project: bumpProject({
          ...currentState.project,
          camera: frameRect(currentState.project.camera, bounds, 128),
        }),
      }));
    },
    centerSelection: () => {
      const state = get();
      const selectedAssets = state.project.selection.assetIds
        .map((assetId) => state.project.assets[assetId])
        .filter(Boolean);
      const bounds = getAssetsBounds(selectedAssets);

      if (!bounds) {
        return;
      }

      set((currentState) => ({
        project: bumpProject({
          ...currentState.project,
          camera: centerRect(currentState.project.camera, bounds),
        }),
      }));
    },
    selectAll: () => {
      set((state) => {
        const visibleAssetIds = Object.values(state.project.assets)
          .filter((asset) => !asset.hidden)
          .sort((left, right) => left.zIndex - right.zIndex)
          .map((asset) => asset.id);

        return {
          project: {
            ...state.project,
            selection: {
              assetIds: visibleAssetIds,
              marquee: null,
              lastActiveAssetId: visibleAssetIds.at(-1) ?? null,
            },
          },
          generationDraft: resetGenerationSheetContext(state.generationDraft),
        };
      });
    },
    selectAsset: (assetId, options) => {
      set((state) => {
        const isSelected = state.project.selection.assetIds.includes(assetId);
        const assetIds = options?.additive
          ? isSelected
            ? state.project.selection.assetIds.filter((id) => id !== assetId)
            : [...state.project.selection.assetIds, assetId]
          : [assetId];

        return {
          project: {
            ...state.project,
            selection: {
              assetIds,
              marquee: null,
              lastActiveAssetId: assetId,
            },
          },
          generationDraft: resetGenerationSheetContext(state.generationDraft),
        };
      });
    },
    selectAssets: (assetIds, options) => {
      set((state) => {
        const uniqueIds = Array.from(new Set(assetIds));
        const nextAssetIds = options?.additive
          ? Array.from(new Set([...state.project.selection.assetIds, ...uniqueIds]))
          : uniqueIds;

        return {
          project: {
            ...state.project,
            selection: {
              assetIds: nextAssetIds,
              marquee: null,
              lastActiveAssetId: nextAssetIds.at(-1) ?? null,
            },
          },
          generationDraft: resetGenerationSheetContext(state.generationDraft),
        };
      });
    },
    clearSelection: () => {
      set((state) => ({
        project: {
          ...state.project,
          selection: {
            assetIds: [],
            marquee: null,
            lastActiveAssetId: null,
          },
        },
        generationDraft: resetGenerationSheetContext(state.generationDraft),
      }));
    },
    setMarquee: (marquee) => {
      set((state) => ({
        project: {
          ...state.project,
          selection: {
            ...state.project.selection,
            marquee,
          },
        },
      }));
    },
    setAssetPosition: (assetId, position) => {
      set((state) => {
        const asset = state.project.assets[assetId];

        if (!asset || asset.locked) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            assets: {
              ...state.project.assets,
              [assetId]: {
                ...asset,
                x: position.x,
                y: position.y,
                updatedAt: new Date().toISOString(),
              },
            },
          }),
        };
      });
    },
    setAssetPositions: (updates) => {
      if (updates.length === 0) {
        return;
      }

      set((state) => {
        const timestamp = new Date().toISOString();
        let didChange = false;
        const nextAssets = { ...state.project.assets };

        for (const update of updates) {
          const asset = nextAssets[update.id];

          if (!asset || asset.locked) {
            continue;
          }

          if (asset.x === update.position.x && asset.y === update.position.y) {
            continue;
          }

          nextAssets[update.id] = {
            ...asset,
            x: update.position.x,
            y: update.position.y,
            updatedAt: timestamp,
          };
          didChange = true;
        }

        if (!didChange) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            assets: nextAssets,
          }),
        };
      });
    },
    moveAssetsBy: (assetIds, delta) => {
      if (assetIds.length === 0 || (delta.x === 0 && delta.y === 0)) {
        return;
      }

      set((state) => ({
        project: bumpProject({
          ...state.project,
          assets: updateAssetRecord(
            state.project.assets,
            assetIds.filter((assetId) => !state.project.assets[assetId]?.locked),
            (asset) => ({
              ...asset,
              x: asset.x + delta.x,
              y: asset.y + delta.y,
              updatedAt: new Date().toISOString(),
            }),
          ),
        }),
      }));
    },
    commitAssetTransforms: (updates) => {
      if (updates.length === 0) {
        return;
      }

      set((state) => ({
        project: bumpProject({
          ...state.project,
          assets: updateAssetRecord(
            state.project.assets,
            updates.map((update) => update.id),
            (asset) => {
              const next = updates.find((update) => update.id === asset.id);

              if (!next) {
                return asset;
              }

              if (asset.locked) {
                return asset;
              }

              return {
                ...asset,
                x: next.x,
                y: next.y,
                rotation: next.rotation,
                scale: next.scale,
                updatedAt: new Date().toISOString(),
              };
            },
          ),
        }),
      }));
    },
    hydrateUiPreferences: (preferences) => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          ...preferences,
          providerAuthMethods: {
            ...state.uiPreferences.providerAuthMethods,
            ...preferences.providerAuthMethods,
          },
          logsVisible:
            preferences.developerMode === false
              ? false
              : preferences.logsVisible ?? state.uiPreferences.logsVisible,
        },
      }));
    },
    setGenerationDraft: (draft) => {
      set((state) => ({
        generationDraft: {
          ...state.generationDraft,
          ...draft,
          settings: draft.settings
            ? {
                ...state.generationDraft.settings,
                ...draft.settings,
              }
            : state.generationDraft.settings,
        },
      }));
    },
    toggleLeftSidebar: () => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          leftSidebarOpen: !state.uiPreferences.leftSidebarOpen,
        },
      }));
    },
    toggleInspector: () => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          inspectorOpen: !state.uiPreferences.inspectorOpen,
        },
      }));
    },
    setInspectorWidth: (width) => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          inspectorWidth: width,
        },
      }));
    },
    setGenerationSheetWidth: (width) => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          generationSheetWidth: width,
        },
      }));
    },
    setSettingsOpen: (open) => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          settingsOpen: open,
        },
      }));
    },
    setSettingsSection: (section) => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          settingsOpen: true,
          settingsSection: section,
        },
      }));
    },
    setDeveloperMode: (enabled) => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          developerMode: enabled,
          logsVisible: enabled ? state.uiPreferences.logsVisible : false,
        },
      }));
    },
    setLogsVisible: (visible) => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          logsVisible: state.uiPreferences.developerMode ? visible : false,
        },
      }));
    },
    setMockProviderEnabled: (enabled) => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          mockProviderEnabled: enabled,
        },
      }));
    },
    setProviderAuthMethod: (providerFamily, authMethod) => {
      set((state) => ({
        uiPreferences: {
          ...state.uiPreferences,
          providerAuthMethods: {
            ...state.uiPreferences.providerAuthMethods,
            [providerFamily]: authMethod,
          },
        },
      }));
    },
    toggleSelectedLocked: () => {
      set((state) => {
        const selectedAssets = state.project.selection.assetIds
          .map((assetId) => state.project.assets[assetId])
          .filter(Boolean);

        if (selectedAssets.length === 0) {
          return state;
        }

        const shouldLock = selectedAssets.some((asset) => !asset.locked);
        const timestamp = new Date().toISOString();
        const nextAssets = updateAssetRecord(
          state.project.assets,
          selectedAssets.map((asset) => asset.id),
          (asset) => ({
            ...asset,
            locked: shouldLock,
            updatedAt: timestamp,
          }),
        );

        return {
          project: bumpProject({
            ...state.project,
            assets: nextAssets,
            groups: syncProjectGroups(state.project, nextAssets),
          }),
        };
      });
    },
    hideSelected: () => {
      set((state) => {
        const entry = createVisibilityHistoryEntry(
          state.project.assets,
          state.project.selection.assetIds,
          true,
        );

        if (!entry) {
          return state;
        }

        return applyVisibilityEntry(state, entry.nextHiddenById, {
          historyMode: "push-undo",
          pairedEntry: entry,
        });
      });
    },
    unhideSelected: () => {
      set((state) => {
        const entry = createVisibilityHistoryEntry(
          state.project.assets,
          state.project.selection.assetIds,
          false,
        );

        if (!entry) {
          return state;
        }

        return applyVisibilityEntry(state, entry.nextHiddenById, {
          historyMode: "push-undo",
          pairedEntry: entry,
        });
      });
    },
    unhideAllHidden: () => {
      set((state) => {
        const entry = createVisibilityHistoryEntry(
          state.project.assets,
          Object.values(state.project.assets)
            .filter((asset) => asset.hidden)
            .map((asset) => asset.id),
          false,
        );

        if (!entry) {
          return state;
        }

        return applyVisibilityEntry(state, entry.nextHiddenById, {
          historyMode: "push-undo",
          pairedEntry: entry,
        });
      });
    },
    setAssetHidden: (assetId, hidden) => {
      set((state) => {
        const entry = createVisibilityHistoryEntry(
          state.project.assets,
          [assetId],
          hidden,
        );

        if (!entry) {
          return state;
        }

        return applyVisibilityEntry(state, entry.nextHiddenById, {
          historyMode: "push-undo",
          pairedEntry: entry,
        });
      });
    },
    revealHiddenAsset: (assetId) => {
      set((state) => {
        const entry = createVisibilityHistoryEntry(
          state.project.assets,
          [assetId],
          false,
        );

        if (!entry) {
          const asset = state.project.assets[assetId];

          if (!asset) {
            return state;
          }

          const bounds = getAssetsBounds([asset]);
          return {
            project: bumpProject({
              ...state.project,
              selection: {
                assetIds: [assetId],
                marquee: null,
                lastActiveAssetId: assetId,
              },
              camera: bounds ? centerRect(state.project.camera, bounds) : state.project.camera,
            }),
            generationDraft: resetGenerationSheetContext(state.generationDraft),
          };
        }

        return applyVisibilityEntry(state, entry.nextHiddenById, {
          historyMode: "push-undo",
          pairedEntry: entry,
          selectionAssetIds: [assetId],
          centerSelection: true,
        });
      });
    },
    undoVisibilityChange: () => {
      set((state) => {
        const entry = state.visibilityHistory.undoStack.at(-1);

        if (!entry) {
          return state;
        }

        const nextState = applyVisibilityEntry(state, entry.previousHiddenById, {
          historyMode: "none",
        });

        if (nextState === state) {
          return state;
        }

        return {
          ...nextState,
          visibilityHistory: {
            undoStack: state.visibilityHistory.undoStack.slice(0, -1),
            redoStack: [...state.visibilityHistory.redoStack, entry].slice(-MAX_VISIBILITY_HISTORY),
          },
        };
      });
    },
    redoVisibilityChange: () => {
      set((state) => {
        const entry = state.visibilityHistory.redoStack.at(-1);

        if (!entry) {
          return state;
        }

        const nextState = applyVisibilityEntry(state, entry.nextHiddenById, {
          historyMode: "none",
        });

        if (nextState === state) {
          return state;
        }

        return {
          ...nextState,
          visibilityHistory: {
            undoStack: [...state.visibilityHistory.undoStack, entry].slice(-MAX_VISIBILITY_HISTORY),
            redoStack: state.visibilityHistory.redoStack.slice(0, -1),
          },
        };
      });
    },
    bringSelectionForward: () => {
      set((state) => {
        const nextAssets = bringSelectionForward(
          state.project.assets,
          state.project.selection.assetIds,
          new Date().toISOString(),
        );

        if (nextAssets === state.project.assets) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            assets: nextAssets,
          }),
        };
      });
    },
    sendSelectionBackward: () => {
      set((state) => {
        const nextAssets = sendSelectionBackward(
          state.project.assets,
          state.project.selection.assetIds,
          new Date().toISOString(),
        );

        if (nextAssets === state.project.assets) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            assets: nextAssets,
          }),
        };
      });
    },
    bringSelectionToFront: () => {
      set((state) => {
        const nextAssets = bringSelectionToFront(
          state.project.assets,
          state.project.selection.assetIds,
          new Date().toISOString(),
        );

        if (nextAssets === state.project.assets) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            assets: nextAssets,
          }),
        };
      });
    },
    sendSelectionToBack: () => {
      set((state) => {
        const nextAssets = sendSelectionToBack(
          state.project.assets,
          state.project.selection.assetIds,
          new Date().toISOString(),
        );

        if (nextAssets === state.project.assets) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            assets: nextAssets,
          }),
        };
      });
    },
    groupSelection: () => {
      set((state) => {
        if (state.project.selection.assetIds.length < 2) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            groups: createGroupFromSelection(state.project.groups, state.project.selection.assetIds),
          }),
        };
      });
    },
    ungroupSelection: () => {
      set((state) => {
        const selectedGroupIds = getSelectedGroupIds(state.project.groups, state.project.selection.assetIds);

        if (selectedGroupIds.length === 0) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            groups: ungroupSelection(state.project.groups, state.project.selection.assetIds),
          }),
        };
      });
    },
    duplicateSelection: () => {
      set((state) => {
        const selectedAssets = state.project.selection.assetIds
          .map((assetId) => state.project.assets[assetId])
          .filter(Boolean)
          .sort((left, right) => left.zIndex - right.zIndex);

        if (selectedAssets.length === 0) {
          return state;
        }

        const nextZIndex =
          Object.values(state.project.assets).reduce(
            (highest, asset) => Math.max(highest, asset.zIndex),
            -1,
          ) + 1;
        const timestamp = new Date().toISOString();
        const duplicates = selectedAssets.map((asset, index) => ({
          ...asset,
          id: crypto.randomUUID(),
          x: asset.x + 40,
          y: asset.y + 40,
          zIndex: nextZIndex + index,
          createdAt: timestamp,
          updatedAt: timestamp,
        }));

        return {
          project: bumpProject({
            ...state.project,
            assets: {
              ...state.project.assets,
              ...Object.fromEntries(duplicates.map((asset) => [asset.id, asset])),
            },
            selection: {
              assetIds: duplicates.map((asset) => asset.id),
              marquee: null,
              lastActiveAssetId: duplicates.at(-1)?.id ?? null,
            },
          }),
          generationDraft: resetGenerationSheetContext(state.generationDraft),
        };
      });
    },
    deleteSelection: () => {
      set((state) => {
        if (state.project.selection.assetIds.length === 0) {
          return state;
        }

        const nextAssets = { ...state.project.assets };

        for (const assetId of state.project.selection.assetIds) {
          delete nextAssets[assetId];
        }

        const nextGroups = syncGroupsWithAssets(
          removeAssetIdsFromGroups(state.project.groups, state.project.selection.assetIds),
          getLockedAssetIds(nextAssets),
          getHiddenAssetIds(nextAssets),
        );

        return {
          project: bumpProject({
            ...state.project,
            assets: nextAssets,
            groups: nextGroups,
            selection: {
              assetIds: [],
              marquee: null,
              lastActiveAssetId: null,
            },
          }),
          generationDraft: resetGenerationSheetContext(state.generationDraft),
        };
      });
    },
    queueGenerationJob: (request, jobId) => {
      const nextJobId = jobId ?? crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const currentState = get();
      const existingJob = currentState.project.jobs[nextJobId];
      const canvasPlacement = existingJob?.canvasPlacement ?? getViewportCenter(currentState.project.camera);

      set((state) => ({
        project: bumpProject({
          ...state.project,
          jobs: {
            ...state.project.jobs,
            [nextJobId]: createQueuedGenerationJob(
              nextJobId,
              request,
              canvasPlacement,
              existingJob?.attemptCount ?? 0,
              timestamp,
            ),
          },
        }),
      }));

      return nextJobId;
    },
    setGenerationJobCanvasPlacement: (jobId, position) => {
      set((state) => {
        const job = state.project.jobs[jobId];

        if (!job) {
          return state;
        }

        if (job.canvasPlacement.x === position.x && job.canvasPlacement.y === position.y) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            jobs: {
              ...state.project.jobs,
              [jobId]: {
                ...job,
                canvasPlacement: position,
              },
            },
          }),
        };
      });
    },
    runGenerationJob: (jobId) => {
      set((state) => {
        const job = state.project.jobs[jobId];

        if (!job) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            jobs: {
              ...state.project.jobs,
              [jobId]: markGenerationJobRunning(job),
            },
          }),
        };
      });
    },
    completeGenerationJob: (jobId, result) => {
      const state = get();
      const job = state.project.jobs[jobId];

      if (!job) {
        return [];
      }

      const timestamp = result.completedAt ?? new Date().toISOString();
      const generatedAssets = createGeneratedAssets(result, state.project.assets, state.project.camera, {
        ...job,
        completedAt: timestamp,
      });
      const generatedAssetIds = generatedAssets.map((asset) => asset.id);
      const succeededJob = markGenerationJobSucceeded(job, {
        completedAt: timestamp,
        providerRequestId: result.requestId ?? undefined,
        providerMode: result.mode,
        resultAssetIds: generatedAssetIds,
      });

      set((currentState) => ({
        project: bumpProject({
          ...currentState.project,
          assets: {
            ...currentState.project.assets,
            ...Object.fromEntries(generatedAssets.map((asset) => [asset.id, asset])),
          },
          jobs: {
            ...currentState.project.jobs,
            [jobId]: succeededJob,
          },
          selection: {
            assetIds: generatedAssetIds,
            marquee: null,
            lastActiveAssetId: generatedAssetIds.at(-1) ?? null,
          },
        }),
      }));

      return generatedAssetIds;
    },
    failGenerationJob: (jobId, error) => {
      set((state) => {
        const job = state.project.jobs[jobId];

        if (!job) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            jobs: {
              ...state.project.jobs,
              [jobId]: markGenerationJobFailed(job, error),
            },
          }),
        };
      });
    },
    cancelGenerationJob: (jobId) => {
      set((state) => {
        const job = state.project.jobs[jobId];

        if (!job) {
          return state;
        }

        return {
          project: bumpProject({
            ...state.project,
            jobs: {
              ...state.project.jobs,
              [jobId]: markGenerationJobCancelled(job),
            },
          }),
        };
      });
    },
    removeGenerationJob: (jobId) => {
      set((state) => {
        if (!state.project.jobs[jobId]) {
          return state;
        }

        const nextJobs = { ...state.project.jobs };
        delete nextJobs[jobId];

        return {
          project: bumpProject({
            ...state.project,
            jobs: nextJobs,
          }),
        };
      });
    },
    appendDiagnosticLog: ({ level, scope, title, message, details }) => {
      const logId = crypto.randomUUID();

      set((state) => ({
        diagnosticLogs: [
          {
            id: logId,
            timestamp: new Date().toISOString(),
            level,
            scope,
            title,
            message,
            details,
          },
          ...state.diagnosticLogs,
        ].slice(0, MAX_DIAGNOSTIC_LOGS),
      }));

      return logId;
    },
    clearDiagnosticLogs: () => {
      set({ diagnosticLogs: [] });
    },
    pushToast: ({ kind, title, description }) => {
      const toastId = crypto.randomUUID();

      set((state) => ({
        toasts: [
          {
            id: toastId,
            kind,
            title,
            description,
            createdAt: new Date().toISOString(),
          },
          ...state.toasts,
        ].slice(0, 4),
      }));

      return toastId;
    },
    dismissToast: (toastId) => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== toastId),
      }));
    },
    setCanvasInteractionActive: (active) => {
      set({
        isCanvasInteractionActive: active,
      });
    },
    setSpacePressed: (pressed) => {
      set({
        isSpacePressed: pressed,
      });
    },
  }));
}

export const appStore = createAppStore();

export function useAppStore<T>(selector: (state: AppStoreState) => T) {
  return useStore(appStore, selector);
}
