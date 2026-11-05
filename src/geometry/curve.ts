import { distance, type Point } from "./math";

type Seg = [Point, Point, Point, Point];

/**
 * Smooth curve through the points as cubic Bezier segments [start, control1, control2, end] (Catmull-Rom,
 * the same spline rough.js draws, so hit tests and arrowheads follow the visible curve).
 */
export function curveSegments(pts: readonly Point[]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    segs.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ]);
  }
  return segs;
}

/** Points along the curve (the original points are included). */
export function sampleCurve(pts: readonly Point[], perSegment = 14): Point[] {
  if (pts.length < 3) return [...pts];
  const out: Point[] = [pts[0]];
  for (const [a, b, c, d] of curveSegments(pts)) {
    for (let i = 1; i <= perSegment; i++) {
      const t = i / perSegment;
      const u = 1 - t;
      out.push([
        u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
        u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
      ]);
    }
  }
  return out;
}

export function polylineLength(pts: readonly Point[]): number {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += distance(pts[i], pts[i + 1]);
  return len;
}

/** The point halfway along the path (used to place an arrow's label). */
export function pointAtHalfLength(pts: readonly Point[]): Point {
  if (pts.length === 0) return [0, 0];
  const half = polylineLength(pts) / 2;
  let run = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = distance(pts[i], pts[i + 1]);
    if (run + seg >= half && seg > 0) {
      const t = (half - run) / seg;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t];
    }
    run += seg;
  }
  return pts[pts.length - 1];
}

/** Midpoint of a-b pushed sideways by `amount` of the length: gives a straight arrow a gentle bow when made curved. */
export function bowPoint(a: Point, b: Point, amount = 0.2): Point {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return [(a[0] + b[0]) / 2 - dy * amount, (a[1] + b[1]) / 2 + dx * amount];
}
