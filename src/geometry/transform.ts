import { MIN_SIZE } from "../scene/constants";
import { linearPatchFromAbs, pointsBBox } from "../scene/linear";
import { isPointsElement, type Pt, type SketchElement } from "../scene/types";
import { boundsToBox, boxCenter, getCommonBounds, getLocalBox, type Box } from "./bounds";
import { distance, normalizeAngle, rotatePoint, type Point } from "./math";
import { layoutText, measureText } from "./text";

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type HandleName = ResizeHandle | "rotate";

export const RESIZE_HANDLES: readonly ResizeHandle[] = ["nw", "ne", "se", "sw", "n", "e", "s", "w"];
export const CORNER_HANDLES: readonly ResizeHandle[] = ["nw", "ne", "se", "sw"];

/** Direction of each handle: -1 / 0 / 1 along x and y. */
export const HANDLE_DIRS: Record<ResizeHandle, readonly [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
};

export const HANDLE_PAD = 6; // screen px between the element and its selection frame
export const HANDLE_RADIUS = 8; // screen px hit radius
export const ROTATE_OFFSET = 26; // screen px above the frame

/** The rectangle the selection handles are drawn around: the element's own box (rotated), or the group's bounds. */
export interface Frame {
  box: Box;
  angle: number;
}

export function getSelectionFrame(els: readonly SketchElement[]): Frame | null {
  if (els.length === 0) return null;
  if (els.length === 1) return { box: getLocalBox(els[0]), angle: els[0].angle };
  const b = getCommonBounds(els);
  return b ? { box: boundsToBox(b), angle: 0 } : null;
}

/** Actual (unpadded) position of a resize handle: a corner or edge midpoint of the frame, rotated. */
export function handleAnchorPoint(frame: Frame, name: ResizeHandle): Point {
  const [sx, sy] = HANDLE_DIRS[name];
  const { box } = frame;
  const p: Point = [box.x + ((sx + 1) / 2) * box.width, box.y + ((sy + 1) / 2) * box.height];
  return rotatePoint(p, boxCenter(box), frame.angle);
}

/** Where handles are drawn (padded outwards), in scene coordinates. */
export function handlePositions(frame: Frame, zoom: number): Record<HandleName, Point> {
  const pad = HANDLE_PAD / zoom;
  const { box } = frame;
  const c = boxCenter(box);
  const px = box.x - pad;
  const py = box.y - pad;
  const pw = box.width + pad * 2;
  const ph = box.height + pad * 2;
  const at = (sx: number, sy: number): Point => rotatePoint([px + ((sx + 1) / 2) * pw, py + ((sy + 1) / 2) * ph], c, frame.angle);
  return {
    nw: at(-1, -1),
    n: at(0, -1),
    ne: at(1, -1),
    e: at(1, 0),
    se: at(1, 1),
    s: at(0, 1),
    sw: at(-1, 1),
    w: at(-1, 0),
    rotate: rotatePoint([c[0], py - ROTATE_OFFSET / zoom], c, frame.angle),
  };
}

export function hitHandle(frame: Frame, p: Point, zoom: number, allowed: readonly HandleName[]): HandleName | null {
  const pos = handlePositions(frame, zoom);
  const r = HANDLE_RADIUS / zoom;
  for (const name of ["rotate", ...CORNER_HANDLES, "n", "e", "s", "w"] as HandleName[]) {
    if (allowed.includes(name) && distance(p, pos[name]) <= r) return name;
  }
  return null;
}

/** Applies `box` to one element: shapes take it directly, points are scaled, text scales its font size. */
export function resizeElementToBox(el: SketchElement, nb: Box): Partial<SketchElement> {
  const b0 = getLocalBox(el);
  if (el.type === "text") {
    const s = b0.height > 0 ? nb.height / b0.height : 1;
    const fontSize = Math.max(8, Math.round(el.fontSize * s));
    // A fixed-width text keeps its proportions: the wrap width scales along with the font.
    const wrapWidth = el.wrapWidth === null ? null : Math.max(fontSize, el.wrapWidth * (fontSize / el.fontSize));
    const m = layoutText(el.text, fontSize, el.fontFamily, el.lineHeight, wrapWidth);
    const width = wrapWidth ?? m.width;
    const cx = nb.x + nb.width / 2;
    const cy = nb.y + nb.height / 2;
    return { fontSize, wrapWidth, width, height: m.height, x: cx - width / 2, y: cy - m.height / 2 };
  }
  if (isPointsElement(el)) {
    const kx = b0.width > 0 ? nb.width / b0.width : 1;
    const ky = b0.height > 0 ? nb.height / b0.height : 1;
    const min = pointsBBox(el.points);
    const abs = el.points.map((p): Pt => [nb.x + (p[0] - min.minX) * kx, nb.y + (p[1] - min.minY) * ky]);
    return linearPatchFromAbs(abs);
  }
  return { x: nb.x, y: nb.y, width: nb.width, height: nb.height };
}

