import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialCamera, resizeViewport } from "@/domain/camera/camera-math";
import { createEmptyProject, createSampleProject } from "@/domain/project/sample-project";
import { appStore } from "@/state/app-store";

import { CanvasStage } from "./CanvasStage";

vi.mock("@/features/canvas/hooks/use-stage-container-size", () => ({
  useStageContainerSize: () => ({ width: 1200, height: 800 }),
}));

vi.mock("react-konva", async () => {
  const React = await vi.importActual<typeof import("react")>("react");

  function createNode() {
    return {
      batchDraw: () => undefined,
      forceUpdate: () => undefined,
      getLayer: () => ({ batchDraw: () => undefined }),
      nodes: () => undefined,
      position: () => undefined,
      rotation: () => 0,
      scaleX: () => 1,
      scaleY: () => 1,
      x: () => 0,
      y: () => 0,
    };
  }

  function createMockComponent(name: string) {
    return React.forwardRef<unknown, { children?: React.ReactNode }>((props, ref) => {
      React.useImperativeHandle(ref, createNode);

      return React.createElement("div", { "data-konva": name }, props.children);
    });
  }

  const Stage = React.forwardRef<
    unknown,
    {
      children?: React.ReactNode;
      onMouseDown?: (event: { target: unknown; evt: MouseEvent }) => void;
      onMouseMove?: (event: { target: unknown; evt: MouseEvent }) => void;
      onMouseUp?: (event: { target: unknown; evt: MouseEvent }) => void;
      onMouseLeave?: () => void;
    }
  >((props, ref) => {
    const pointerRef = React.useRef({ x: 600, y: 400 });
    const stageRef = React.useRef<{
      getPointerPosition: () => { x: number; y: number };
      getStage: () => unknown;
    } | null>(null);

    if (!stageRef.current) {
      stageRef.current = {
        getPointerPosition: () => pointerRef.current,
        getStage: () => stageRef.current,
      };
    }

    React.useImperativeHandle(ref, () => stageRef.current);

    const createMouseHandler =
      (handler?: (event: { target: unknown; evt: MouseEvent }) => void) =>
      (event: React.MouseEvent<HTMLDivElement>) => {
        pointerRef.current = {
          x: event.clientX,
          y: event.clientY,
        };
        handler?.({
          target: stageRef.current,
          evt: event.nativeEvent,
        });
      };

    return React.createElement(
      "div",
      {
        "data-testid": "mock-stage",
        onMouseDown: createMouseHandler(props.onMouseDown),
        onMouseMove: createMouseHandler(props.onMouseMove),
        onMouseUp: createMouseHandler(props.onMouseUp),
        onMouseLeave: props.onMouseLeave,
      },
      props.children,
    );
  });

  return {
    Circle: createMockComponent("circle"),
    Group: createMockComponent("group"),
    Image: createMockComponent("image"),
    Layer: createMockComponent("layer"),
    Rect: createMockComponent("rect"),
    Stage,
    Text: createMockComponent("text"),
    Transformer: createMockComponent("transformer"),
  };
});

describe("CanvasStage", () => {
  beforeEach(() => {
    appStore.getState().replaceProject(createEmptyProject());
    appStore.getState().setSpacePressed(false);
    appStore.getState().setCanvasInteractionActive(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
  });

  it("re-applies the measured viewport after replacing the project", async () => {
    render(<CanvasStage />);

    await waitFor(() => {
      expect(appStore.getState().project.camera.viewportWidth).toBe(1200);
      expect(appStore.getState().project.camera.viewportHeight).toBe(800);
    });

    act(() => {
      appStore.getState().replaceProject(createEmptyProject());
    });

    await waitFor(() => {
      expect(appStore.getState().project.camera.viewportWidth).toBe(1200);
      expect(appStore.getState().project.camera.viewportHeight).toBe(800);
    });
  });

  it("clears a multi-selection when the empty canvas is clicked quickly", async () => {
    const project = createSampleProject();

    appStore.getState().replaceProject({
      ...project,
      camera: resizeViewport(createInitialCamera(), 1200, 800),
      selection: {
        assetIds: ["asset-forest", "asset-portrait"],
        marquee: null,
        lastActiveAssetId: "asset-portrait",
      },
    });

    render(<CanvasStage />);

    const stage = screen.getByTestId("mock-stage");

    act(() => {
      stage.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        clientX: 640,
        clientY: 420,
      }));
      stage.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
        clientX: 640,
        clientY: 420,
      }));
    });

    await waitFor(() => {
      expect(appStore.getState().project.selection.assetIds).toEqual([]);
      expect(appStore.getState().project.selection.marquee).toBeNull();
    });
  });
});
