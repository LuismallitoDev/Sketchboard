import { isPointsElement, type SketchElement } from "../scene/types";
import { boxCenter, getLocalBox, isPointInBox } from "./bounds";
import { distanceToPolyline, distanceToSegment, pointInPolygon, rotatePoint, type Point } from "./math";

export const isFilled = (el: SketchElement): boolean => el.backgroundColor !== "transparent";

/** Does `scenePoint` hit the element? `tolerance` is in scene units (usually ~8 screen px / zoom). */
export function hitElement(el: SketchElement, scenePoint: Point, tolerance: number): boolean {
  const box = getLocalBox(el);
  const center = boxCenter(box);
  // Work in the element's own unrotated frame.
  const p = rotatePoint(scenePoint, center, -el.angle);
  const tol = tolerance + (el.type === "text" ? 0 : el.strokeWidth / 2);

  switch (el.type) {
    case "rectangle": {
      if (!isPointInBox(p, box, tol)) return false;
      if (isFilled(el)) return true;
      // Only the outline counts: inside the outer box but not inside the shrunken inner one.
      const inner =
        p[0] > box.x + tol && p[0] < box.x + box.width - tol && p[1] > box.y + tol && p[1] < box.y + box.height - tol;
      return !inner;
    }
    case "diamond": {
      const verts: Point[] = [
        [box.x + box.width / 2, box.y],
        [box.x + box.width, box.y + box.height / 2],
        [box.x + box.width / 2, box.y + box.height],
        [box.x, box.y + box.height / 2],
      ];
      if (isFilled(el) && pointInPolygon(p, verts)) return true;
      return distanceToPolyline(p, [...verts, verts[0]]) <= tol;
    }
    case "ellipse": {
      const a = box.width / 2;
      const b = box.height / 2;
      if (a <= 0 || b <= 0) return distanceToSegment(p, [box.x, box.y], [box.x + box.width, box.y + box.height]) <= tol;
      const r = Math.hypot((p[0] - center[0]) / a, (p[1] - center[1]) / b);
      const approxDist = (r - 1) * Math.min(a, b);
      return isFilled(el) ? approxDist <= tol : Math.abs(approxDist) <= tol;
    }
    case "line":
    case "arrow":
    case "freedraw": {
      if (!isPointsElement(el)) return false;
      const abs = el.points.map((pt): Point => [el.x + pt[0], el.y + pt[1]]);
      const extra = el.type === "freedraw" ? el.strokeWidth * 1.5 : 0;
      return distanceToPolyline(p, abs) <= tol + extra;
    }
    case "text":
      return isPointInBox(p, box, tol);
  }
}

/** The topmost hittable element at the point (locked and deleted elements are skipped). */
export function topElementAt(elements: readonly SketchElement[], p: Point, tolerance: number): SketchElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.isDeleted || el.locked) continue;
    if (hitElement(el, p, tolerance)) return el;
  }
  return null;
}
