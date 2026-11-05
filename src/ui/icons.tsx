import type { ReactNode } from "react";

export type IconName =
  | "hand"
  | "selection"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "eraser"
  | "lock"
  | "unlock"
  | "undo"
  | "redo"
  | "sun"
  | "moon"
  | "plus"
  | "minus"
  | "trash"
  | "copy"
  | "layerFront"
  | "layerBack"
  | "layerForward"
  | "layerBackward"
  | "alignLeft"
  | "alignRight"
  | "alignTop"
  | "alignBottom"
  | "alignCenterH"
  | "alignCenterV"
  | "distributeH"
  | "distributeV"
  | "group"
  | "ungroup"
  | "flipH"
  | "flipV"
  | "copyStyle"
  | "pasteStyle"
  | "eyedropper"
  | "polygon"
  | "bindText"
  | "unbindText"
  | "wrapText"
  | "straight"
  | "curved";

const PATHS: Record<IconName, ReactNode> = {
  hand: <path d="M8 13V6.5a1.5 1.5 0 013 0V12 M11 11.5V4.5a1.5 1.5 0 013 0V12 M14 12V6.5a1.5 1.5 0 013 0V14c0 4.5-2.4 7-6 7-3 0-4.6-1.6-6.2-4.4l-1.7-3a1.5 1.5 0 012.5-1.6L8 14" />,
  selection: <path d="M5.5 3.5l13 7.6-5.7 1.6-2.4 5.9z" />,
  rectangle: <rect x="4" y="6" width="16" height="12" rx="2.5" />,
  diamond: <path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" />,
  ellipse: <ellipse cx="12" cy="12" rx="9" ry="6.5" />,
  arrow: <path d="M5 19L19 5 M10 5h9v9" />,
  line: <path d="M5 19L19 5" />,
  freedraw: <path d="M4 20l1-4.2L16.6 4.2a2.2 2.2 0 013.2 3.2L8.2 19z M14.5 6.3l3.2 3.2" />,
  text: <path d="M5 7V5h14v2 M12 5v14 M9 19h6" />,
  eraser: <path d="M9.5 19.5h9 M5.6 14.4l8.7-8.7a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8l-7 7H8.2z M9 10l5 5" />,
  lock: <path d="M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 017 0v3" />,
  unlock: <path d="M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 016.7-1.4" />,
  undo: <path d="M9 14L4 9l5-5 M4 9h10a6 6 0 010 12h-3" />,
  redo: <path d="M15 14l5-5-5-5 M20 9H10a6 6 0 000 12h3" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2 M12 19.3v2.2 M2.5 12h2.2 M19.3 12h2.2 M5.3 5.3l1.6 1.6 M17.1 17.1l1.6 1.6 M5.3 18.7l1.6-1.6 M17.1 6.9l1.6-1.6" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
  plus: <path d="M12 5v14 M5 12h14" />,
  minus: <path d="M5 12h14" />,
  trash: <path d="M5 7h14 M10 7V4h4v3 M7 7l1 13h8l1-13 M10 11v6 M14 11v6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </>
  ),
  layerFront: (
    <>
      <rect x="4" y="4" width="11" height="11" rx="1.5" />
      <rect x="9" y="9" width="11" height="11" rx="1.5" fill="currentColor" fillOpacity="0.35" />
    </>
  ),
  layerBack: (
    <>
      <rect x="4" y="4" width="11" height="11" rx="1.5" fill="currentColor" fillOpacity="0.35" />
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
    </>
  ),
  layerForward: (
    <>
      <rect x="5" y="11" width="10" height="9" rx="1.5" />
      <rect x="10" y="7" width="10" height="9" rx="1.5" fill="currentColor" fillOpacity="0.35" />
      <path d="M7 4h3 M8.5 4V1.5" />
    </>
  ),
  layerBackward: (
    <>
      <rect x="10" y="7" width="10" height="9" rx="1.5" />
      <rect x="5" y="11" width="10" height="9" rx="1.5" fill="currentColor" fillOpacity="0.35" />
      <path d="M17 20h3" />
    </>
  ),
  alignLeft: <path d="M4 4v16 M8 7h12 M8 13h8" />,
  alignRight: <path d="M20 4v16 M4 7h12 M8 13h8" />,
  alignTop: <path d="M4 4h16 M7 8v12 M13 8v8" />,
  alignBottom: <path d="M4 20h16 M7 4v12 M13 8v8" />,
  alignCenterH: <path d="M12 3v18 M5 8h14 M8 14h8" />,
  alignCenterV: <path d="M3 12h18 M8 5v14 M14 8v8" />,
  distributeH: <path d="M4 4v16 M20 4v16 M9 8h6v8H9z" />,
  distributeV: <path d="M4 4h16 M4 20h16 M8 9h8v6H8z" />,
  group: <path d="M4 4h16v16H4z M8 8h5v5H8z M11 11h5v5h-5z" />,
  ungroup: <path d="M4 4h7v7H4z M13 13h7v7h-7z" />,
  flipH: <path d="M12 3v18 M8 7L3 12l5 5z M16 7l5 5-5 5z" />,
  flipV: <path d="M3 12h18 M7 8l5-5 5 5z M7 16l5 5 5-5z" />,
  copyStyle: <path d="M5 19l4-1 8-8-3-3-8 8z M14 7l3 3 M16 5l2-2 3 3-2 2" />,
  pasteStyle: <path d="M8 4h8v3H8z M6 6h12v14H6z M10 12h4 M10 16h4" />,
  eyedropper: <path d="M13 7l4 4 M15.5 4.5l4 4-2 2-4-4z M13 7L5.5 14.5 4 20l5.5-1.5L17 11" />,
  polygon: <path d="M12 4l8 6-3 9H7l-3-9z" />,
  bindText: <path d="M4 6h16v12H4z M8 10h8 M8 14h5" />,
  unbindText: <path d="M4 6h16v12H4z M8 10h8 M8 14h5 M3 21L21 3" />,
  wrapText: <path d="M3 5h18v14H3z M9 16V9h6 M12 9v7" />,
  straight: <path d="M4 18L20 6" />,
  curved: <path d="M4 18C8 4 14 22 20 6" />,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
