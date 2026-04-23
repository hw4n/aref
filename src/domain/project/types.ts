import type { AssetItem } from "@/domain/assets/types";
import type { CameraState } from "@/domain/camera/types";
import type { GroupItem } from "@/domain/groups/types";
import type { GenerationJob } from "@/domain/jobs/types";
import type { SelectionState } from "@/domain/selection/types";
import type { ID } from "@/domain/shared/types";

export interface Project {
  id: ID;
  name: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  camera: CameraState;
  assets: Record<ID, AssetItem>;
  groups: Record<ID, GroupItem>;
  selection: SelectionState;
  jobs: Record<ID, GenerationJob>;
}
