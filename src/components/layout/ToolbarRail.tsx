import {
  CenterSelectionIcon,
  FitSelectionIcon,
  FrameAllIcon,
  ImportIcon,
  ResetZoomIcon,
} from "@/components/icons/ui-icons";
import { useAppStore } from "@/state/app-store";

interface ToolbarRailProps {
  isImporting: boolean;
  onImportClick: () => void;
}

export function ToolbarRail({ isImporting, onImportClick }: ToolbarRailProps) {
  const frameAll = useAppStore((state) => state.frameAll);
  const frameSelection = useAppStore((state) => state.frameSelection);
  const centerSelection = useAppStore((state) => state.centerSelection);
  const resetZoom = useAppStore((state) => state.resetZoom);
  const selectionCount = useAppStore((state) => state.project.selection.assetIds.length);
  const actions = [
    {
      label: isImporting ? "Importing" : "Import",
      icon: <ImportIcon size={18} />,
      onClick: onImportClick,
      disabled: false,
    },
    {
      label: "Frame",
      icon: <FrameAllIcon size={18} />,
      onClick: frameAll,
      disabled: false,
    },
    {
      label: "Fit",
      icon: <FitSelectionIcon size={18} />,
      onClick: frameSelection,
      disabled: selectionCount === 0,
    },
    {
      label: "Center",
      icon: <CenterSelectionIcon size={18} />,
      onClick: centerSelection,
      disabled: selectionCount === 0,
    },
    {
      label: "Reset",
      icon: <ResetZoomIcon size={18} />,
      onClick: resetZoom,
      disabled: false,
    },
  ];

  return (
    <aside className="toolbar-rail">
      <header className="toolbar-rail__brand">
        <span className="toolbar-rail__mark">A</span>
        <strong>Aref</strong>
      </header>

      <nav aria-label="Canvas actions" className="toolbar-rail__actions">
        {actions.map((action) => (
          <button
            key={action.label}
            className="toolbar-tool"
            disabled={action.disabled}
            onClick={action.onClick}
            title={action.label}
          >
            <span className="toolbar-tool__icon">{action.icon}</span>
            <span className="toolbar-tool__label">{action.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
