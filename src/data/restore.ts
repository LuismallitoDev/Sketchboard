import { layoutText } from "../geometry/text";
import { DEFAULT_STYLE, LINE_HEIGHT, MAX_ZOOM, MIN_ZOOM } from "../scene/constants";
import { newId, newNonce, newSeed } from "../scene/ids";
import { linearPatchFromAbs } from "../scene/linear";
import type {
  ArrowType,
  Arrowhead,
  Binding,
  ElementType,
  FillStyle,
  FontFamily,
  ImageCrop,
  ItemStyle,
  Pt,
  SketchElement,
  StrokeStyle,
  TextAlign,
  VerticalAlign,
} from "../scene/types";
import type { PersistedState, Theme } from "../state/appState";

const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string): string => (typeof v === "string" ? v : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
function oneOf<T extends string>(v: unknown, list: readonly T[], d: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d;
}

const TYPES: readonly ElementType[] = ["rectangle", "diamond", "ellipse", "line", "arrow", "freedraw", "text", "image", "frame", "embeddable"];
const FILLS: readonly FillStyle[] = ["hachure", "cross-hatch", "solid", "zigzag"];
const STROKES: readonly StrokeStyle[] = ["solid", "dashed", "dotted"];
const FONTS: readonly FontFamily[] = ["hand", "normal", "code"];
const ALIGNS: readonly TextAlign[] = ["left", "center", "right"];
const VALIGNS: readonly VerticalAlign[] = ["top", "middle", "bottom"];
const ARROW_TYPES: readonly ArrowType[] = ["sharp", "round", "elbow"];
const ARROWHEADS: readonly Arrowhead[] = [
  "arrow",
  "bar",
  "circle",
  "circle_outline",
  "triangle",
  "triangle_outline",
  "diamond",
  "diamond_outline",
  "crowfoot_many",
  "crowfoot_one",
  "crowfoot_one_or_many",
  "cardinality_exactly_one",
  "cardinality_zero_or_one",
  "cardinality_zero_or_many",
];
const THEMES: readonly Theme[] = ["light", "dark", "system"];

function restorePoints(v: unknown): Pt[] | null {
  if (!Array.isArray(v)) return null;
  const out: Pt[] = [];
  for (const p of v) {
    if (!Array.isArray(p) || typeof p[0] !== "number" || typeof p[1] !== "number" || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
    out.push([p[0], p[1]]);
  }
  return out;
}

/** An arrow end attached to a shape; anything malformed is dropped (the arrow keeps its position, unattached). */
function restoreBinding(v: unknown): Binding | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const focus = Array.isArray(b.focus) && b.focus.length === 2 && b.focus.every((n) => typeof n === "number" && Number.isFinite(n)) ? (b.focus as Pt) : [0.5, 0.5];
  if (typeof b.elementId !== "string" || b.elementId === "") return null;
  return { elementId: b.elementId, gap: Math.max(0, num(b.gap, 6)), focus: [focus[0], focus[1]] };
}

function nullableArrowhead(v: unknown, d: Arrowhead | null): Arrowhead | null {
  if (v === null) return null;
  return oneOf(v, ARROWHEADS, d ?? "arrow") as Arrowhead;
}

/** Validates one element from untrusted data (a file, the clipboard, local storage). Returns null when unusable. */
export function restoreElement(raw: unknown): SketchElement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = oneOf(r.type, TYPES, "rectangle");
  if (r.type !== type) return null;

  const base = {
    id: typeof r.id === "string" && r.id ? r.id : newId(),
    x: num(r.x, 0),
    y: num(r.y, 0),
    width: Math.abs(num(r.width, 0)),
    height: Math.abs(num(r.height, 0)),
    angle: num(r.angle, 0),
    strokeColor: str(r.strokeColor, DEFAULT_STYLE.strokeColor),
    backgroundColor: str(r.backgroundColor, "transparent"),
    fillStyle: oneOf(r.fillStyle, FILLS, DEFAULT_STYLE.fillStyle),
    strokeWidth: Math.max(0.5, num(r.strokeWidth, DEFAULT_STYLE.strokeWidth)),
    strokeStyle: oneOf(r.strokeStyle, STROKES, "solid"),
    roughness: Math.min(2, Math.max(0, num(r.roughness, DEFAULT_STYLE.roughness))),
    opacity: Math.min(100, Math.max(0, num(r.opacity, 100))),
    roundness: bool(r.roundness, DEFAULT_STYLE.roundness),
    seed: num(r.seed, newSeed()),
    version: Math.max(1, Math.floor(num(r.version, 1))),
    versionNonce: num(r.versionNonce, newNonce()),
    groupIds: Array.isArray(r.groupIds) ? r.groupIds.filter((g): g is string => typeof g === "string") : [],
    frameId: typeof r.frameId === "string" ? r.frameId : null,
    boundElements: Array.isArray(r.boundElements)
      ? r.boundElements.filter(
          (b): b is { id: string; type: "arrow" | "text" } =>
            !!b && typeof b === "object" && typeof (b as { id?: unknown }).id === "string" && ["arrow", "text"].includes((b as { type?: string }).type ?? ""),
        )
      : null,
    link: typeof r.link === "string" ? r.link : null,
    locked: bool(r.locked, false),
    isDeleted: bool(r.isDeleted, false),
  };

  switch (type) {
    case "rectangle":
    case "diamond":
    case "ellipse":
      return { ...base, type };
    case "line":
    case "arrow": {
      const pts = restorePoints(r.points);
      if (!pts || pts.length < 2) return null;
      const abs = pts.map((p): Pt => [base.x + p[0], base.y + p[1]]);
      return {
        ...base,
        type,
        ...linearPatchFromAbs(abs),
        startArrowhead: type === "arrow" ? nullableArrowhead(r.startArrowhead, null) : null,
        endArrowhead: type === "arrow" ? nullableArrowhead(r.endArrowhead, "arrow") : null,
        arrowType: oneOf(r.arrowType, ARROW_TYPES, "sharp"),
        polygon: type === "line" && bool(r.polygon, false) && pts.length >= 4,
        startBinding: type === "arrow" ? restoreBinding(r.startBinding) : null,
        endBinding: type === "arrow" ? restoreBinding(r.endBinding) : null,
      };
    }
    case "freedraw": {
      const pts = restorePoints(r.points);
      if (!pts || pts.length < 1) return null;
      const abs = pts.map((p): Pt => [base.x + p[0], base.y + p[1]]);
      const pressures = Array.isArray(r.pressures) ? r.pressures.filter((p): p is number => typeof p === "number") : [];
      return {
        ...base,
        type,
        backgroundColor: "transparent",
        ...linearPatchFromAbs(abs),
        pressures: pressures.length === pts.length ? pressures : [],
        simulatePressure: bool(r.simulatePressure, true),
      };
    }
    case "text": {
      const text = str(r.text, "");
      const fontSize = Math.max(4, num(r.fontSize, DEFAULT_STYLE.fontSize));
      const fontFamily = oneOf(r.fontFamily, FONTS, DEFAULT_STYLE.fontFamily);
      const lineHeight = num(r.lineHeight, LINE_HEIGHT);
      const wrapWidth = typeof r.wrapWidth === "number" && Number.isFinite(r.wrapWidth) && r.wrapWidth > 0 ? r.wrapWidth : null;
      const containerId = typeof r.containerId === "string" ? r.containerId : null;
      const m = layoutText(text, fontSize, fontFamily, lineHeight, wrapWidth);
      return {
        ...base,
        type,
        backgroundColor: "transparent",
        // Bound text is laid out by its container; free text fits itself or wraps at its width.
        width: wrapWidth !== null && !containerId ? wrapWidth : m.width,
        height: m.height,
        text,
        fontSize,
        fontFamily,
        textAlign: oneOf(r.textAlign, ALIGNS, "left"),
        verticalAlign: oneOf(r.verticalAlign, VALIGNS, "top"),
        containerId,
        lineHeight,
        autoResize: wrapWidth === null && !containerId,
        wrapWidth,
      };
    }
    case "image": {
      const fileId = typeof r.fileId === "string" && r.fileId ? r.fileId : null;
      const flip = (v: unknown): number => (v === -1 ? -1 : 1);
      const scale: [number, number] = Array.isArray(r.scale) ? [flip(r.scale[0]), flip(r.scale[1])] : [1, 1];
      // An image that never got stored cannot be shown again.
      const status = fileId ? oneOf(r.status, ["pending", "saved", "error"] as const, "saved") : "error";
      return { ...base, type, fileId, status, scale, crop: restoreCrop(r.crop) };
    }
    case "frame":
      return { ...base, type, name: typeof r.name === "string" ? r.name : null };
    case "embeddable":
      return { ...base, type };
  }
}

