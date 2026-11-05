import type { SketchElement } from "../scene/types";
import { boxCenter, getLocalBox, type Box } from "./bounds";
import { distance, distanceToSegment, pointInPolygon, rotatePoint, type Point } from "./math";

/** The outline of a rectangle, diamond or ellipse, used to attach arrows to shapes. */

/** Corners of a rectangle or diamond in the shape's own (unrotated) frame. */
function localPolygon(el: SketchElement, box: Box): Point[] {
  if (el.type === "diamond") {
    return [
      [box.x + box.width / 2, box.y],
      [box.x + box.width, box.y + box.height / 2],
      [box.x + box.width / 2, box.y + box.height],
      [box.x, box.y + box.height / 2],
    ];
  }
  return [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ];
}

/**
 * Where the ray `origin + t * dir` is inside the shape: the interval [tNear, tFar] (tNear is negative when the origin
 * is already inside). `dir` must be a unit vector. Returns null when the ray misses the shape.
 */
export function rayShapeInterval(el: SketchElement, origin: Point, dir: Point): [number, number] | null {
  const box = getLocalBox(el);
  const c = boxCenter(box);
  const o = rotatePoint(origin, c, -el.angle);
  const d = rotatePoint(dir, [0, 0], -el.angle);

  if (el.type === "ellipse") {
    const a = box.width / 2;
    const b = box.height / 2;
    if (a <= 0 || b <= 0) return null;
    const ox = (o[0] - c[0]) / a;
    const oy = (o[1] - c[1]) / b;
    const dx = d[0] / a;
    const dy = d[1] / b;
    const A = dx * dx + dy * dy;
    const B = 2 * (ox * dx + oy * dy);
    const C = ox * ox + oy * oy - 1;
    const disc = B * B - 4 * A * C;
    if (A === 0 || disc < 0) return null;
    const s = Math.sqrt(disc);
    return [(-B - s) / (2 * A), (-B + s) / (2 * A)];
  }

  // Convex polygon: clip the ray against each edge's half-plane (Cyrus-Beck).
  const poly = localPolygon(el, box);
  let tNear = -Infinity;
  let tFar = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i];
    const p1 = poly[(i + 1) % poly.length];
    let n: Point = [-(p1[1] - p0[1]), p1[0] - p0[0]];
    if (n[0] * (c[0] - p0[0]) + n[1] * (c[1] - p0[1]) < 0) n = [-n[0], -n[1]]; // make it point inwards
    const denom = n[0] * d[0] + n[1] * d[1];
    const num = n[0] * (p0[0] - o[0]) + n[1] * (p0[1] - o[1]);
    if (Math.abs(denom) < 1e-12) {
      if (num > 0) return null; // parallel to this edge and outside it
      continue;
    }
    const t = num / denom;
    if (denom > 0) tNear = Math.max(tNear, t);
    else tFar = Math.min(tFar, t);
  }
  return tNear <= tFar ? [tNear, tFar] : null;
}

/** How far the point is outside the shape's outline (0 when it is inside). */
export function distanceOutsideShape(el: SketchElement, p: Point): number {
  const box = getLocalBox(el);
  const c = boxCenter(box);
  const q = rotatePoint(p, c, -el.angle);
  if (el.type === "ellipse") {
    const a = box.width / 2;
    const b = box.height / 2;
    if (a <= 0 || b <= 0) return distance(q, c);
    const r = Math.hypot((q[0] - c[0]) / a, (q[1] - c[1]) / b);
    if (r <= 1) return 0;
    const onOutline: Point = [c[0] + (q[0] - c[0]) / r, c[1] + (q[1] - c[1]) / r];
    return distance(q, onOutline);
  }
  const poly = localPolygon(el, box);
  if (pointInPolygon(q, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, distanceToSegment(q, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

/** The middle of each side (top, right, bottom, left) in scene coordinates. */
export function sideMidpoints(el: SketchElement): Point[] {
  const box = getLocalBox(el);
  const c = boxCenter(box);
  const pts: Point[] = [
    [c[0], box.y],
    [box.x + box.width, c[1]],
    [c[0], box.y + box.height],
    [box.x, c[1]],
  ];
  return pts.map((p) => rotatePoint(p, c, el.angle));
}
