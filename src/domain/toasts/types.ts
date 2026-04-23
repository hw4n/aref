export type ToastKind = "info" | "success" | "error";

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  createdAt: string;
}