function restoreCrop(v: unknown): ImageCrop | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const nums = ["x", "y", "width", "height", "naturalWidth", "naturalHeight"].map((k) => c[k]);
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [x, y, width, height, naturalWidth, naturalHeight] = nums as number[];
  if (width <= 0 || height <= 0 || naturalWidth <= 0 || naturalHeight <= 0) return null;
  // Keep the crop inside the picture.
  const cx = Math.min(Math.max(x, 0), naturalWidth - 1);
  const cy = Math.min(Math.max(y, 0), naturalHeight - 1);
  return { x: cx, y: cy, width: Math.min(width, naturalWidth - cx), height: Math.min(height, naturalHeight - cy), naturalWidth, naturalHeight };
}

/** Restores a list of elements, dropping unusable ones and duplicate ids. */
export function restoreElements(raw: unknown): SketchElement[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SketchElement[] = [];
  for (const item of raw) {
    const el = restoreElement(item);
    if (!el || seen.has(el.id)) continue;
    seen.add(el.id);
    out.push(el);
  }
  return out;
}

export function restoreItemStyle(raw: unknown): ItemStyle {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_STYLE;
  return {
    strokeColor: str(r.strokeColor, d.strokeColor),
    backgroundColor: str(r.backgroundColor, d.backgroundColor),
    fillStyle: oneOf(r.fillStyle, FILLS, d.fillStyle),
    strokeWidth: num(r.strokeWidth, d.strokeWidth),
    strokeStyle: oneOf(r.strokeStyle, STROKES, d.strokeStyle),
    roughness: num(r.roughness, d.roughness),
    opacity: num(r.opacity, d.opacity),
    roundness: bool(r.roundness, d.roundness),
    fontFamily: oneOf(r.fontFamily, FONTS, d.fontFamily),
    fontSize: num(r.fontSize, d.fontSize),
    textAlign: oneOf(r.textAlign, ALIGNS, d.textAlign),
    startArrowhead: nullableArrowhead(r.startArrowhead, d.startArrowhead),
    endArrowhead: nullableArrowhead(r.endArrowhead, d.endArrowhead),
    arrowType: oneOf(r.arrowType, ARROW_TYPES, d.arrowType),
    lineCurved: bool(r.lineCurved, d.lineCurved),
    simulatePressure: bool(r.simulatePressure, d.simulatePressure),
  };
}

export function restoreAppState(raw: unknown): Partial<PersistedState> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<PersistedState> = {};
  if (typeof r.offsetX === "number" && Number.isFinite(r.offsetX)) out.offsetX = r.offsetX;
  if (typeof r.offsetY === "number" && Number.isFinite(r.offsetY)) out.offsetY = r.offsetY;
  if (typeof r.zoom === "number" && Number.isFinite(r.zoom)) out.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, r.zoom));
  if (typeof r.theme === "string") out.theme = oneOf(r.theme, THEMES, "system");
  if (typeof r.viewBackgroundColor === "string") out.viewBackgroundColor = r.viewBackgroundColor;
  for (const flag of ["arrowBinding", "midpointSnapping", "objectsSnap", "gridMode", "penMode", "frameRendering"] as const) {
    if (typeof r[flag] === "boolean") out[flag] = r[flag] as boolean;
  }
  if (r.currentItem !== undefined) out.currentItem = restoreItemStyle(r.currentItem);
  return out;
}
