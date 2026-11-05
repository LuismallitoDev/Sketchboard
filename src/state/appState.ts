import type { Box } from "../geometry/bounds";
import { DEFAULT_STYLE, DEFAULT_VIEW_BACKGROUND } from "../scene/constants";
import type { ItemStyle } from "../scene/types";

export type ToolType =
  | "selection"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "eraser"
  | "hand";

export type Theme = "light" | "dark" | "system";

/**
 * Viewport convention: screen = scene * zoom + offset (CSS pixels, relative to the canvas).
 */
export interface AppState {
  tool: ToolType;
  /** Keep the tool active after drawing one element. */
  toolLocked: boolean;

  offsetX: number;
  offsetY: number;
  zoom: number;
  /** Canvas size in CSS pixels. */
  width: number;
  height: number;

  selectedIds: readonly string[];
  editingTextId: string | null;
  editingIsNew: boolean;
  /** Rubber-band rectangle while box-selecting (scene coordinates). */
  selectionBox: Box | null;
  /** Elements marked by the eraser, shown faded until the stroke ends. */
  erasingIds: readonly string[];
  cursor: string;

  theme: Theme;
  viewBackgroundColor: string;
  /** Style applied to the next element. */
  currentItem: ItemStyle;
}

export function defaultAppState(): AppState {
  return {
    tool: "selection",
    toolLocked: false,
    offsetX: 0,
    offsetY: 0,
    zoom: 1,
    width: 1280,
    height: 800,
    selectedIds: [],
    editingTextId: null,
    editingIsNew: false,
    selectionBox: null,
    erasingIds: [],
    cursor: "default",
    theme: "system",
    viewBackgroundColor: DEFAULT_VIEW_BACKGROUND,
    currentItem: { ...DEFAULT_STYLE },
  };
}

/** The part of the app state saved with a scene (everything else is transient). */
export const PERSISTED_KEYS = ["offsetX", "offsetY", "zoom", "theme", "viewBackgroundColor", "currentItem"] as const;
export type PersistedState = Pick<AppState, (typeof PERSISTED_KEYS)[number]>;
