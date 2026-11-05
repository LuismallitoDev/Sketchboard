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
  | "hand"
  | "frame"
  | "sticky"
  | "embed"
  | "laser"
  | "lasso"
  | "autoshape"
  | "bucket";

/** A point of the laser pointer's trail; `t` is when it was drawn (ms), so it can fade away. */
export interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

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
  dialog: "clear" | "embed" | null;
  /** Style copied with "copy style", pasted onto other elements. */
  copiedStyle: Partial<ItemStyle> | null;

  /** The image whose crop is being edited. */
  croppingId: string | null;
  /** The frame whose name is being edited. */
  editingFrameId: string | null;
  /** The embed being given its address (it exists on the canvas but has no address yet, or is being changed). */
  embedDraftId: string | null;
  /** The embed that receives the mouse (clicks go to the page inside it instead of the canvas). */
  activeEmbedId: string | null;
  /** The lasso being drawn (scene coordinates). */
  lassoPath: readonly (readonly [number, number])[];
  laserTrail: readonly LaserPoint[];
  /** A short message shown at the bottom of the screen. */
  notice: string | null;

  /** Touch input does nothing, so a resting hand cannot draw while a pen is used. */
  penMode: boolean;
  /** Frames show their outline and name and clip what is inside them. */
  frameRendering: boolean;

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
    croppingId: null,
    editingFrameId: null,
    embedDraftId: null,
    activeEmbedId: null,
    lassoPath: [],
    laserTrail: [],
    notice: null,
    penMode: false,
    frameRendering: true,
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
  "penMode",
  "frameRendering",
] as const;
export type PersistedState = Pick<AppState, (typeof PERSISTED_KEYS)[number]>;
