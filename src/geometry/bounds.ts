import { pointsBBox } from "../scene/linear";
import { isPointsElement, type SketchElement } from "../scene/types";
import { rotatePoint, type Point } from "./math";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** [x1, y1, x2, y2] */
export type Bounds = readonly [number, number, number, number];

/** The element's unrotated box in scene coordinates. For line/arrow/freedraw it is the box of the points. */
export function getLocalBox(el: SketchElement): Box {
  if (isPointsElement(el)) {
    const b = pointsBBox(el.points);
    return { x: el.x + b.minX, y: el.y + b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY };
  }
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

export const boxCenter = (b: Box): Point => [b.x + b.width / 2, b.y + b.height / 2];

export const boundsToBox = (b: Bounds): Box => ({ x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1] });
export const boxToBounds = (b: Box): Bounds => [b.x, b.y, b.x + b.width, b.y + b.height];

/** The element's vertices in scene space with rotation applied (rectangle corners, diamond tips, line points...). */
function rotatedVertices(el: SketchElement): Point[] {
  const box = getLocalBox(el);
  const c = boxCenter(box);
  if (isPointsElement(el)) return el.points.map((p) => rotatePoint([el.x + p[0], el.y + p[1]], c, el.angle));
  const corners: Point[] =
    el.type === "diamond"
      ? [
          [box.x + box.width / 2, box.y],
          [box.x + box.width, box.y + box.height / 2],
          [box.x + box.width / 2, box.y + box.height],
          [box.x, box.y + box.height / 2],
        ]
      : [
          [box.x, box.y],
          [box.x + box.width, box.y],
          [box.x + box.width, box.y + box.height],
          [box.x, box.y + box.height],
        ];
  return corners.map((p) => rotatePoint(p, c, el.angle));
}

/** Axis-aligned bounds of the element after rotation. */
export function getElementBounds(el: SketchElement): Bounds {
  const box = getLocalBox(el);
  if (el.angle === 0) return boxToBounds(box);
  if (el.type === "ellipse") {
    const a = box.width / 2;
    const b = box.height / 2;
    const cos = Math.cos(el.angle);
    const sin = Math.sin(el.angle);
    const ex = Math.hypot(a * cos, b * sin);
    const ey = Math.hypot(a * sin, b * cos);
    const [cx, cy] = boxCenter(box);
    return [cx - ex, cy - ey, cx + ex, cy + ey];
  }
  const vs = rotatedVertices(el);
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const [x, y] of vs) {
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x);
    y2 = Math.max(y2, y);
  }
  return [x1, y1, x2, y2];
}

export function getCommonBounds(els: readonly SketchElement[]): Bounds | null {
  if (els.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const el of els) {
    const b = getElementBounds(el);
    x1 = Math.min(x1, b[0]);
    y1 = Math.min(y1, b[1]);
    x2 = Math.max(x2, b[2]);
    y2 = Math.max(y2, b[3]);
  }
  return [x1, y1, x2, y2];
}

export const isPointInBox = (p: Point, b: Box, pad = 0): boolean =>
  p[0] >= b.x - pad && p[0] <= b.x + b.width + pad && p[1] >= b.y - pad && p[1] <= b.y + b.height + pad;

export const boundsContain = (outer: Bounds, inner: Bounds): boolean =>
  inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];

export const boundsOverlap = (a: Bounds, b: Bounds): boolean =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