export type ElementPatches = Array<[string, Partial<SketchElement>]>;

/**
 * Resizes the selection by dragging `handle` to `pointer` (already corrected for the grab offset).
 * The opposite handle stays fixed in the scene, also for rotated single elements.
 */
export function resizeSelection(
  originals: readonly SketchElement[],
  frame: Frame,
  handle: ResizeHandle,
  pointer: Point,
  keepAspect: boolean,
): ElementPatches {
  const { box, angle } = frame;
  const c = boxCenter(box);
  const [sx, sy] = HANDLE_DIRS[handle];
  const ax = sx === 1 ? 0 : sx === -1 ? 1 : 0.5;
  const ay = sy === 1 ? 0 : sy === -1 ? 1 : 0.5;
  const anchor = rotatePoint([box.x + ax * box.width, box.y + ay * box.height], c, angle);
  // Pointer relative to the anchor, in the frame's own (unrotated) axes.
  const rel = rotatePoint(pointer, anchor, -angle);
  const dx = rel[0] - anchor[0];
  const dy = rel[1] - anchor[1];

  let nw = sx === 0 ? box.width : Math.max(MIN_SIZE, sx * dx);
  let nh = sy === 0 ? box.height : Math.max(MIN_SIZE, sy * dy);

  // Dragging a side handle of a single text changes its wrap width instead of scaling the font.
  const single = originals.length === 1 ? originals[0] : null;
  const textSide = single?.type === "text" && sy === 0;
  if (textSide) nw = Math.max(nw, single.fontSize);

  const uniform =
    !textSide &&
    (keepAspect || originals.some((e) => e.type === "text") || (originals.length > 1 && originals.some((e) => e.angle !== 0)));
  if (uniform) {
    const kx = box.width > 0 ? nw / box.width : 1;
    const ky = box.height > 0 ? nh / box.height : 1;
    const s = sx !== 0 && sy !== 0 ? Math.max(kx, ky) : sx !== 0 ? kx : ky;
    nw = box.width * s;
    nh = box.height * s;
  }

  const newCenter = rotatePoint([anchor[0] + (0.5 - ax) * nw, anchor[1] + (0.5 - ay) * nh], anchor, angle);
  const newBox: Box = { x: newCenter[0] - nw / 2, y: newCenter[1] - nh / 2, width: nw, height: nh };

  if (single?.type === "text" && textSide) {
    const m = layoutText(single.text, single.fontSize, single.fontFamily, single.lineHeight, newBox.width);
    return [[single.id, { x: newBox.x, y: newBox.y, width: newBox.width, height: m.height, wrapWidth: newBox.width, autoResize: false }]];
  }
  if (originals.length === 1) return [[originals[0].id, resizeElementToBox(originals[0], newBox)]];

  // Group: map each element's box through the group-box change (the group frame is unrotated).
  const scaleX = box.width > 0 ? nw / box.width : 1;
  const scaleY = box.height > 0 ? nh / box.height : 1;
  return originals.map((el): [string, Partial<SketchElement>] => {
    const eb = getLocalBox(el);
    const ec = boxCenter(eb);
    const nc: Point = [newBox.x + (ec[0] - box.x) * scaleX, newBox.y + (ec[1] - box.y) * scaleY];
    const kx = el.angle !== 0 ? (scaleX + scaleY) / 2 : scaleX;
    const ky = el.angle !== 0 ? (scaleX + scaleY) / 2 : scaleY;
    const ew = eb.width * kx;
    const eh = eb.height * ky;
    return [el.id, resizeElementToBox(el, { x: nc[0] - ew / 2, y: nc[1] - eh / 2, width: ew, height: eh })];
  });
}

/** Rotates elements by `delta` around `center`: each turns about its own centre and orbits the group centre. */
export function rotateSelection(originals: readonly SketchElement[], center: Point, delta: number): ElementPatches {
  return originals.map((el): [string, Partial<SketchElement>] => {
    const ec = boxCenter(getLocalBox(el));
    const nc = rotatePoint(ec, center, delta);
    return [el.id, { x: el.x + (nc[0] - ec[0]), y: el.y + (nc[1] - ec[1]), angle: normalizeAngle(el.angle + delta) }];
  });
}
