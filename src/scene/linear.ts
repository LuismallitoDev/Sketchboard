import type { Pt } from "./types";

type PtLike = readonly [number, number];

export function pointsBBox(points: readonly PtLike[]) {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = points[0][0];
  let maxX = minX;
  let minY = points[0][1];
  let maxY = minY;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

/** New points for a points-element (relative to x, y) with a size that matches their bounding box. */
export function linearPatch(points: Pt[]) {
  const b = pointsBBox(points);
  return { points, width: b.maxX - b.minX, height: b.maxY - b.minY };
}

/** Patch from absolute scene points: the first point becomes the element origin. */
export function linearPatchFromAbs(abs: readonly PtLike[]) {
  const ox = abs[0][0];
  const oy = abs[0][1];
  const points = abs.map((p): Pt => [p[0] - ox, p[1] - oy]);
  return { x: ox, y: oy, ...linearPatch(points) };
}
