import {
  CenterSelectionIcon,
  FitSelectionIcon,
  FrameAllIcon,
  GridIcon,
  SettingsIcon,
  SparklesIcon,
  TextIcon,
} from "@/components/icons/ui-icons";
import { useAppStore } from "@/state/app-store";

export function ToolbarRail() {
  const frameAll = useAppStore((state) => state.frameAll);
  const frameSelection = useAppStore((state) => state.frameSelection);
  const centerSelection = useAppStore((state) => state.centerSelection);
  const selectionCount = useAppStore((state) => state.project.selection.assetIds.length);
  const imageSelectionCount = useAppStore((state) =>
    state.project.selection.assetIds.filter((assetId) => {
      const asset = state.project.assets[assetId];
      return asset?.kind === "imported" || asset?.kind === "generated";
    }).length,
  );
  const generationDraft = useAppStore((state) => state.generationDraft);
  const addTextAsset = useAppStore((state) => state.addTextAsset);
  const selectedTextCount = useAppStore((state) =>
    state.project.selection.assetIds.filter((assetId) => state.project.assets[assetId]?.kind === "text").length,
  );
  const gridVisible = useAppStore((state) => state.uiPreferences.gridVisible);
  const settingsOpen = useAppStore((state) => state.uiPreferences.settingsOpen);
  const toggleGridVisible = useAppStore((state) => state.toggleGridVisible);
  const setGenerationDraft = useAppStore((state) => state.setGenerationDraft);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);
  const setSettingsSection = useAppStore((state) => state.setSettingsSection);

  const primaryActions = [
    {
      label: gridVisible ? "Hide Grid" : "Show Grid",
      icon: <GridIcon size={18} />,
      onClick: toggleGridVisible,
      disabled: false,
      active: gridVisible,
    },
    {
      label: "Generate",
      icon: <SparklesIcon size={18} />,
      onClick: () => setGenerationDraft({ isExplicitlyOpened: !generationDraft.isExplicitlyOpened }),
      disabled: false,
      active: imageSelectionCount > 0 || generationDraft.isExplicitlyOpened,
    },
    {
      label: "Text",
      icon: <TextIcon size={18} />,
      onClick: addTextAsset,
      disabled: false,
      active: selectedTextCount > 0,
    },
  ];

  const canvasActions = [
    {
      label: "Frame All",
      icon: <FrameAllIcon size={18} />,
      onClick: frameAll,
      disabled: false,
      active: false,
    },
    {
      label: "Fit Selection",
      icon: <FitSelectionIcon size={18} />,
      onClick: frameSelection,
      disabled: selectionCount === 0,
      active: false,
    },
    {
      label: "Center",
      icon: <CenterSelectionIcon size={18} />,
      onClick: centerSelection,
      disabled: selectionCount === 0,
      active: false,
    },
  ];

  const utilityActions = [
    {
      label: settingsOpen ? "Close Settings" : "Settings",
      icon: <SettingsIcon size={18} />,
      onClick: () => {
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }

        setSettingsSection("providers");
      },
      disabled: false,
      active: settingsOpen,
    },
  ];

  return (
    <aside className="toolbar-rail">
      <nav aria-label="Canvas tools" className="toolbar-rail__actions">
        {primaryActions.map((action) => (
          <button
            key={action.label}
            className={`toolbar-tool ${action.active ? "toolbar-tool--active" : ""}`}
            disabled={action.disabled}
            onClick={action.onClick}
            title={action.label}
          >
            <span className="toolbar-tool__icon">{action.icon}</span>
            <span className="sr-only">{action.label}</span>
          </button>
        ))}
        <span className="toolbar-rail__divider" />
        {canvasActions.map((action) => (
          <button
            key={action.label}
            className={`toolbar-tool ${action.active ? "toolbar-tool--active" : ""}`}
            disabled={action.disabled}
            onClick={action.onClick}
            title={action.label}
          >
            <span className="toolbar-tool__icon">{action.icon}</span>
            <span className="sr-only">{action.label}</span>
          </button>
        ))}
      </nav>

      <nav aria-label="Canvas utilities" className="toolbar-rail__actions toolbar-rail__actions--bottom">
        {utilityActions.map((action) => (
          <button
            key={action.label}
            className={`toolbar-tool ${action.active ? "toolbar-tool--active" : ""}`}
            disabled={action.disabled}
            onClick={action.onClick}
            title={action.label}
          >
            <span className="toolbar-tool__icon">{action.icon}</span>
            <span className="sr-only">{action.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
