import { AppErrorBoundary } from "@/components/layout/AppErrorBoundary";
import { AppShell } from "@/components/layout/AppShell";

export function App() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}
