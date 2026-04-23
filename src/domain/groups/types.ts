import type { ID } from "@/domain/shared/types";

export interface GroupItem {
  id: ID;
  name: string;
  assetIds: ID[];
  locked: boolean;
  hidden: boolean;
}
