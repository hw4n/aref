import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App render failure", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: "grid",
            placeItems: "center",
            width: "100%",
            height: "100%",
            padding: "32px",
          }}
        >
          <div
            style={{
              maxWidth: "900px",
              borderRadius: "24px",
              border: "1px solid rgba(255, 114, 104, 0.4)",
              background: "rgba(24, 12, 12, 0.92)",
              color: "#fff1eb",
              padding: "24px",
              boxShadow: "0 20px 48px rgba(0, 0, 0, 0.34)",
              whiteSpace: "pre-wrap",
            }}
          >
            <strong style={{ display: "block", marginBottom: "12px" }}>
              Renderer error
            </strong>
            <code>{this.state.error.stack ?? this.state.error.message}</code>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
