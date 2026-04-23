import type { ReactNode, SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
  strokeWidth?: number;
}

function IconBase({
  children,
  size = 18,
  strokeWidth = 1.8,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {children}
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function ImportIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3v11" />
      <path d="m8 10 4 4 4-4" />
      <path d="M4 20h16" />
    </IconBase>
  );
}

export function NewProjectIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

export function OpenProjectIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 8h5l2 2h9v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
      <path d="M4 8V6a1 1 0 0 1 1-1h4l2 2" />
    </IconBase>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z" />
      <path d="M8 5v6h8" />
      <path d="M8 19v-5h8v5" />
    </IconBase>
  );
}

export function SaveAsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 5h11l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z" />
      <path d="M8 5v6h8" />
      <path d="m9 16 2 2 4-4" />
    </IconBase>
  );
}

export function FrameAllIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 9V4h5" />
      <path d="M15 4h5v5" />
      <path d="M20 15v5h-5" />
      <path d="M9 20H4v-5" />
    </IconBase>
  );
}

export function FitSelectionIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="10" rx="1" width="10" x="7" y="7" />
      <path d="M4 9V4h5" />
      <path d="M15 4h5v5" />
      <path d="M20 15v5h-5" />
      <path d="M9 20H4v-5" />
    </IconBase>
  );
}

export function CenterSelectionIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
    </IconBase>
  );
}

export function ResetZoomIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M21 21l-4.35-4.35" />
      <path d="M8.5 11H13.5" />
    </IconBase>
  );
}

export function BoardIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="14" rx="1" width="14" x="5" y="5" />
      <path d="M9 9h6" />
      <path d="M9 13h4" />
    </IconBase>
  );
}

export function AssetsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="10" rx="1" width="10" x="4" y="4" />
      <rect height="10" rx="1" width="10" x="10" y="10" />
    </IconBase>
  );
}

export function SelectionIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 5h4" />
      <path d="M15 5h4v4" />
      <path d="M19 15v4h-4" />
      <path d="M9 19H5v-4" />
      <path d="m9 9 6 6" />
    </IconBase>
  );
}

export function ZoomIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="M21 21l-4.35-4.35" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </IconBase>
  );
}

export function PanIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 11V6a1 1 0 0 1 2 0v4" />
      <path d="M11 10V5a1 1 0 0 1 2 0v5" />
      <path d="M15 11V7a1 1 0 0 1 2 0v7" />
      <path d="M5 13V9a1 1 0 0 1 2 0v4" />
      <path d="M5 13c0 4 2.5 7 7 7s7-2.5 7-7v-1" />
    </IconBase>
  );
}

export function MarqueeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 9V4h5" />
      <path d="M15 4h5v5" />
      <path d="M20 15v5h-5" />
      <path d="M9 20H4v-5" />
      <path d="M9 9h6v6H9z" />
    </IconBase>
  );
}

export function DuplicateIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="10" rx="1" width="10" x="9" y="9" />
      <path d="M15 5H6a1 1 0 0 0-1 1v9" />
    </IconBase>
  );
}

export function DeleteIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12h10l1-12" />
      <path d="M9 7V4h6v3" />
    </IconBase>
  );
}

export function RecentIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 7v5l3 2" />
      <circle cx="12" cy="12" r="8" />
    </IconBase>
  );
}

export function KindIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect height="14" rx="1" width="14" x="5" y="5" />
      <path d="m8 14 2.5-2.5 2 2 3.5-4.5" />
    </IconBase>
  );
}

export function SourceIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M6 7V5h12v2" />
      <path d="M7 11h10" />
      <path d="M7 15h7" />
      <path d="M6 19h12a1 1 0 0 0 1-1V7H5v11a1 1 0 0 0 1 1Z" />
    </IconBase>
  );
}

export function SizeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m8 8-3 3 3 3" />
      <path d="m16 8 3 3-3 3" />
      <path d="M5 11h14" />
    </IconBase>
  );
}

export function PositionIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
    </IconBase>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z" />
      <path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7Z" />
      <path d="m5 13 .9 2.6L8.5 17l-2.6.9L5 20.5l-.9-2.6L1.5 17l2.6-.9Z" />
    </IconBase>
  );
}

export function RetryIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 5v6h-6" />
      <path d="M20 11a8 8 0 1 0 2 5.3" />
    </IconBase>
  );
}

export function CancelIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="6" y="6" width="12" height="12" />
    </IconBase>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="m9 12 2 2 4-4" />
    </IconBase>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4 3 20h18Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </IconBase>
  );
}

export function QueueIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 7h10" />
      <path d="M8 12h10" />
      <path d="M8 17h10" />
      <circle cx="4" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="17" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function RunningIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </IconBase>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="6" y="11" width="12" height="9" rx="1" />
      <path d="M8.5 11V8a3.5 3.5 0 1 1 7 0v3" />
    </IconBase>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.5 12S6.5 5.5 12 5.5 21.5 12 21.5 12 17.5 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </IconBase>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.4 6.1A9.5 9.5 0 0 1 12 5.5c5.5 0 9.5 6.5 9.5 6.5a18 18 0 0 1-3.6 4.3" />
      <path d="M6.1 10.3A17 17 0 0 0 2.5 12s4 6.5 9.5 6.5a9.8 9.8 0 0 0 3-.5" />
      <path d="M9.9 9.9A3 3 0 0 0 12 15a3 3 0 0 0 2.1-.9" />
    </IconBase>
  );
}

export function GroupIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="6" width="7" height="7" />
      <rect x="13" y="6" width="7" height="7" />
      <rect x="8.5" y="14" width="7" height="6" />
    </IconBase>
  );
}

export function LayersFrontIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="8" y="8" width="11" height="11" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
      <path d="m14 4 2 2" />
    </IconBase>
  );
}

export function LayersBackIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5" y="5" width="11" height="11" />
      <path d="M10 19h10a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1" />
      <path d="m10 20 2-2" />
    </IconBase>
  );
}

export function LayersUpIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5" y="8" width="14" height="10" />
      <path d="m12 4 4 4" />
      <path d="m12 4-4 4" />
    </IconBase>
  );
}

export function LayersDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5" y="6" width="14" height="10" />
      <path d="m8 20 4-4" />
      <path d="m16 20-4-4" />
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3.8a7 7 0 0 0-1.7-1L14.5 3h-5L9.1 5.8a7 7 0 0 0-1.7 1l-2.3-.8-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.3-.8a7 7 0 0 0 1.7 1l.4 2.8h5l.4-2.8a7 7 0 0 0 1.7-1l2.3.8 2-3.5-2-1.5c.1-.3.1-.7.1-1Z" />
    </IconBase>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m13 5-2 14" />
    </IconBase>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="m7 10 3 2-3 2" />
      <path d="M13 15h4" />
    </IconBase>
  );
}

export function PanelLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <line x1="9" x2="9" y1="3" y2="21" />
    </IconBase>
  );
}

export function PanelRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <line x1="15" x2="15" y1="3" y2="21" />
    </IconBase>
  );
}
