import { distance, distanceToSegment, type Point } from "./math";

/** What a hand-drawn stroke was meant to be. */
export type Recognized =
  | { kind: "rectangle" | "ellipse" | "diamond"; box: { x: number; y: number; width: number; height: number } }
  | { kind: "line" | "arrow"; points: Point[] }
  | { kind: "polygon"; points: Point[] };

const pathLength = (pts: readonly Point[]): number => {
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) len += distance(pts[i], pts[i + 1]);
  return len;
};

function bounds(pts: readonly Point[]) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const [x, y] of pts) {
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x);
    y2 = Math.max(y2, y);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

const maxDeviation = (pts: readonly Point[], a: Point, b: Point): number => pts.reduce((m, p) => Math.max(m, distanceToSegment(p, a, b)), 0);

/** Douglas-Peucker: the fewest points that keep the polyline within `eps` of the original. */
export function simplifyPolyline(pts: readonly Point[], eps: number): Point[] {
  if (pts.length < 3) return [...pts];
  const a = pts[0];
  const b = pts[pts.length - 1];
  let worst = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distanceToSegment(pts[i], a, b);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= eps) return [a, b];
  return [...simplifyPolyline(pts.slice(0, at + 1), eps).slice(0, -1), ...simplifyPolyline(pts.slice(at), eps)];
}

/** Simplifies a closed loop. It is cut at the point farthest from the start, as the start may lie mid-edge. */
function simplifyLoop(pts: readonly Point[], eps: number): Point[] {
  let far = 0;
  let farD = 0;
  pts.forEach((p, i) => {
    const d = distance(p, pts[0]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  });
  const a = simplifyPolyline(pts.slice(0, far + 1), eps);
  const b = simplifyPolyline([...pts.slice(far), pts[0]], eps);
  return [...a, ...b.slice(1, -1)];
}

const turning = (a: Point, b: Point, c: Point): number => {
  const v1: Point = [b[0] - a[0], b[1] - a[1]];
  const v2: Point = [c[0] - b[0], c[1] - b[1]];
  return (Math.abs(Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1])) * 180) / Math.PI;
};

/** Merges corners that are too close together and drops vertices where the outline hardly turns. */
function cleanLoop(loop: readonly Point[], minEdge: number): Point[] {
  const r = [...loop];
  for (;;) {
    const n = r.length;
    if (n <= 3) return r;
    const near = r.findIndex((p, i) => distance(p, r[(i + 1) % n]) < minEdge);
    if (near >= 0) {
      const q = r[(near + 1) % n];
      r.splice(near, 1, [(r[near][0] + q[0]) / 2, (r[near][1] + q[1]) / 2]);
      r.splice((near + 1) % n > near ? near + 1 : 0, 1);
      continue;
    }
    let flattest = -1;
    let angle = Infinity;
    r.forEach((p, i) => {
      const t = turning(r[(i + n - 1) % n], p, r[(i + 1) % n]);
      if (t < angle) {
        angle = t;
        flattest = i;
      }
    });
    if (angle >= 25) return r;
    r.splice(flattest, 1);
  }
}

const loopArea = (loop: readonly Point[]): number => {
  let a = 0;
  loop.forEach((p, i) => {
    const q = loop[(i + 1) % loop.length];
    a += p[0] * q[1] - q[0] * p[1];
  });
  return Math.abs(a) / 2;
};

function closedShape(pts: readonly Point[], bb: ReturnType<typeof bounds>): Recognized | null {
  const diag = Math.hypot(bb.width, bb.height);
  const loop = cleanLoop(simplifyLoop(pts, Math.max(4, 0.05 * diag)), 0.12 * diag);
  const cx = bb.x + bb.width / 2;
  const cy = bb.y + bb.height / 2;

  if (loop.length === 3) return { kind: "polygon", points: loop };

  if (loop.length === 4) {
    // Every edge close to horizontal or vertical: a rectangle.
    const axisAligned = loop.every((p, i) => {
      const q = loop[(i + 1) % 4];
      const a = (Math.abs(Math.atan2(q[1] - p[1], q[0] - p[0])) * 180) / Math.PI;
      const m = a % 90;
      return Math.min(m, 90 - m) <= 20;
    });
    if (axisAligned) return { kind: "rectangle", box: bb };
    // Corners at the middles of the sides of its bounding box: a diamond.
    const mids: Point[] = [
      [cx, bb.y],
      [bb.x + bb.width, cy],
      [cx, bb.y + bb.height],
      [bb.x, cy],
    ];
    const reach = 0.25 * Math.min(bb.width, bb.height);
    if (mids.every((m) => loop.some((p) => distance(p, m) <= reach))) return { kind: "diamond", box: bb };
    return { kind: "polygon", points: loop };
  }

  // Many corners: a smooth loop around the box centre is an ellipse; a squarish one with rounded corners a rectangle.
  const a = bb.width / 2;
  const b = bb.height / 2;
  if (a > 0 && b > 0) {
    const radii = pts.map((p) => Math.hypot((p[0] - cx) / a, (p[1] - cy) / b));
    const mean = radii.reduce((s, v) => s + v, 0) / radii.length;
    const std = Math.sqrt(radii.reduce((s, v) => s + (v - mean) ** 2, 0) / radii.length);
    if (mean >= 0.88 && mean <= 1.12 && std <= 0.1) return { kind: "ellipse", box: bb };
  }
  if (loopArea(loop) >= 0.88 * bb.width * bb.height) return { kind: "rectangle", box: bb };
  return null;
}

function openShape(pts: readonly Point[], len: number): Recognized | null {
  const first = pts[0];
  const last = pts[pts.length - 1];
  const chord = distance(first, last);
  if (chord >= 0.85 * len && maxDeviation(pts, first, last) <= 0.07 * chord) return { kind: "line", points: [first, last] };

  // A straight shaft with a short hook at its far end: an arrow pointing at the end of the shaft.
  let tipAt = 0;
  let reach = 0;
  pts.forEach((p, i) => {
    const d = distance(first, p);
    if (d > reach) {
      reach = d;
      tipAt = i;
    }
  });
  const tip = pts[tipAt];
  const tail = pts.slice(tipAt);
  const tailLen = pathLength(tail);
  const tailReach = tail.reduce((m, p) => Math.max(m, distance(p, tip)), 0);
  if (
    tipAt < pts.length - 1 &&
    reach >= 0.6 * len &&
    maxDeviation(pts.slice(0, tipAt + 1), first, tip) <= 0.07 * reach &&
    tailLen >= 0.08 * reach &&
    tailLen <= 1.2 * reach &&
    tailReach <= 0.4 * reach
  ) {
    return { kind: "arrow", points: [first, tip] };
  }
  return null;
}

/**
 * Works out which clean shape a freehand stroke was meant to be: a straight line, an arrow (a line ending in a
 * hook), a triangle or other polygon, a rectangle, a diamond or an ellipse. Returns null for anything else, so the
 * stroke stays as drawn.
 */
export function recognizeShape(raw: readonly Point[]): Recognized | null {
  const pts: Point[] = [];
  for (const p of raw) if (pts.length === 0 || distance(p, pts[pts.length - 1]) >= 0.5) pts.push(p);
  if (pts.length < 4) return null;
  const bb = bounds(pts);
  const len = pathLength(pts);
  if (len < 30 || Math.hypot(bb.width, bb.height) < 20) return null;
  // A loop that nearly meets itself is a closed shape; anything else is open.
  return distance(pts[0], pts[pts.length - 1]) <= 0.2 * len ? closedShape(pts, bb) : openShape(pts, len);
}
