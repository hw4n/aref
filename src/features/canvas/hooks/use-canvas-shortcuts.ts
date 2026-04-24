import { useEffect } from "react";

type CanvasShortcutHandlers = {
  frameAll: () => void;
  frameSelection: () => void;
  centerSelection: () => void;
  copySelectionToClipboard: () => void | Promise<void>;
  resetZoom: () => void;
  selectAll: () => void;
  duplicateSelection: () => void;
  deleteSelection: () => void;
  toggleSelectedLocked: () => void;
  hideSelected: () => void;
  unhideSelected: () => void;
  unhideAllHidden: () => void;
  undoVisibilityChange: () => void;
  redoVisibilityChange: () => void;
  bringSelectionForward: () => void;
  sendSelectionBackward: () => void;
  bringSelectionToFront: () => void;
  sendSelectionToBack: () => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  clearSelection: () => void;
  setSpacePressed: (pressed: boolean) => void;
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    target.isContentEditable
  );
}

export function useCanvasShortcuts(handlers: CanvasShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTypingTarget(event.target)) {
        event.preventDefault();
        handlers.setSpacePressed(true);
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.code === "KeyF" && event.shiftKey) {
        event.preventDefault();
        handlers.frameSelection();
      } else if (event.code === "KeyF") {
        event.preventDefault();
        handlers.frameAll();
      } else if (event.code === "Digit0") {
        event.preventDefault();
        handlers.resetZoom();
      } else if ((event.metaKey || event.ctrlKey) && event.code === "KeyC") {
        event.preventDefault();
        void handlers.copySelectionToClipboard();
      } else if (event.code === "KeyC") {
        event.preventDefault();
        handlers.centerSelection();
      } else if ((event.metaKey || event.ctrlKey) && event.code === "KeyA") {
        event.preventDefault();
        handlers.selectAll();
      } else if ((event.metaKey || event.ctrlKey) && event.code === "KeyD") {
        event.preventDefault();
        handlers.duplicateSelection();
      } else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "KeyG") {
        event.preventDefault();
        handlers.ungroupSelection();
      } else if ((event.metaKey || event.ctrlKey) && event.code === "KeyG") {
        event.preventDefault();
        handlers.groupSelection();
      } else if (event.code === "KeyL") {
        event.preventDefault();
        handlers.toggleSelectedLocked();
      } else if (event.altKey && event.shiftKey && event.code === "KeyH") {
        event.preventDefault();
        handlers.unhideAllHidden();
      } else if (event.shiftKey && event.code === "KeyH") {
        event.preventDefault();
        handlers.unhideSelected();
      } else if (event.code === "KeyH") {
        event.preventDefault();
        handlers.hideSelected();
      } else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "KeyZ") {
        event.preventDefault();
        handlers.redoVisibilityChange();
      } else if ((event.metaKey || event.ctrlKey) && event.code === "KeyY") {
        event.preventDefault();
        handlers.redoVisibilityChange();
      } else if ((event.metaKey || event.ctrlKey) && event.code === "KeyZ") {
        event.preventDefault();
        handlers.undoVisibilityChange();
      } else if (event.key === "}" || (event.code === "BracketRight" && event.shiftKey)) {
        event.preventDefault();
        handlers.bringSelectionToFront();
      } else if (event.key === "{" || (event.code === "BracketLeft" && event.shiftKey)) {
        event.preventDefault();
        handlers.sendSelectionToBack();
      } else if (event.code === "BracketRight") {
        event.preventDefault();
        handlers.bringSelectionForward();
      } else if (event.code === "BracketLeft") {
        event.preventDefault();
        handlers.sendSelectionBackward();
      } else if (event.code === "Delete" || event.code === "Backspace") {
        event.preventDefault();
        handlers.deleteSelection();
      } else if (event.code === "Escape") {
        event.preventDefault();
        handlers.clearSelection();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        handlers.setSpacePressed(false);
      }
    };

    const onBlur = () => {
      handlers.setSpacePressed(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [handlers]);
}
