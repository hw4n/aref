import { useEffect } from "react";

import {
  AlertIcon,
  CheckCircleIcon,
  SparklesIcon,
} from "@/components/icons/ui-icons";
import { useAppStore } from "@/state/app-store";

const TOAST_LIFETIME_MS = 4200;

function ToastKindIcon({ kind }: { kind: "info" | "success" | "error" }) {
  if (kind === "success") {
    return <CheckCircleIcon size={16} />;
  }

  if (kind === "error") {
    return <AlertIcon size={16} />;
  }

  return <SparklesIcon size={16} />;
}

export function ToastViewport() {
  const dismissToast = useAppStore((state) => state.dismissToast);
  const toasts = useAppStore((state) => state.toasts);

  return (
    <div className="toast-viewport" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          kind={toast.kind}
          title={toast.title}
          description={toast.description}
          onDismiss={dismissToast}
        />
      ))}
    </div>
  );
}

function ToastItem({
  id,
  kind,
  title,
  description,
  onDismiss,
}: {
  id: string;
  kind: "info" | "success" | "error";
  title: string;
  description?: string;
  onDismiss: (toastId: string) => void;
}) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onDismiss(id);
    }, TOAST_LIFETIME_MS);

    return () => window.clearTimeout(timeoutId);
  }, [id, onDismiss]);

  return (
    <div className={`toast toast--${kind}`}>
      <span className="toast__icon">
        <ToastKindIcon kind={kind} />
      </span>
      <div className="toast__body">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <button className="toast__close" onClick={() => onDismiss(id)} title="Dismiss notification">
        ×
      </button>
    </div>
  );
}
