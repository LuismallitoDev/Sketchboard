import type { Box } from "../geometry/bounds";
import type { Guide } from "../geometry/snap";
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

  /** The line or arrow whose points are being edited. */
  editingLinearId: string | null;
  selectedPoints: readonly number[];
  /** Colour picking from the canvas: which colour it will set, and the colour under the pointer. */
  eyedropper: { target: "stroke" | "background"; color: string | null; x: number; y: number } | null;
  dialog: "clear" | null;
  /** Style copied with "copy style", pasted onto other elements. */
  copiedStyle: Partial<ItemStyle> | null;

  /** Arrow ends attach to shapes they are dropped on. */
  arrowBinding: boolean;
  /** An attached arrow aims at the middle of the nearest side instead of where it was dropped. */
  midpointSnapping: boolean;
  /** Moving, resizing and drawing snap to other elements (alignment lines, equal gaps). */
  objectsSnap: boolean;
  gridMode: boolean;
  /** Alignment and gap guides shown while snapping (transient). */
  snapGuides: readonly Guide[];
  /** The shape an arrow end would attach to right now (transient). */
  bindingHighlight: string | null;

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
    editingLinearId: null,
    selectedPoints: [],
    eyedropper: null,
    dialog: null,
    copiedStyle: null,
    arrowBinding: true,
    midpointSnapping: false,
    objectsSnap: false,
    gridMode: false,
    snapGuides: [],
    bindingHighlight: null,
    theme: "system",
    viewBackgroundColor: DEFAULT_VIEW_BACKGROUND,
    currentItem: { ...DEFAULT_STYLE },
  };
}

/** The part of the app state saved with a scene (everything else is transient). */
export const PERSISTED_KEYS = [
  "offsetX",
  "offsetY",
  "zoom",
  "theme",
  "viewBackgroundColor",
  "currentItem",
  "arrowBinding",
  "midpointSnapping",
  "objectsSnap",
  "gridMode",
] as const;
export type PersistedState = Pick<AppState, (typeof PERSISTED_KEYS)[number]>;
