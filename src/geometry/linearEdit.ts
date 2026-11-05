import { linearPatchFromAbs } from "../scene/linear";
import type { LinearElement, Pt } from "../scene/types";
import { curveSegments } from "./curve";
import { distance, type Point } from "./math";

export const POINT_HANDLE_RADIUS = 9; // screen px
export const MID_HANDLE_RADIUS = 7;

const isCurved = (el: LinearElement) => el.arrowType === "round" && el.points.length >= 3 && !el.polygon;

const abs = (el: LinearElement): Point[] => el.points.map((p): Point => [el.x + p[0], el.y + p[1]]);

/** Drag handles of a line in point-editing mode: the vertices, and a midpoint between each pair to insert a new one. */
export function linearHandles(el: LinearElement): { points: Point[]; mids: Point[] } {
  const pts = abs(el);
  const mids: Point[] = [];
  const segs = isCurved(el) ? curveSegments(pts) : null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (segs) {
      // The Bezier curve at t = 0.5.
      const [a, b, c, d] = segs[i];
      mids.push([
        0.125 * a[0] + 0.375 * b[0] + 0.375 * c[0] + 0.125 * d[0],
        0.125 * a[1] + 0.375 * b[1] + 0.375 * c[1] + 0.125 * d[1],
      ]);
    } else {
      mids.push([(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]);
    }
  }
  // The closing point of a polygon is the same handle as its first point.
  return { points: el.polygon ? pts.slice(0, -1) : pts, mids };
}

export type LinearHit = { kind: "point"; index: number } | { kind: "mid"; index: number };

/** Which handle is under the point (vertices win over midpoints). `index` of a midpoint is the vertex before it. */
export function hitLinearHandle(el: LinearElement, p: Point, zoom: number): LinearHit | null {
  const { points, mids } = linearHandles(el);
  for (let i = 0; i < points.length; i++) if (distance(p, points[i]) <= POINT_HANDLE_RADIUS / zoom) return { kind: "point", index: i };
  for (let i = 0; i < mids.length; i++) if (distance(p, mids[i]) <= MID_HANDLE_RADIUS / zoom) return { kind: "mid", index: i };
  return null;
}

/** A polygon repeats its first point at the end; moving or removing one of the pair must affect both. */
function withPolygonPair(el: LinearElement, indices: readonly number[]): number[] {
  const set = new Set(indices);
  if (el.polygon) {
    const last = el.points.length - 1;
    if (set.has(0)) set.add(last);
    if (set.has(last)) set.add(0);
  }
  return [...set].sort((a, b) => a - b);
}

/** Patch that moves the given vertices by (dx, dy) from the given original element. */
export function movePointsPatch(el: LinearElement, indices: readonly number[], dx: number, dy: number) {
  const moving = new Set(withPolygonPair(el, indices));
  const pts = abs(el).map((p, i): Point => (moving.has(i) ? [p[0] + dx, p[1] + dy] : p));
  return linearPatchFromAbs(pts);
}

/** Patch that inserts a new vertex after `index` at scene position `at`. */
export function insertPointPatch(el: LinearElement, index: number, at: Point) {
  const pts = abs(el);
  pts.splice(index + 1, 0, [at[0], at[1]]);
  return linearPatchFromAbs(pts);
}

/** Patch that removes vertices, or null when too few would remain (two for a line, a triangle for a polygon). */
export function removePointsPatch(el: LinearElement, indices: readonly number[]) {
  const remove = new Set(withPolygonPair(el, indices));
  let pts = abs(el);
  if (el.polygon) {
    const ring = pts.slice(0, -1).filter((_, i) => !remove.has(i));
    if (ring.length < 3) return null;
    pts = [...ring, ring[0]];
  } else {
    pts = pts.filter((_, i) => !remove.has(i));
    if (pts.length < 2) return null;
  }
  return linearPatchFromAbs(pts);
}

/** Absolute vertices (closing duplicate included) as plain points. */
export const linearAbsPoints = (el: LinearElement): Pt[] => el.points.map((p): Pt => [el.x + p[0], el.y + p[1]]);
