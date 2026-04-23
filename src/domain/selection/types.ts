import type { ID, Rect } from "@/domain/shared/types";

export interface SelectionState {
  assetIds: ID[];
  marquee: Rect | null;
  lastActiveAssetId: ID | null;
}
