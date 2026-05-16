import type { Point, Rect } from "./types";

export interface RectArrangementItem<TId = string> {
  id: TId;
  bounds: Rect;
  anchor: Point;
}

export interface RectArrangementUpdate<TId = string> {
  id: TId;
  position: Point;
}

export interface RectArrangementOptions {
  gap?: number;
}

const DEFAULT_RECT_ARRANGEMENT_GAP = 48;

function getRectsBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) {
    return null;
  }

  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function arrangeRectsWithoutOverlap<TId = string>(
  items: RectArrangementItem<TId>[],
  options: RectArrangementOptions = {},
): RectArrangementUpdate<TId>[] {
  if (items.length < 2) {
    return [];
  }

  const gap = Math.max(0, options.gap ?? DEFAULT_RECT_ARRANGEMENT_GAP);
  const selectionBounds = getRectsBounds(items.map((item) => item.bounds));

  if (!selectionBounds) {
    return [];
  }

  const orderedItems = [...items].sort((left, right) =>
    left.bounds.y - right.bounds.y
    || left.bounds.x - right.bounds.x,
  );
  const columnCount = Math.ceil(Math.sqrt(orderedItems.length));
  const rowCount = Math.ceil(orderedItems.length / columnCount);
  const cellWidth = Math.max(...orderedItems.map((item) => item.bounds.width));
  const cellHeight = Math.max(...orderedItems.map((item) => item.bounds.height));
  const totalWidth = columnCount * cellWidth + (columnCount - 1) * gap;
  const totalHeight = rowCount * cellHeight + (rowCount - 1) * gap;
  const originX = selectionBounds.x + (selectionBounds.width - totalWidth) / 2;
  const originY = selectionBounds.y + (selectionBounds.height - totalHeight) / 2;

  return orderedItems.map((item, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const cellX = originX + column * (cellWidth + gap);
    const cellY = originY + row * (cellHeight + gap);
    const boundsX = cellX + (cellWidth - item.bounds.width) / 2;
    const boundsY = cellY + (cellHeight - item.bounds.height) / 2;

    return {
      id: item.id,
      position: {
        x: Math.round(boundsX + item.anchor.x),
        y: Math.round(boundsY + item.anchor.y),
      },
    };
  });
}
