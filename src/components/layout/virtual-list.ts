export interface VirtualWindowRange {
  endIndex: number;
  offsetTop: number;
  startIndex: number;
  totalHeight: number;
}

export function getVirtualWindowRange({
  gap,
  itemCount,
  itemHeight,
  overscan,
  scrollTop,
  viewportHeight,
}: {
  gap: number;
  itemCount: number;
  itemHeight: number;
  overscan: number;
  scrollTop: number;
  viewportHeight: number;
}): VirtualWindowRange {
  if (itemCount <= 0) {
    return {
      endIndex: 0,
      offsetTop: 0,
      startIndex: 0,
      totalHeight: 0,
    };
  }

  const itemStride = itemHeight + gap;
  const safeStride = Math.max(itemStride, 1);
  const safeViewportHeight = Math.max(viewportHeight, itemHeight);
  const startIndex = Math.max(0, Math.floor(Math.max(scrollTop, 0) / safeStride) - overscan);
  const visibleCount = Math.ceil(safeViewportHeight / safeStride) + overscan * 2;
  const endIndex = Math.min(itemCount, startIndex + visibleCount);

  return {
    endIndex,
    offsetTop: startIndex * safeStride,
    startIndex,
    totalHeight: itemCount * itemHeight + Math.max(0, itemCount - 1) * gap,
  };
}
